/**
 * Art library routes — browse and serve curated artwork from the on-disk library.
 *
 * The library lives at ART_LIBRARY_PATH (default: /home/ubuntu/art-library)
 * organized as: {category-folder}/{filename.jpg}
 *
 * Tracks recently served images per category to avoid repeats.
 */
import { Router } from "express";
import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import path from "path";
import { logger } from "../logger.js";
import { uploadToTv, selectAndActivate } from "../tv-upload.js";
import { makeRoom, recordUpload } from "../tv-storage.js";
import { optionalAuth } from "../auth.js";

const router = Router();

const ART_LIBRARY_PATH =
  process.env.ART_LIBRARY_PATH || "/home/ubuntu/art-library";

// Track recently served images to avoid repeats
const recentlyServed = new Map<string, Set<string>>();
const MAX_RECENT = 50;

interface CategoryInfo {
  id: string;
  label: string;
  count: number;
}

function getCategories(): CategoryInfo[] {
  if (!existsSync(ART_LIBRARY_PATH)) return [];
  try {
    return readdirSync(ART_LIBRARY_PATH)
      .filter((name) => {
        const full = path.join(ART_LIBRARY_PATH, name);
        return statSync(full).isDirectory();
      })
      .map((name) => {
        const full = path.join(ART_LIBRARY_PATH, name);
        const files = readdirSync(full).filter((f) =>
          /\.(jpg|jpeg|png|webp)$/i.test(f),
        );
        // Clean up label: remove "(25)", "Samsung TV", "Frame TV", etc.
        let label = name
          .replace(/\s*\(\d+\+?\)\s*/g, "")
          .replace(/Samsung TV /gi, "")
          .replace(/Frame TV /gi, "")
          .replace(/TV Frame /gi, "")
          .replace(/ ?Frame /gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        return {
          id: name,
          label,
          count: files.length,
        };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (e) {
    logger.error({ error: (e as Error).message }, "Failed to read art library");
    return [];
  }
}

function getImagesInCategory(categoryId: string): string[] {
  const dir = path.join(ART_LIBRARY_PATH, categoryId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
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

  // Prevent path traversal
  if (category.includes("..") || filename.includes("..")) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  const filePath = path.join(ART_LIBRARY_PATH, category, filename);
  if (!existsSync(filePath)) {
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
router.post("/api/library/push", optionalAuth, async (req, res) => {
  const { category, filename, tvIp } = req.body;
  if (!category || !filename || !tvIp) {
    res.status(400).json({ error: "Missing category, filename, or tvIp" });
    return;
  }
  if (category.includes("..") || filename.includes("..")) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  const filePath = path.join(ART_LIBRARY_PATH, category, filename);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  try {
    const imageData = readFileSync(filePath);
    logger.info(
      { category, filename, tvIp, bytes: imageData.length },
      "Library push to TV",
    );

    await makeRoom(tvIp, 1);
    const upload = await uploadToTv(tvIp, imageData);
    if (upload.success && upload.contentId) {
      recordUpload(tvIp, upload.contentId);
      await selectAndActivate(tvIp, upload.contentId);
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
router.post("/api/library/push-batch", optionalAuth, async (req, res) => {
  const { images, tvIp } = req.body;
  if (!Array.isArray(images) || images.length === 0 || !tvIp) {
    res.status(400).json({ error: "Missing images array or tvIp" });
    return;
  }

  // Cap at 20 images per batch to be kind to the TV
  const batch = images.slice(0, 20);
  logger.info({ tvIp, count: batch.length }, "Library batch push starting");

  // Make room for the batch
  try {
    await makeRoom(tvIp, batch.length);
  } catch (e: any) {
    res
      .status(500)
      .json({ error: "Failed to prepare TV storage: " + e.message });
    return;
  }

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
    if (img.category.includes("..") || img.filename.includes("..")) {
      results.push({
        filename: img.filename,
        success: false,
        error: "Invalid path",
      });
      continue;
    }

    const filePath = path.join(ART_LIBRARY_PATH, img.category, img.filename);
    if (!existsSync(filePath)) {
      results.push({
        filename: img.filename,
        success: false,
        error: "Not found",
      });
      continue;
    }

    try {
      const imageData = readFileSync(filePath);
      const upload = await uploadToTv(tvIp, imageData);
      if (upload.success && upload.contentId) {
        recordUpload(tvIp, upload.contentId);
        results.push({
          filename: img.filename,
          success: true,
          contentId: upload.contentId,
        });
        logger.info(
          { filename: img.filename, contentId: upload.contentId },
          "Batch item uploaded",
        );
      } else {
        results.push({
          filename: img.filename,
          success: false,
          error: upload.error,
        });
        logger.warn(
          { filename: img.filename, error: upload.error },
          "Batch item failed",
        );
        // Don't abort the batch on individual failure — skip and continue
      }
    } catch (e: any) {
      results.push({
        filename: img.filename,
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
      await selectAndActivate(tvIp, lastSuccess.contentId);
    } catch {}
  }

  const succeeded = results.filter((r) => r.success).length;
  logger.info(
    { tvIp, total: batch.length, succeeded },
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
