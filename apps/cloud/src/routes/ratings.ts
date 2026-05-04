/** Rating routes — authenticated art ratings and taste profile */
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { getRawDb } from "../db.js";
import { getOwnedTv } from "../tv-ownership.js";
import {
  recordRating,
  getTasteProfile,
  buildTastePromptHints,
  type SourceType,
  type Rating,
} from "../taste-profile.js";
import { resolveLibraryPath } from "../library-catalog.js";

const router = Router();

const VALID_RATINGS: Rating[] = ["up", "down"];
const VALID_SOURCE_TYPES: SourceType[] = ["generated", "library"];

/** POST /api/ratings — record a rating */
router.post("/api/ratings", requireAuth, (req, res) => {
  const userId = (req as any).user.userId as string;
  const { tvId, sourceType, sourceId, rating, category, filename } = req.body;

  // Validate required fields
  if (!sourceType || !sourceId || !rating) {
    res.status(400).json({ error: "Missing sourceType, sourceId, or rating" });
    return;
  }
  if (!VALID_RATINGS.includes(rating)) {
    res.status(400).json({ error: "Rating must be 'up' or 'down'" });
    return;
  }
  if (!VALID_SOURCE_TYPES.includes(sourceType)) {
    res
      .status(400)
      .json({ error: "sourceType must be 'generated' or 'library'" });
    return;
  }

  // If tvId provided, verify ownership
  if (tvId) {
    const tv = getOwnedTv(userId, { tvId });
    if (!tv) {
      res.status(403).json({ error: "TV is not paired to this user" });
      return;
    }
  }

  // For generated scenes, verify the user owns the scene
  if (sourceType === "generated") {
    const scene = getRawDb()
      .prepare("SELECT user_id FROM scene_archive WHERE id = ?")
      .get(sourceId) as { user_id: string | null } | undefined;
    if (!scene) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }
    if (scene.user_id !== userId) {
      res.status(403).json({ error: "Scene is not owned by this user" });
      return;
    }
  }

  // For library items, validate against actual library on disk
  if (sourceType === "library") {
    if (!category || !filename) {
      res
        .status(400)
        .json({ error: "Library ratings require category and filename" });
      return;
    }
    const expectedId = `${category}/${filename}`;
    if (sourceId !== expectedId) {
      res.status(400).json({
        error: "sourceId must match category/filename for library items",
      });
      return;
    }
    // Validate the image actually exists in the library
    const resolved = resolveLibraryPath(category, filename);
    if (!resolved) {
      res.status(404).json({ error: "Library image not found" });
      return;
    }
  }

  // Enrich with scene metadata for generated items
  let prompt: string | undefined;
  let provider: string | undefined;
  let contextJson: string | undefined;
  if (sourceType === "generated") {
    const scene = getRawDb()
      .prepare(
        "SELECT prompt, provider, context_json FROM scene_archive WHERE id = ?",
      )
      .get(sourceId) as
      | {
          prompt: string | null;
          provider: string | null;
          context_json: string | null;
        }
      | undefined;
    if (scene) {
      prompt = scene.prompt || undefined;
      provider = scene.provider || undefined;
      contextJson = scene.context_json || undefined;
    }
  }

  const result = recordRating({
    userId,
    tvId,
    sourceType,
    sourceId,
    rating,
    category,
    filename,
    prompt,
    provider,
    contextJson,
  });

  res.json(result);
});

/** GET /api/taste/profile — get current user's taste profile */
router.get("/api/taste/profile", requireAuth, (req, res) => {
  const userId = (req as any).user.userId as string;
  const profile = getTasteProfile(userId);
  res.json(profile);
});

/** GET /api/taste/hints — get prompt hints for generation (used internally) */
router.get("/api/taste/hints", requireAuth, (req, res) => {
  const userId = (req as any).user.userId as string;
  const profile = getTasteProfile(userId);
  const hints = buildTastePromptHints(profile);
  res.json({
    confidence: profile.confidence,
    hints,
  });
});

export default router;
