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
import { pickQuote, getQuoteCategories, getQuoteStats } from "./quotes.js";
import {
  generate,
  loadImage,
  getGenerationConfig,
  getUserSettings,
  updateUserSettings,
} from "./generation.js";
import {
  verifyGoogleToken,
  createSession,
  getSession,
  optionalAuth,
  requireAuth,
  cleanExpiredSessions,
} from "./auth.js";
import {
  initTvState,
  makeRoom,
  recordUpload,
  handleStorageFull,
} from "./tv-storage.js";
import { initDatabase, getRawDb } from "./db.js";

// Load .env
import { config } from "dotenv";
config({ path: new URL("../.env", import.meta.url).pathname });

// Initialize database before anything else
initDatabase();

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

// --- Device Registry (persisted to SQLite) ---

app.get("/api/devices", optionalAuth, (_req, res) => {
  const db = getRawDb();
  const devices = db
    .prepare("SELECT * FROM tv_devices ORDER BY last_seen_at DESC")
    .all();
  res.json(devices);
});

app.get("/api/devices/:tvId", (req, res) => {
  const db = getRawDb();
  const device = db
    .prepare("SELECT * FROM tv_devices WHERE id = ?")
    .get(req.params.tvId);
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

    // Persist to database
    const tvId = `frame-${device.wifiMac?.replace(/:/g, "").slice(-6) || tvIp}`;
    metadata.tvId = tvId;
    const now = new Date().toISOString();

    const db = getRawDb();
    db.prepare(
      `INSERT INTO tv_devices (id, tv_ip, model_name, model_code, name, resolution, is_frame_tv, firmware_version, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         tv_ip = excluded.tv_ip,
         model_name = excluded.model_name,
         firmware_version = excluded.firmware_version,
         last_seen_at = excluded.last_seen_at`,
    ).run(
      tvId,
      tvIp,
      device.modelName,
      device.model,
      device.name,
      device.resolution,
      device.FrameTVSupport === "true" ? 1 : 0,
      device.firmwareVersion,
      now,
    );

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

// --- Feedback (persisted to SQLite) ---

app.post("/api/feedback", optionalAuth, (req, res) => {
  const { tvId, contentId, rating } = req.body;
  if (!tvId || !contentId || !rating) {
    res.status(400).json({ error: "Missing tvId, contentId, or rating" });
    return;
  }
  const userId = (req as any).user?.userId;
  const db = getRawDb();
  db.prepare(
    "INSERT INTO feedback (tv_id, content_id, rating, user_id, timestamp) VALUES (?, ?, ?, ?, ?)",
  ).run(tvId, contentId, rating, userId || null, new Date().toISOString());

  const count = db.prepare("SELECT COUNT(*) as cnt FROM feedback").get() as {
    cnt: number;
  };
  console.log(
    `Feedback: ${rating} on ${contentId} for TV ${tvId} by ${userId || "anonymous"}`,
  );
  res.json({ success: true, totalFeedback: count.cnt });
});

app.get("/api/feedback/:tvId", (req, res) => {
  const db = getRawDb();
  const rows = db
    .prepare("SELECT * FROM feedback WHERE tv_id = ? ORDER BY timestamp DESC")
    .all(req.params.tvId);
  res.json(rows);
});

// --- Generation ---

app.get("/api/generation/config", (_req, res) => {
  res.json(getGenerationConfig());
});

app.post("/api/generate", optionalAuth, async (req, res) => {
  const {
    theme,
    imageStyle,
    provider,
    overlays,
    tvId,
    tvIp: explicitIp,
  } = req.body;
  const userId = (req as any).user?.userId;

  try {
    console.log(
      `Generation request: theme=${theme}, style=${imageStyle}, provider=${provider}`,
    );
    const result = await generate({
      userId,
      theme,
      imageStyle,
      provider,
      overlays,
    });

    // If tvId/tvIp provided, also upload to TV
    let uploadResult = null;
    const tvIp = explicitIp || (tvId ? getTvIp(tvId) : null);
    if (tvIp && tvIp !== "unknown") {
      console.log(`Auto-uploading to TV at ${tvIp}...`);
      await makeRoom(tvIp, 1);
      const upload = await uploadToTv(tvIp, result.imageData);
      if (upload.success && upload.contentId) {
        recordUpload(tvIp, upload.contentId);
        await selectAndActivate(tvIp, upload.contentId);
        uploadResult = {
          contentId: upload.contentId,
          durationMs: upload.durationMs,
        };
        if (tvId) {
          sendToTv(tvId, { type: "new_art", contentId: upload.contentId });
        }
      }
    }

    // Persist to gallery database
    const db = getRawDb();
    db.prepare(
      `INSERT INTO scene_archive (id, prompt, context_json, duration_ms, provider, image_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      result.sceneId,
      result.prompt,
      JSON.stringify(result.context),
      result.durationMs,
      result.provider,
      `/api/images/${result.sceneId}`,
      new Date().toISOString(),
    );

    res.json({
      sceneId: result.sceneId,
      prompt: result.prompt,
      context: result.context,
      durationMs: result.durationMs,
      provider: result.provider,
      imageUrl: `/api/images/${result.sceneId}`,
      upload: uploadResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("Generation error:", message);
    res.status(500).json({ error: message });
  }
});

app.get("/api/scenes", (_req, res) => {
  const db = getRawDb();
  const rows = db
    .prepare("SELECT * FROM scene_archive ORDER BY created_at DESC")
    .all();
  res.json(rows);
});

app.get("/api/images/:sceneId", async (req, res) => {
  const data = await loadImage(req.params.sceneId);
  if (!data) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(data);
});

// --- User Settings ---

app.get("/api/settings", optionalAuth, (req, res) => {
  const userId = (req as any).user?.userId || "default";
  res.json(getUserSettings(userId));
});

app.post("/api/settings", optionalAuth, (req, res) => {
  const userId = (req as any).user?.userId || "default";
  updateUserSettings(userId, req.body);
  res.json({ success: true });
});

// --- Quotes ---

app.get("/api/quotes/categories", (_req, res) => {
  res.json(getQuoteCategories());
});

app.get("/api/quotes/pick", (req, res) => {
  const category = (req.query.category as string) || "random";
  res.json(pickQuote(category));
});

app.get("/api/quotes/stats", (_req, res) => {
  res.json(getQuoteStats());
});

// --- Telemetry (persisted to SQLite, capped at 2000 entries) ---

const TELEMETRY_MAX_ENTRIES = 2000;

app.post("/api/telemetry", (req, res) => {
  const { deviceId, sessionId, tvIp, screen, timestamp, logs } = req.body;
  const receivedAt = new Date().toISOString();
  const trimmedLogs = (logs || []).slice(-200);

  const db = getRawDb();
  const result = db
    .prepare(
      `INSERT INTO telemetry_entries (device_id, session_id, tv_ip, screen, timestamp, logs, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      deviceId || "unknown",
      sessionId || "unknown",
      tvIp || "",
      screen || "",
      timestamp || receivedAt,
      JSON.stringify(trimmedLogs),
      receivedAt,
    );

  // Cap total entries to prevent unbounded growth
  db.prepare(
    `DELETE FROM telemetry_entries WHERE id NOT IN (
       SELECT id FROM telemetry_entries ORDER BY received_at DESC LIMIT ?
     )`,
  ).run(TELEMETRY_MAX_ENTRIES);

  console.log(
    `Telemetry: ${deviceId || "unknown"}/${sessionId || "unknown"} (${screen || ""}) — ${trimmedLogs.length} log lines`,
  );
  res.json({ ok: true, id: result.lastInsertRowid });
});

app.get("/api/telemetry", (_req, res) => {
  const db = getRawDb();
  // Aggregate telemetry into session summaries using SQL
  const rows = db
    .prepare(
      `SELECT device_id, session_id,
              COUNT(*) as entries,
              MAX(received_at) as last_seen,
              GROUP_CONCAT(DISTINCT screen) as screens
       FROM telemetry_entries
       GROUP BY device_id, session_id
       ORDER BY last_seen DESC`,
    )
    .all() as Array<{
    device_id: string;
    session_id: string;
    entries: number;
    last_seen: string;
    screens: string;
  }>;

  res.json(
    rows.map((r) => ({
      deviceId: r.device_id,
      sessionId: r.session_id,
      entries: r.entries,
      lastSeen: r.last_seen,
      screens: r.screens ? r.screens.split(",") : [],
    })),
  );
});

app.get("/api/telemetry/:deviceId/:sessionId", (req, res) => {
  const { deviceId, sessionId } = req.params;
  const db = getRawDb();
  const entries = db
    .prepare(
      `SELECT * FROM telemetry_entries
       WHERE device_id = ? AND session_id = ?
       ORDER BY received_at ASC`,
    )
    .all(deviceId, sessionId);
  res.json(entries);
});

app.get("/telemetry", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "telemetry.html"));
});

// --- TV Controls ---

app.post("/api/tv/control", async (req, res) => {
  const { tvIp, action, contentId, value } = req.body;
  if (!tvIp || !action) {
    res.status(400).json({ error: "Missing tvIp or action" });
    return;
  }

  try {
    if (action === "select_image" && contentId) {
      await selectAndActivate(tvIp, contentId);
      res.json({ success: true, action, contentId });
    } else if (action === "art_mode_on") {
      await selectAndActivate(tvIp, contentId || ""); // just turns on art mode
      res.json({ success: true, action: "art_mode_on" });
    } else {
      res.status(400).json({ error: "Unknown action: " + action });
    }
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

app.get("/controls", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "controls.html"));
});

// --- Gallery Route ---

app.get("/gallery", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "gallery.html"));
});

