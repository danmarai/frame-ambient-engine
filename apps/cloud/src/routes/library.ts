/**
 * Art library routes — browse and serve curated artwork from the on-disk library.
 *
 * The library lives at ART_LIBRARY_PATH (default: /home/ubuntu/art-library)
 * organized as: {category-folder}/{filename.jpg}
 *
 * Tracks recently served images per category to avoid repeats.
 */
import { Router } from "express";
import { readFileSync } from "fs";
import path from "path";
import { logger } from "../logger.js";
import { uploadToTv, selectAndActivate } from "../tv-upload.js";
import { makeRoom, recordUpload, handleStorageFull } from "../tv-storage.js";
import { requireAuth } from "../auth.js";
import { getOwnedTv } from "../tv-ownership.js";
import {
  getCategories,
  getImagesInCategory,
  resolveLibraryPath,
} from "../library-catalog.js";

const router = Router();

// Track recently served images to avoid repeats
const recentlyServed = new Map<string, Set<string>>();
const MAX_RECENT = 50;

/** Resolve owned TV from request, returning id + tvIp or sending error. */
function resolveOwnedTvFromReq(
  req: any,
  res: any,
): { id: string; tvIp: string } | null {
  const userId = req.user?.userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const { tvId } = req.body;
  if (!tvId) {
    res.status(400).json({ error: "Missing tvId" });
    return null;
  }
  const tv = getOwnedTv(userId, { tvId });
  if (!tv) {
    res.status(403).json({ error: "TV is not paired to this user" });
    return null;
  }
  return { id: tv.id, tvIp: tv.tvIp };
}

/** Upload a single image to TV with storage-full retry. */
async function uploadWithRetry(
  tvIp: string,
  imageData: Buffer,
): Promise<{
  success: boolean;
  contentId?: string;
  durationMs?: number;
  error?: string;
}> {
  let result = await uploadToTv(tvIp, imageData);
  if (!result.success && result.error?.includes("-11")) {
    logger.info("Storage full, cleaning up and retrying");
    await handleStorageFull(tvIp);
    result = await uploadToTv(tvIp, imageData);
  }
  return result;
}

/** GET /api/library/categories */
router.get("/api/library/categories", (_req, res) => {
  const cats = getCategories();
  res.json(cats);
});

