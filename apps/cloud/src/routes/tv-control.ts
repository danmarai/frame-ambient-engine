/** TV control routes — upload, display, init, cycle */
import { Router } from "express";
import { uploadToTv, selectAndActivate } from "../tv-upload.js";
import {
  initTvState,
  makeRoom,
  recordUpload,
  handleStorageFull,
} from "../tv-storage.js";
import { sendToTv, getTvIp } from "../tv-connections.js";
import { isValidTvIp } from "../middleware.js";

const router = Router();

router.post("/api/tv/control", async (req, res) => {
  const { tvIp, action, contentId } = req.body;
  if (!tvIp || !action) {
    res.status(400).json({ error: "Missing tvIp or action" });
    return;
  }
  if (!isValidTvIp(tvIp)) {
    res
      .status(400)
      .json({ error: "Invalid TV IP — must be a private network address" });
    return;
  }

  try {
    if (action === "select_image" && contentId) {
      await selectAndActivate(tvIp, contentId);
      res.json({ success: true, action, contentId });
    } else if (action === "art_mode_on") {
      await selectAndActivate(tvIp, contentId || "");
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

/** Upload art to a paired TV — cloud server acts as upload bridge */
router.post("/api/upload", async (req, res) => {
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

      sendToTv(tvId, {
        type: "new_art",
        contentId: result.contentId,
        message: "Fresh art from Don Claude!",
      });

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
router.post("/api/tv/init", async (req, res) => {
  const { tvIp } = req.body;
  if (!tvIp) {
    res.status(400).json({ error: "Missing tvIp" });
    return;
  }
  if (!isValidTvIp(tvIp)) {
    res
      .status(400)
      .json({ error: "Invalid TV IP — must be a private network address" });
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
router.post("/api/set-display", async (req, res) => {
  const { tvIp, contentId } = req.body;
  if (!tvIp || !contentId) {
    res.status(400).json({ error: "Missing tvIp or contentId" });
    return;
  }
  if (!isValidTvIp(tvIp)) {
    res
      .status(400)
      .json({ error: "Invalid TV IP — must be a private network address" });
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
router.post("/api/upload-file", async (req, res) => {
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

router.post("/api/cycle", async (req, res) => {
  const { tvIp, images, intervalMs } = req.body;
  if (!tvIp || !images || !images.length) {
    res.status(400).json({ error: "Missing tvIp or images array" });
    return;
  }

  if (cycleTimer) clearInterval(cycleTimer);

  let idx = 0;
  const interval = intervalMs || 30000;

  console.log(
    `Starting art cycle: ${images.length} images, ${interval}ms interval`,
  );

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

router.post("/api/cycle/stop", (_req, res) => {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
    console.log("Art cycle stopped");
    res.json({ success: true, message: "Cycle stopped" });
  } else {
    res.json({ success: true, message: "No cycle running" });
  }
});

export default router;
