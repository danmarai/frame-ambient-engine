/** TV control routes — upload, display, init, cycle */
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { uploadToTv, selectAndActivate } from "../tv-upload.js";
import {
  initTvState,
  makeRoom,
  recordUpload,
  handleStorageFull,
} from "../tv-storage.js";
import { sendToTv } from "../tv-connections.js";
import { isValidTvIp } from "../middleware.js";
import { logger } from "../logger.js";
import { getOwnedTv } from "../tv-ownership.js";
import { loadImage } from "../generation.js";
import { getRawDb } from "../db.js";

const router = Router();

function resolveOwnedTv(
  req: any,
  res: any,
): { id: string; tvIp: string } | null {
  const userId = req.user.userId as string;
  const { tvId, tvIp } = req.body;
  if (!tvId && !tvIp) {
    res.status(400).json({ error: "Missing tvId or tvIp" });
    return null;
  }
  if (tvIp && !isValidTvIp(tvIp)) {
    res
      .status(400)
      .json({ error: "Invalid TV IP — must be a private network address" });
    return null;
  }

  const tv = getOwnedTv(userId, { tvId, tvIp });
  if (!tv) {
    res.status(403).json({ error: "TV is not paired to this user" });
    return null;
  }
  return { id: tv.id, tvIp: tv.tvIp };
}

function requireOwnedScene(userId: string, sceneId: string, res: any): boolean {
  const row = getRawDb()
    .prepare("SELECT user_id FROM scene_archive WHERE id = ?")
    .get(sceneId) as { user_id: string | null } | undefined;

  if (!row) {
    res.status(404).json({ error: "Scene not found" });
    return false;
  }

  if (row.user_id !== userId) {
    res.status(403).json({ error: "Scene is not owned by this user" });
    return false;
  }

  return true;
}