/** GET /api/library/browse/:category — list images in a category */
router.get("/api/library/browse/:category", (req, res) => {
  const { category } = req.params;
  const page = parseInt(req.query.page as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

  const images = getImagesInCategory(category);
  if (images.length === 0) {
    res.status(404).json({ error: "Category not found or empty" });
    return;
  }

  const start = page * limit;
  const slice = images.slice(start, start + limit);

  res.json({
    category,
    total: images.length,
    page,
    limit,
    images: slice.map((filename) => ({
      filename,
      url: `/api/library/image/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`,
      label: filename.replace(/\.\w+$/, ""),
    })),
  });
});

/** GET /api/library/random — pick a random image, avoiding recent repeats */
router.get("/api/library/random", (req, res) => {
  const categoryId = req.query.category as string;

  let categories: string[];
  if (categoryId) {
    categories = [categoryId];
  } else {
    // Pick from all categories
    categories = getCategories().map((c) => c.id);
  }

  if (categories.length === 0) {
    res.status(404).json({ error: "No categories available" });
    return;
  }

  // Pick a random category if multiple
  const cat = categories[Math.floor(Math.random() * categories.length)]!;
  const images = getImagesInCategory(cat);
  if (images.length === 0) {
    res.status(404).json({ error: "Category empty" });
    return;
  }

  // Avoid recently served
  if (!recentlyServed.has(cat)) recentlyServed.set(cat, new Set());
  const recent = recentlyServed.get(cat)!;

  let available = images.filter((f) => !recent.has(f));
  if (available.length === 0) {
    // All served recently — reset
    recent.clear();
    available = images;
  }

  const picked = available[Math.floor(Math.random() * available.length)]!;
  recent.add(picked);
  if (recent.size > MAX_RECENT) {
    const oldest = recent.values().next().value;
    if (oldest) recent.delete(oldest);
  }

  const url = `/api/library/image/${encodeURIComponent(cat)}/${encodeURIComponent(picked)}`;
  const label = picked.replace(/\.\w+$/, "");

  logger.info({ category: cat, filename: picked }, "Library random pick");

  res.json({
    category: cat,
    filename: picked,
    label,
    url,
    imageUrl: url,
  });
});

/** GET /api/library/image/:category/:filename — serve the actual image */
router.get("/api/library/image/:category/:filename", (req, res) => {
  const { category, filename } = req.params;

  const filePath = resolveLibraryPath(category, filename);
  if (!filePath) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";

  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(filePath);
});

/** POST /api/library/push — push a single library image to TV */
router.post("/api/library/push", requireAuth, async (req, res) => {
  const { category, filename } = req.body;
  if (!category || !filename) {
    res.status(400).json({ error: "Missing category or filename" });
    return;
  }

  const tv = resolveOwnedTvFromReq(req, res);
  if (!tv) return;

  const filePath = resolveLibraryPath(category, filename);
  if (!filePath) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  try {
    const imageData = readFileSync(filePath);
    logger.info(
      { category, filename, tvIp: tv.tvIp, bytes: imageData.length },
      "Library push to TV",
    );

    await makeRoom(tv.tvIp, 1);
    const upload = await uploadWithRetry(tv.tvIp, imageData);
    if (upload.success && upload.contentId) {
      recordUpload(tv.tvIp, upload.contentId);
      await selectAndActivate(tv.tvIp, upload.contentId);
      res.json({
        success: true,
        contentId: upload.contentId,
        durationMs: upload.durationMs,
        label: filename.replace(/\.\w+$/, ""),
      });
    } else {
      res.json({ success: false, error: upload.error || "Upload failed" });
    }
  } catch (e: any) {
    logger.error({ error: e.message }, "Library push failed");
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST /api/library/push-batch — push multiple library images to TV sequentially */
router.post("/api/library/push-batch", requireAuth, async (req, res) => {
  const { images } = req.body;
  if (!Array.isArray(images) || images.length === 0) {
    res.status(400).json({ error: "Missing images array" });
    return;
  }

  const tv = resolveOwnedTvFromReq(req, res);
  if (!tv) return;

  // Cap at 20 images per batch
  const batch = images.slice(0, 20);

  // Validate all items and resolve paths before making room on TV
  const validated: Array<{
    filename: string;
    category: string;
    filePath: string;
  }> = [];
  const results: Array<{
    filename: string;
    success: boolean;
    contentId?: string;
    error?: string;
  }> = [];

  for (const img of batch) {
    if (!img.category || !img.filename) {
      results.push({
        filename: img.filename || "?",
        success: false,
        error: "Missing category or filename",
      });
      continue;
    }
    const filePath = resolveLibraryPath(img.category, img.filename);
    if (!filePath) {
      results.push({
        filename: img.filename,
        success: false,
        error: "Not found or invalid path",
      });
      continue;
    }
    validated.push({
      filename: img.filename,
      category: img.category,
      filePath,
    });
  }

  if (validated.length === 0) {
    res.json({
      total: batch.length,
      succeeded: 0,
      failed: batch.length,
      results,
    });
    return;
  }

  logger.info(
    { tvIp: tv.tvIp, count: validated.length },
    "Library batch push starting",
  );

  // Make room only for valid images
  try {
    await makeRoom(tv.tvIp, validated.length);
  } catch (e: any) {
    res
      .status(500)
      .json({ error: "Failed to prepare TV storage: " + e.message });
    return;
  }

  for (const item of validated) {
    try {
      const imageData = readFileSync(item.filePath);
      const upload = await uploadWithRetry(tv.tvIp, imageData);
      if (upload.success && upload.contentId) {
        recordUpload(tv.tvIp, upload.contentId);
        results.push({
          filename: item.filename,
          success: true,
          contentId: upload.contentId,
        });
        logger.info(
          { filename: item.filename, contentId: upload.contentId },
          "Batch item uploaded",
        );
      } else {
        results.push({
          filename: item.filename,
          success: false,
          error: upload.error,
        });
        logger.warn(
          { filename: item.filename, error: upload.error },
          "Batch item failed",
        );
      }
    } catch (e: any) {
      results.push({
        filename: item.filename,
        success: false,
        error: e.message,
      });
    }

    // 2s delay between uploads to let the TV art service breathe
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Activate the last successful upload
  const lastSuccess = results.filter((r) => r.success).pop();
  if (lastSuccess?.contentId) {
    try {
      await selectAndActivate(tv.tvIp, lastSuccess.contentId);
    } catch {}
  }

  const succeeded = results.filter((r) => r.success).length;
  logger.info(
    { tvIp: tv.tvIp, total: batch.length, succeeded },
    "Library batch push complete",
  );

  res.json({
    total: batch.length,
    succeeded,
    failed: batch.length - succeeded,
    results,
    activeContentId: lastSuccess?.contentId,
  });
});

export default router;
