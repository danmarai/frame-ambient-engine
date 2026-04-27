/** Generation routes — art creation, gallery, images, settings */
import { Router } from "express";
import { optionalAuth } from "../auth.js";
import { getRawDb } from "../db.js";
import {
  generate,
  loadImage,
  getGenerationConfig,
  getUserSettings,
  updateUserSettings,
} from "../generation.js";
import { uploadToTv, selectAndActivate } from "../tv-upload.js";
import { makeRoom, recordUpload } from "../tv-storage.js";
import { sendToTv } from "../tv-connections.js";
import { asyncHandler, generateLimiter } from "../middleware.js";
import { logger } from "../logger.js";
import { getOwnedTv } from "../tv-ownership.js";

const router = Router();

router.get("/api/generation/config", (_req, res) => {
  res.json(getGenerationConfig());
});

router.post(
  "/api/generate",
  generateLimiter,
  optionalAuth,
  async (req, res) => {
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
      let targetTv:
        | { id: string; tvIp: string }
        | null = null;
      if (tvId || explicitIp) {
        if (!userId) {
          res.status(401).json({ error: "Authentication required" });
          return;
        }

        const ownedTv = getOwnedTv(userId, { tvId, tvIp: explicitIp });
        if (!ownedTv) {
          res.status(403).json({ error: "TV is not paired to this user" });
          return;
        }
        targetTv = { id: ownedTv.id, tvIp: ownedTv.tvIp };
      }

      logger.info({ theme, imageStyle, provider }, "Generation request");
      const result = await generate({
        userId,
        theme,
        imageStyle,
        provider,
        overlays,
      });

      // If tvId/tvIp provided, also upload to TV
      let uploadResult = null;
      const tvIp = targetTv?.tvIp || null;
      if (tvIp && tvIp !== "unknown") {
        logger.info({ tvIp }, "Auto-uploading to TV");
        await makeRoom(tvIp, 1);
        const upload = await uploadToTv(tvIp, result.imageData);
        if (upload.success && upload.contentId) {
          recordUpload(tvIp, upload.contentId);
          await selectAndActivate(tvIp, upload.contentId);
          uploadResult = {
            contentId: upload.contentId,
            durationMs: upload.durationMs,
          };
          if (targetTv) {
            sendToTv(targetTv.id, {
              type: "new_art",
              contentId: upload.contentId,
            });
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
      logger.error({ error: message }, "Generation error");
      res.status(500).json({ error: message });
    }
  },
);

router.get("/api/scenes", (_req, res) => {
  const db = getRawDb();
  const rows = db
    .prepare("SELECT * FROM scene_archive ORDER BY created_at DESC")
    .all();
  res.json(rows);
});

router.get(
  "/api/images/:sceneId",
  asyncHandler(async (req, res) => {
    const data = await loadImage(req.params.sceneId as string);
    if (!data) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(data);
  }),
);

// --- User Settings ---

router.get("/api/settings", optionalAuth, (req, res) => {
  const userId = (req as any).user?.userId || "default";
  res.json(getUserSettings(userId));
});

router.post("/api/settings", optionalAuth, (req, res) => {
  const userId = (req as any).user?.userId || "default";
  updateUserSettings(userId, req.body);
  res.json({ success: true });
});

export default router;