app.get("/studio", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "studio.html"));
});

app.get("/api/config", (_req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

app.get("/pair", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "pair.html"));
});

/** Pair by TV IP — scans the TV, registers it, returns device info */
app.post("/api/pair-by-ip", optionalAuth, async (req, res) => {
  const { tvIp } = req.body;
  if (!tvIp) {
    res.status(400).json({ error: "Missing tvIp" });
    return;
  }

  try {
    // Scan the TV
    const apiRes = await fetch(`http://${tvIp}:8001/api/v2/`, {
      signal: AbortSignal.timeout(5000),
    });
    const apiData = (await apiRes.json()) as any;
    const device = apiData.device || {};

    if (device.FrameTVSupport !== "true") {
      res.status(400).json({ error: "Not a Samsung Frame TV" });
      return;
    }

    const tvId = `frame-${(device.wifiMac || "").replace(/:/g, "").slice(-6) || tvIp.replace(/\./g, "")}`;

    // Persist device to database
    const metadata = {
      tvIp,
      tvId,
      scannedAt: new Date().toISOString(),
      modelName: device.modelName,
      modelCode: device.model,
      name: device.name,
      isFrameTV: true,
      resolution: device.resolution,
      wifiMac: device.wifiMac,
      estimatedYear: device.model
        ? 2000 + parseInt(device.model.substring(0, 2))
        : null,
    };
    const db = getRawDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tv_devices (id, tv_ip, model_name, model_code, name, resolution, is_frame_tv, paired_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         tv_ip = excluded.tv_ip,
         paired_at = excluded.paired_at,
         last_seen_at = excluded.last_seen_at`,
    ).run(
      tvId,
      tvIp,
      device.modelName,
      device.model,
      device.name,
      device.resolution,
      now,
      now,
    );

    const userId = (req as any).user?.userId;
    console.log(
      `Paired by IP: ${device.name} (${tvId}) at ${tvIp} by ${userId || "anonymous"}`,
    );

    res.json({ success: true, tvId, tvIp, device: metadata });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Could not reach TV",
    });
  }
});

app.get("/pairip", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "pairip.html"));
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
      console.log(`Fetching image from: ${imageUrl}`);
      const response = await fetch(imageUrl);
      if (!response.ok)
        throw new Error(`Image fetch failed: ${response.status}`);
      const arrayBuf = await response.arrayBuffer();
      imageData = Buffer.from(arrayBuf);
      console.log(
        `Fetched: ${imageData.length} bytes, header: ${imageData[0]?.toString(16)} ${imageData[1]?.toString(16)} ${imageData[2]?.toString(16)}`,
      );
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

      // Wait for TV to finish writing image, then set as display
      await new Promise((r) => setTimeout(r, 2000));
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

/** Select an image and activate art mode display */
app.post("/api/set-display", async (req, res) => {
  const { tvIp, contentId } = req.body;
  if (!tvIp || !contentId) {
    res.status(400).json({ error: "Missing tvIp or contentId" });
    return;
  }
  try {
    console.log(`Setting display: ${contentId} on ${tvIp}`);
    const result = await selectAndActivate(tvIp, contentId);
    res.json({ success: result, contentId });
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

/** Upload a specific image file to TV — DEV ONLY, disabled in production */
app.post("/api/upload-file", async (req, res) => {
  // Security: this endpoint reads arbitrary files from the server filesystem.
  // Only allow in development mode.
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "This endpoint is disabled in production" });
    return;
  }
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

// Periodic cleanup — runs every hour
setInterval(
  () => {
    cleanExpired(); // Pairing codes
    cleanExpiredSessions(); // Auth sessions
  },
  60 * 60 * 1000,
);

// Start
server.listen(PORT, () => {
  console.log(`\n🎨 Frame Art Cloud Server`);
  console.log(`   HTTP:  ${CLOUD_URL}`);
  console.log(`   WS TV: ${CLOUD_URL.replace("http", "ws")}/ws/tv`);
  console.log(`   WS Phone: ${CLOUD_URL.replace("http", "ws")}/ws/phone`);
  console.log(`   Pair:  ${CLOUD_URL}/pair`);
  console.log(`   Port:  ${PORT}\n`);
});
