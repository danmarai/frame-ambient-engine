/**
 * Filesystem catalog helpers for the curated art library.
 *
 * Shared by library routes and recommendation ranking. The library lives at
 * ART_LIBRARY_PATH (default: /home/ubuntu/art-library) organized as
 * {category-folder}/{filename.jpg}.
 */
import {
  existsSync,
  readdirSync,
  realpathSync,
  statSync,
} from "fs";
import path from "path";
import { logger } from "./logger.js";

export const ART_LIBRARY_PATH =
  process.env.ART_LIBRARY_PATH || "/home/ubuntu/art-library";

export interface CategoryInfo {
  id: string;
  label: string;
  count: number;
}

export function getCategories(): CategoryInfo[] {
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
        const label = name
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

export function getImagesInCategory(categoryId: string): string[] {
  // Validate category exists in discovered categories (prevents traversal).
  const categories = getCategories();
  if (!categories.some((c) => c.id === categoryId)) return [];
  const dir = path.join(ART_LIBRARY_PATH, categoryId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
}

/** Resolve a library image path, validating it stays under ART_LIBRARY_PATH. */
export function resolveLibraryPath(
  category: string,
  filename: string,
): string | null {
  // Reject obvious traversal.
  if (category.includes("..") || filename.includes("..")) return null;
  if (category.includes("/") || filename.includes("/")) return null;
  if (category.includes("\\") || filename.includes("\\")) return null;

  // Validate against discovered entries.
  const categories = getCategories();
  if (!categories.some((c) => c.id === category)) return null;
  const images = getImagesInCategory(category);
  if (!images.includes(filename)) return null;

  // Resolve and verify real path stays under library root.
  const filePath = path.join(ART_LIBRARY_PATH, category, filename);
  if (!existsSync(filePath)) return null;
  const realPath = realpathSync(filePath);
  const realRoot = realpathSync(ART_LIBRARY_PATH);
  if (!realPath.startsWith(realRoot + path.sep)) return null;

  return filePath;
}
