/**
 * Frame Art Cloud Server — composition root.
 *
 * This file wires together middleware, route modules, WebSocket handlers,
 * and error handling. Business logic lives in the route modules under routes/.
 */
import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPairingCode,
  getSessionByTvId,
  cleanExpired,
} from "./pairing.js";
import {
  addTvConnection,
  removeTvConnection,
  addPhoneConnection,
  removePhoneConnection,
  sendToTv,
  sendToPhone,
} from "./tv-connections.js";
import { claimCode } from "./pairing.js";
import { cleanExpiredSessions } from "./auth.js";
import { initDatabase } from "./db.js";

// Route modules
import authRoutes from "./routes/auth.js";
import deviceRoutes from "./routes/devices.js";
import generationRoutes from "./routes/generation.js";
import pairingRoutes from "./routes/pairing.js";
import tvControlRoutes from "./routes/tv-control.js";
import { createTelemetryRouter } from "./routes/telemetry.js";
import feedbackRoutes from "./routes/feedback.js";
import quotesRoutes from "./routes/quotes.js";

// Load .env
import { logger } from "./logger.js";
import { config } from "dotenv";
config({ path: new URL("../.env", import.meta.url).pathname });

// Initialize database before anything else
initDatabase();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3847");
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:3847";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

const app = express();

// --- CORS: restrict to known origins (ALLOWED_ORIGINS env, or CLOUD_URL) ---
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [CLOUD_URL, "http://localhost:3847", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  }),
);

// --- Rate Limiting: 200 requests per minute per IP ---
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// --- Request logging ---
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, "Request");
  next();
});

// --- Static pages ---
app.get("/", (_req, res) => res.redirect("/pair"));
app.get("/pair", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "pair.html")),
);
app.get("/pairip", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "pairip.html")),
);
app.get("/gallery", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "gallery.html")),
);
app.get("/studio", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "studio.html")),
);
app.get("/controls", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "controls.html")),
);
app.get("/api/ping", (_req, res) =>
  res.json({ pong: true, time: new Date().toISOString() }),
);
app.get("/api/config", (_req, res) =>
  res.json({ googleClientId: GOOGLE_CLIENT_ID }),
);

// --- Mount route modules ---
app.use(authRoutes);
app.use(deviceRoutes);
app.use(generationRoutes);
app.use(pairingRoutes);
app.use(tvControlRoutes);
app.use(createTelemetryRouter(path.join(__dirname, "public")));
app.use(feedbackRoutes);
app.use(quotesRoutes);

// --- WebSocket handling ---

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const pathname = url.pathname;

  if (pathname === "/ws/tv" || pathname === "/ws/phone") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, pathname);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws: WebSocket, _request: unknown, pathname: string) => {
  if (pathname === "/ws/tv") {
    handleTvConnection(ws);
  } else if (pathname === "/ws/phone") {
    handlePhoneConnection(ws);
  }
});

function handleTvConnection(ws: WebSocket) {
  let tvId: string | null = null;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "register") {
        tvId = msg.tvId;
        const tvIp = msg.tvIp || "unknown";
        const code = createPairingCode(tvId!, tvIp);
        addTvConnection(tvId!, tvIp, code, ws);

        logger.info({ tvId, tvIp, code }, "TV registered");

        ws.send(
          JSON.stringify({
            type: "pairing_code",
            code,
            expiresIn: 3600,
          }),
        );
      }

      if (msg.type === "art_status") {
        logger.info({ tvId, status: msg }, "TV art status");
        if (tvId) {
          const session = getSessionByTvId(tvId);
          if (session?.phoneSessionId) {
            sendToPhone(session.phoneSessionId, {
              type: "tv_status",
              ...msg,
            });
          }
        }
      }
    } catch (err) {
      logger.error({ error: err }, "TV message parse error");
    }
  });

  ws.on("close", () => {
    if (tvId) {
      logger.info({ tvId }, "TV disconnected");
      removeTvConnection(tvId);
    }
  });
}

function handlePhoneConnection(ws: WebSocket) {
  const sessionId = crypto.randomUUID();
  addPhoneConnection(sessionId, ws);

  ws.send(JSON.stringify({ type: "session", sessionId }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "pair") {
        const session = claimCode(msg.code, sessionId);
        if (session) {
          ws.send(
            JSON.stringify({
              type: "paired",
              tvId: session.tvId,
              tvIp: session.tvIp,
            }),
          );
          sendToTv(session.tvId, {
            type: "paired",
            phoneSessionId: sessionId,
          });
        } else {
          ws.send(
            JSON.stringify({
              type: "pair_error",
              error:
                "Invalid or expired code. Open the TV app to get a new code.",
            }),
          );
        }
      }
    } catch (err) {
      logger.error({ error: err }, "Phone message parse error");
    }
  });

  ws.on("close", () => {
    removePhoneConnection(sessionId);
  });
}

// --- Global Error Handling ---

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error(
      { error: err.message, stack: err.stack },
      "Unhandled route error",
    );
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        ...(process.env.NODE_ENV !== "production" && {
          detail: err.message,
        }),
      });
    }
  },
);

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ error: reason, promise }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.error(
    { error: err.message, stack: err.stack },
    "FATAL: Uncaught exception",
  );
  process.exit(1);
});

// --- Periodic cleanup (every hour) ---
setInterval(
  () => {
    cleanExpired();
    cleanExpiredSessions();
  },
  60 * 60 * 1000,
);

// --- Start ---
server.listen(PORT, () => {
  logger.info({ port: PORT, url: CLOUD_URL }, "Frame Art Cloud Server started");
});