router.post("/api/tv/control", requireAuth, async (req, res) => {
  const { action, contentId } = req.body;
  if (!action) {
    res.status(400).json({ error: "Missing action" });
    return;
  }
  const tv = resolveOwnedTv(req, res);
  if (!tv) return;

  try {
    if (action === "select_image" && contentId) {
      await selectAndActivate(tv.tvIp, contentId);
      res.json({ success: true, action, contentId });
    } else if (action === "art_mode_on") {
      await selectAndActivate(tv.tvIp, contentId || "");
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
router.post("/api/upload", requireAuth, async (req, res) => {
  const { tvId, sceneId, imageUrl, tvIp: explicitIp } = req.body;
  const userId = (req as any).user.userId as string;
  if (!tvId) {
    res.status(400).json({ error: "Missing tvId" });
    return;
  }
  if (imageUrl) {
    res.status(400).json({ error: "imageUrl is not supported; use sceneId" });
    return;
  }
  if (!sceneId) {
    res.status(400).json({ error: "Missing sceneId" });
    return;
  }

  const tv = resolveOwnedTv(req, res);
  if (!tv) return;

  // Check if Curateur is paused for this TV
  const tvRow = getRawDb()
    .prepare("SELECT frame_art_active FROM tv_devices WHERE id = ?")
    .get(tv.id) as { frame_art_active: number } | undefined;
  if (tvRow && tvRow.frame_art_active === 0) {
    res.status(409).json({
      error:
        "Curateur is paused for this TV. Enable it in Controls to push art.",
    });
    return;
  }
  if (!requireOwnedScene(userId, sceneId, res)) return;
  const tvIp = tv.tvIp;

  try {
    const imageData = await loadImage(sceneId);
    if (!imageData) {
      res.status(404).json({ error: "Scene image not found" });
      return;
    }

    await makeRoom(tvIp, 1);

    logger.info({ bytes: imageData.length, tvIp }, "Uploading to TV");
    let result = await uploadToTv(tvIp, imageData);

    // Handle storage full — clean up and retry once
    if (!result.success && result.error?.includes("-11")) {
      logger.info("Storage full, cleaning up and retrying");
      await handleStorageFull(tvIp);
      result = await uploadToTv(tvIp, imageData);
    }

    if (result.success && result.contentId) {
      logger.info({ contentId: result.contentId }, "Upload success");
      recordUpload(tvIp, result.contentId);

      sendToTv(tv.id, {
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
      logger.error({ error: result.error }, "Upload failed");
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ error: message }, "Upload error");
    res.status(500).json({ error: message });
  }
});

/** Initialize TV state — scans storage, detects capacity */
router.post("/api/tv/init", requireAuth, async (req, res) => {
  const tv = resolveOwnedTv(req, res);
  if (!tv) return;
  try {
    const state = await initTvState(tv.tvIp);
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
router.post("/api/set-display", requireAuth, async (req, res) => {
  const { contentId } = req.body;
  if (!contentId) {
    res.status(400).json({ error: "Missing contentId" });
    return;
  }
  const tv = resolveOwnedTv(req, res);
  if (!tv) return;
  try {
    logger.info({ contentId, tvIp: tv.tvIp }, "Setting display");
    const result = await selectAndActivate(tv.tvIp, contentId);
    res.json({ success: result, contentId });
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

/** Upload a specific image file to TV — DEV ONLY, disabled in production */
router.post("/api/upload-file", requireAuth, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "This endpoint is disabled in production" });
    return;
  }
  const { tvIp, filePath } = req.body;
  if (!tvIp || !filePath) {
    res.status(400).json({ error: "Missing tvIp or filePath" });
    return;
  }
  const tv = resolveOwnedTv(req, res);
  if (!tv) return;
  try {
    const fs = await import("fs");
    const imageData = fs.readFileSync(filePath);
    logger.info(
      { filePath, bytes: imageData.length, tvIp: tv.tvIp },
      "Uploading file to TV",
    );
    const result = await uploadToTv(tv.tvIp, imageData);
    if (result.success) {
      await selectAndActivate(tv.tvIp, result.contentId!);
    }
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/** Cycle through images on a timer */
let cycleTimer: ReturnType<typeof setInterval> | null = null;

router.post("/api/cycle", requireAuth, async (req, res) => {
  const { tvIp, images, intervalMs } = req.body;
  if (!tvIp || !images || !images.length) {
    res.status(400).json({ error: "Missing tvIp or images array" });
    return;
  }
  const tv = resolveOwnedTv(req, res);
  if (!tv) return;
  const ownedTvIp = tv.tvIp;

  if (cycleTimer) clearInterval(cycleTimer);

  let idx = 0;
  const interval = intervalMs || 30000;

  logger.info({ imageCount: images.length, interval }, "Starting art cycle");

  async function showNext() {
    const filePath = images[idx % images.length];
    try {
      const fs = await import("fs");
      const imageData = fs.readFileSync(filePath);
      logger.info(
        { index: idx + 1, total: images.length, filePath },
        "Cycle image",
      );
      const result = await uploadToTv(ownedTvIp, imageData);
      if (result.success && result.contentId) {
        await selectAndActivate(ownedTvIp, result.contentId);
        logger.info(
          { contentId: result.contentId, durationMs: result.durationMs },
          "Cycle image displayed",
        );
      }
    } catch (err) {
      logger.error({ error: err }, "Cycle error");
    }
    idx++;
  }

  await showNext();
  cycleTimer = setInterval(showNext, interval);

  res.json({ success: true, imageCount: images.length, intervalMs: interval });
});

router.post("/api/cycle/stop", requireAuth, (_req, res) => {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
    logger.info("Art cycle stopped");
    res.json({ success: true, message: "Cycle stopped" });
  } else {
    res.json({ success: true, message: "No cycle running" });
  }
});

/** Pause/resume Curateur for a TV — when paused, no new art is pushed */
router.post("/api/tv/toggle", requireAuth, (req, res) => {
  const { active } = req.body;
  const tv = resolveOwnedTv(req, res);
  if (!tv) return;

  const db = getRawDb();
  db.prepare(`UPDATE tv_devices SET frame_art_active = ? WHERE id = ?`).run(
    active ? 1 : 0,
    tv.id,
  );

  // Notify the TV of state change
  sendToTv(tv.id, {
    type: "frame_art_toggle",
    active: !!active,
  });

  logger.info({ tvId: tv.id, active }, "Curateur toggled");
  res.json({ success: true, active: !!active });
});

/** Get Curateur active state for a TV */
router.get("/api/tv/status", requireAuth, (req, res) => {
  const userId = (req as any).user.userId as string;
  const tvId = req.query.tvId as string;
  if (!tvId) {
    res.status(400).json({ error: "Missing tvId query param" });
    return;
  }
  const tv = getOwnedTv(userId, { tvId });
  if (!tv) {
    res.status(403).json({ error: "TV not owned by this user" });
    return;
  }
  const row = getRawDb()
    .prepare("SELECT frame_art_active FROM tv_devices WHERE id = ?")
    .get(tv.id) as { frame_art_active: number } | undefined;

  res.json({
    tvId: tv.id,
    active: row ? row.frame_art_active !== 0 : true,
  });
});

export default router;
