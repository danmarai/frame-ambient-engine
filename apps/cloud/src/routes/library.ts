/**
 * Art library routes — browse and serve curated artwork from the on-disk library.
 *
 * The library lives at ART_LIBRARY_PATH (default: /home/ubuntu/art-library)
 * organized as: {category-folder}/{filename.jpg}
 *
 * Tracks recently served images per category to avoid repeats.
 */
import { Router } from "express";
import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { logger } from "../logger.js";

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

export default router;
