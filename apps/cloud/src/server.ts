import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPairingCode,
  claimCode,
  validateCode,
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
  getTvIp,
} from "./tv-connections.js";
import { uploadToTv, selectAndActivate } from "./tv-upload.js";
import {
  verifyGoogleToken,
  createSession,
  getSession,
  optionalAuth,
  requireAuth,
} from "./auth.js";
import {
  initTvState,
  makeRoom,
  recordUpload,
  handleStorageFull,
} from "./tv-storage.js";

// Load .env
import { config } from "dotenv";
config({ path: new URL("../.env", import.meta.url).pathname });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3847");
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:3847";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// --- HTTP API ---

// Log all requests
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get("/", (_req, res) => {
  res.redirect("/pair");
});

// --- Auth Routes ---

app.post("/api/auth/google", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    res.status(400).json({ error: "Missing idToken" });
    return;
  }

  const user = await verifyGoogleToken(idToken);
  if (!user) {
    res.status(401).json({ error: "Invalid Google token" });
    return;
  }

  const sessionId = createSession(user);
  console.log(`User signed in: ${user.name} (${user.email})`);

  res.json({
    sessionId,
    user: {
      id: user.userId,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
  });
});

app.get("/api/auth/me", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const session = getSession(auth.substring(7));
  if (!session) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  res.json({
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
  });
});

// --- Device Registry ---

// In-memory device store (will move to DB)
const deviceRegistry = new Map<string, Record<string, unknown>>();

app.get("/api/devices", optionalAuth, (_req, res) => {
  res.json(Array.from(deviceRegistry.values()));
});

app.get("/api/devices/:tvId", (req, res) => {
  const device = deviceRegistry.get(req.params.tvId);
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(device);
});

