/**
 * Library recommendation service — ranks library images by user taste.
 *
 * Scoring model (v1, deterministic per spec):
 *   score =
 *     categoryAffinity
 *     + sourceDiversityBoost
 *     + unratedBoost
 *     - downratedCategoryPenalty
 *     - recentRepeatPenalty
 *
 * Cold start: diverse mix across categories with mild randomness.
 * Learning/useful: rank by category affinity, exclude downrated items,
 * cap items per category for diversity, optionally mix in favorites.
 */
import { getRawDb } from "./db.js";
import {
  getTasteProfile,
  getFullProfile,
  type RecommendedImage,
} from "./taste-profile.js";
import {
  getCategories,
  getImagesInCategory,
  type CategoryInfo,
} from "./routes/library.js";

export interface RecommendationOptions {
  limit?: number;
  includeRated?: boolean;
}

export interface RecommendationResult {
  confidence: "cold_start" | "learning" | "useful";
  items: RecommendedImage[];
}

interface UserRatings {
  downratedIds: Set<string>;
  upratedIds: Set<string>;
  recentlyRatedIds: Set<string>;
}

function loadUserRatings(userId: string): UserRatings {
  const rows = getRawDb()
    .prepare(
      `SELECT source_id, rating, updated_at
       FROM art_ratings
       WHERE user_id = ? AND source_type = 'library'
       ORDER BY updated_at DESC`,
    )
    .all(userId) as Array<{
    source_id: string;
    rating: "up" | "down";
    updated_at: string;
  }>;

  const downratedIds = new Set<string>();
  const upratedIds = new Set<string>();
  const recentlyRatedIds = new Set<string>();
  rows.forEach((r, i) => {
    if (r.rating === "down") downratedIds.add(r.source_id);
    else upratedIds.add(r.source_id);
    if (i < 10) recentlyRatedIds.add(r.source_id);
  });

  return { downratedIds, upratedIds, recentlyRatedIds };
}

function imageUrl(category: string, filename: string): string {
  return `/api/library/image/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
}

function imageLabel(filename: string): string {
  return filename.replace(/\.\w+$/, "");
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function reasonText(
  categoryScore: number,
  isCold: boolean,
  categoryLabel: string,
): string {
  if (isCold) return "A diverse pick to learn your taste";
  if (categoryScore > 0.3) return `Similar to ${categoryLabel} you liked`;
  if (categoryScore > 0) return `From ${categoryLabel}`;
  return "A change of pace";
}

function buildCategoryScoreMap(userId: string): Map<string, number> {
  const map = new Map<string, number>();
  const profile = getFullProfile(userId);
  if (!profile) return map;
  for (const c of profile.topCategories) map.set(c.id, c.score);
  for (const c of profile.avoidedCategories) map.set(c.id, c.score);
  return map;
}

/**
 * Build a list of liked-favorite recommendations, sampled from items the
 * user previously rated up. Only valid items (still on disk) are returned.
 */
function buildFavorites(
  upratedIds: Set<string>,
  categories: CategoryInfo[],
  max: number,
): RecommendedImage[] {
  const result: RecommendedImage[] = [];
  const validCategories = new Set(categories.map((c) => c.id));
  const ids = shuffleInPlace([...upratedIds]);
  for (const id of ids) {
    if (result.length >= max) break;
    const slash = id.indexOf("/");
    if (slash <= 0) continue;
    const category = id.slice(0, slash);
    const filename = id.slice(slash + 1);
    if (!validCategories.has(category)) continue;
    const files = getImagesInCategory(category);
    if (!files.includes(filename)) continue;
    result.push({
      category,
      filename,
      url: imageUrl(category, filename),
      label: imageLabel(filename),
      score: 0.5,
      reason: "A favorite of yours",
    });
  }
  return result;
}

export function getLibraryRecommendations(
  userId: string,
  opts: RecommendationOptions = {},
): RecommendationResult {
  const limit = Math.max(1, Math.min(opts.limit ?? 24, 60));
  const includeRated = opts.includeRated === true;

  const summary = getTasteProfile(userId);
  const isCold = summary.confidence === "cold_start";
  const ratings = loadUserRatings(userId);
  const categoryScores = buildCategoryScoreMap(userId);

  const allCategories = getCategories();
  if (allCategories.length === 0) {
    return { confidence: summary.confidence, items: [] };
  }

  // Per-category sample cap so we get coverage without scanning thousands
  // of files; later diversity cap controls how many actually surface.
  const sampleCap = Math.max(4, Math.ceil(limit / 2));

  const candidates: RecommendedImage[] = [];

  for (const cat of allCategories) {
    const catScore = categoryScores.get(cat.id) ?? 0;
    // Strongly avoided categories: skip outside cold start.
    if (!isCold && catScore <= -0.6) continue;

    const allFiles = getImagesInCategory(cat.id);
    if (allFiles.length === 0) continue;

    // Filter by user state
    const eligible = allFiles.filter((f) => {
      const id = `${cat.id}/${f}`;
      if (ratings.downratedIds.has(id)) return false;
      if (!includeRated && ratings.upratedIds.has(id)) return false;
      return true;
    });
    if (eligible.length === 0) continue;

    // Sample randomly within category to avoid always returning the same files
    const sampled = shuffleInPlace([...eligible]).slice(0, sampleCap);

    for (const filename of sampled) {
      const sourceId = `${cat.id}/${filename}`;
      const isUnrated =
        !ratings.upratedIds.has(sourceId) &&
        !ratings.downratedIds.has(sourceId);

      // Cold start: small randomness to surface variety, neutral category bias
      // Otherwise: categoryAffinity dominates, with small adjustments
      let score = isCold ? Math.random() * 0.3 : catScore;
      if (isUnrated) score += 0.1; // unratedBoost
      if (ratings.recentlyRatedIds.has(sourceId)) score -= 0.2; // recentRepeatPenalty
      if (catScore < 0 && !isCold) score -= 0.1; // downratedCategoryPenalty

      candidates.push({
        category: cat.id,
        filename,
        url: imageUrl(cat.id, filename),
        label: imageLabel(filename),
        score: Math.round(score * 100) / 100,
        reason: reasonText(catScore, isCold, cat.label),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  // Diversity cap — keep no single category from dominating the result set.
  const maxPerCat = Math.max(2, Math.ceil(limit / 4));
  const perCatCount = new Map<string, number>();
  const ranked: RecommendedImage[] = [];
  for (const c of candidates) {
    const n = perCatCount.get(c.category) ?? 0;
    if (n >= maxPerCat) continue;
    ranked.push(c);
    perCatCount.set(c.category, n + 1);
    if (ranked.length >= limit) break;
  }

  // Mix in up to 3 liked favorites at the end (Q3 in spec).
  // Skip when caller wants raw rated items already, when cold-start (no
  // favorites yet), or when there's no room.
  const items = ranked.slice(0, limit);
  if (!isCold && !includeRated && ratings.upratedIds.size > 0) {
    const favCount = Math.min(3, ratings.upratedIds.size);
    const favorites = buildFavorites(
      ratings.upratedIds,
      allCategories,
      favCount,
    );
    if (favorites.length > 0 && items.length > 0) {
      const cutoff = Math.max(0, items.length - favorites.length);
      items.splice(cutoff, items.length - cutoff, ...favorites);
    }
  }

  return { confidence: summary.confidence, items };
}