/** Fetch and store full device metadata from TV */
app.post("/api/devices/scan", async (req, res) => {
  const { tvIp } = req.body;
  if (!tvIp) {
    res.status(400).json({ error: "Missing tvIp" });
    return;
  }

  try {
    // Fetch REST API info
    const apiRes = await fetch(`http://${tvIp}:8001/api/v2/`, {
      signal: AbortSignal.timeout(5000),
    });
    const apiData = (await apiRes.json()) as any;
    const device = apiData.device || {};

    const metadata: Record<string, unknown> = {
      tvIp,
      scannedAt: new Date().toISOString(),
      modelName: device.modelName,
      modelCode: device.model,
      name: device.name,
      isFrameTV: device.FrameTVSupport === "true",
      powerState: device.PowerState,
      firmwareVersion: device.firmwareVersion,
      resolution: device.resolution,
      networkType: device.networkType,
      wifiMac: device.wifiMac,
      duid: device.duid || device.id,
      developerMode: device.developerMode,
      countryCode: device.countryCode,
      language: device.Language,
      // Extract year from model code (e.g., "20_NIKEM_FRAME" → 2020)
      yearPrefix: device.model?.substring(0, 2),
      estimatedYear: device.model
        ? 2000 + parseInt(device.model.substring(0, 2))
        : null,
    };

    // Store in registry
    const tvId = `frame-${device.wifiMac?.replace(/:/g, "").slice(-6) || tvIp}`;
    metadata.tvId = tvId;
    deviceRegistry.set(tvId, metadata);

    console.log(
      `Device scanned: ${metadata.modelName} (${metadata.estimatedYear}) at ${tvIp}`,
    );
    res.json(metadata);
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

app.get("/api/ping", (_req, res) => {
  res.json({ pong: true, time: new Date().toISOString() });
});

app.get("/api/config", (_req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

app.get("/pair", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "pair.html"));
});

app.post("/api/pair", (req, res) => {
  const { code, phoneSessionId } = req.body;
  if (!code || !phoneSessionId) {
    res.status(400).json({ error: "Missing code or phoneSessionId" });
    return;
  }

  const session = claimCode(code, phoneSessionId);
  if (!session) {
    res.status(404).json({ error: "Invalid or expired code" });
    return;
  }

  console.log(
    `Paired! TV ${session.tvId} (${session.tvIp}) ↔ phone ${phoneSessionId}`,
  );

  // Notify the TV that pairing succeeded
  sendToTv(session.tvId, {
    type: "paired",
    phoneSessionId,
    message: "Your TV is now linked!",
  });

  res.json({
    success: true,
    tvId: session.tvId,
    tvIp: session.tvIp,
  });
});

app.get("/api/pair/status/:code", (req, res) => {
  const session = validateCode(req.params.code);
  if (!session) {
    res.status(404).json({ error: "Invalid or expired code" });
    return;
  }
  res.json({
    code: session.code,
    paired: !!session.pairedAt,
    tvId: session.tvId,
  });
});

/** Upload art to a paired TV — cloud server acts as upload bridge */
app.post("/api/upload", async (req, res) => {
  const { tvId, imageUrl, tvIp: explicitIp } = req.body;
  if (!tvId) {
    res.status(400).json({ error: "Missing tvId" });
    return;
  }

  const tvIp = explicitIp || getTvIp(tvId);
  if (!tvIp || tvIp === "unknown") {
    res.status(404).json({ error: "TV IP not known. Pass tvIp in request." });
    return;
  }

  try {
    // If imageUrl provided, fetch the image; otherwise use test image
    let imageData: Buffer;
    if (imageUrl) {
      const response = await fetch(imageUrl);
      imageData = Buffer.from(await response.arrayBuffer());
    } else {
      // Use Don Claude as default test image
      const fs = await import("fs");
      const testPath = "/tmp/tv-test/don-claude.jpg";
      if (fs.existsSync(testPath)) {
        imageData = fs.readFileSync(testPath);
      } else {
        res
          .status(400)
          .json({ error: "No image provided and no test image found" });
        return;
      }
    }

    // Ensure storage space before uploading
    await makeRoom(tvIp, 1);

    console.log(`Uploading ${imageData.length} bytes to TV at ${tvIp}...`);
    let result = await uploadToTv(tvIp, imageData);

    // Handle storage full — clean up and retry once
    if (!result.success && result.error?.includes("-11")) {
      console.log("Storage full! Cleaning up and retrying...");
      await handleStorageFull(tvIp);
      result = await uploadToTv(tvIp, imageData);
    }

    if (result.success && result.contentId) {
      console.log(`Upload success! content_id: ${result.contentId}`);
      recordUpload(tvIp, result.contentId);

      // Tell the TV app to select this image
      sendToTv(tvId, {
        type: "new_art",
        contentId: result.contentId,
        message: "Fresh art from Don Claude!",
      });

      // Also set it as active and turn on art mode
      await selectAndActivate(tvIp, result.contentId);

      res.json({
        success: true,
        contentId: result.contentId,
        durationMs: result.durationMs,
      });
    } else {
      console.error("Upload failed:", result.error);
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Upload error:", message);
    res.status(500).json({ error: message });
  }
});

/** Initialize TV state — scans storage, detects capacity */
app.post("/api/tv/init", async (req, res) => {
  const { tvIp } = req.body;
  if (!tvIp) {
    res.status(400).json({ error: "Missing tvIp" });
    return;
  }
  try {
    const state = await initTvState(tvIp);
    res.json({
      flashSizeGB: state.flashSizeGB,
      maxImages: state.maxImages,
      currentImages: state.ourImages.length,
      imageIds: state.ourImages,
    });
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

/** Upload a specific image file to TV */
app.post("/api/upload-file", async (req, res) => {
  const { tvIp, filePath } = req.body;
  if (!tvIp || !filePath) {
    res.status(400).json({ error: "Missing tvIp or filePath" });
    return;
  }
  try {
    const fs = await import("fs");
    const imageData = fs.readFileSync(filePath);
    console.log(
      `Uploading ${filePath} (${imageData.length} bytes) to ${tvIp}...`,
    );
    const result = await uploadToTv(tvIp, imageData);
    if (result.success) {
      await selectAndActivate(tvIp, result.contentId!);
    }
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/** Cycle through images on a timer */
let cycleTimer: ReturnType<typeof setInterval> | null = null;

app.post("/api/cycle", async (req, res) => {
  const { tvIp, images, intervalMs } = req.body;
  if (!tvIp || !images || !images.length) {
    res.status(400).json({ error: "Missing tvIp or images array" });
    return;
  }

  // Stop any existing cycle
  if (cycleTimer) clearInterval(cycleTimer);

  let idx = 0;
  const interval = intervalMs || 30000; // default 30 seconds for demo

  console.log(
    `Starting art cycle: ${images.length} images, ${interval}ms interval`,
  );

  // Upload and show first image immediately
  async function showNext() {
    const filePath = images[idx % images.length];
    try {
      const fs = await import("fs");
      const imageData = fs.readFileSync(filePath);
      console.log(`Cycle [${idx + 1}/${images.length}]: ${filePath}`);
      const result = await uploadToTv(tvIp, imageData);
      if (result.success && result.contentId) {
        await selectAndActivate(tvIp, result.contentId);
        console.log(`  → ${result.contentId} (${result.durationMs}ms)`);
      }
    } catch (err) {
      console.error(`Cycle error:`, err);
    }
    idx++;
  }

  await showNext();
  cycleTimer = setInterval(showNext, interval);

  res.json({ success: true, imageCount: images.length, intervalMs: interval });
});

app.post("/api/cycle/stop", (_req, res) => {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
    console.log("Art cycle stopped");
    res.json({ success: true, message: "Cycle stopped" });
  } else {
    res.json({ success: true, message: "No cycle running" });
  }
});

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
        const code = createPairingCode(tvId, tvIp);
        addTvConnection(tvId, tvIp, code, ws);

        console.log(`TV registered: ${tvId} (${tvIp}) — pairing code: ${code}`);

        ws.send(
          JSON.stringify({
            type: "pairing_code",
            code,
            expiresIn: 3600,
          }),
        );
      }

      if (msg.type === "art_status") {
        console.log(`TV ${tvId} art status:`, msg);
        // Forward to paired phone if connected
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
      console.error("TV message parse error:", err);
    }
  });

  ws.on("close", () => {
    if (tvId) {
      console.log(`TV disconnected: ${tvId}`);
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
          // Notify TV
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
      console.error("Phone message parse error:", err);
    }
  });

  ws.on("close", () => {
    removePhoneConnection(sessionId);
  });
}

// Cleanup timer
setInterval(cleanExpired, 60 * 60 * 1000);

// Start
server.listen(PORT, () => {
  console.log(`\n🎨 Frame Art Cloud Server`);
  console.log(`   HTTP:  ${CLOUD_URL}`);
  console.log(`   WS TV: ${CLOUD_URL.replace("http", "ws")}/ws/tv`);
  console.log(`   WS Phone: ${CLOUD_URL.replace("http", "ws")}/ws/phone`);
  console.log(`   Pair:  ${CLOUD_URL}/pair`);
  console.log(`   Port:  ${PORT}\n`);
});
