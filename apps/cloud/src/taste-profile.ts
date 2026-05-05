/**
 * Taste profile service — ratings, profile computation, and recommendations.
 *
 * Core service for the Curateur taste loop. Handles:
 * - Recording art ratings (up/down) for generated and library art
 * - Computing user taste profiles from rating history
 * - Providing library recommendations ranked by taste affinity
 * - Building prompt hints for personalized generation
 */
import { getRawDb } from "./db.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceType = "generated" | "library";
export type Rating = "up" | "down";
export type Confidence = "cold_start" | "learning" | "useful";

export interface RatingInput {
  userId: string;
  tvId?: string;
  sourceType: SourceType;
  sourceId: string;
  rating: Rating;
  category?: string;
  filename?: string;
  prompt?: string;
  provider?: string;
  contextJson?: string;
}

export interface RatingResult {
  id: number;
  rating: Rating;
  sourceType: SourceType;
  sourceId: string;
  profile: ProfileSummary;
}

export interface CategoryScore {
  id: string;
  score: number;
}

export interface TasteProfile {
  version: number;
  topCategories: CategoryScore[];
  avoidedCategories: CategoryScore[];
  styleHints: string[];
  avoidHints: string[];
  sourceWeights: { generated: number; library: number };
  confidence: Confidence;
  lastRatingAt: string;
}

export interface ProfileSummary {
  confidence: Confidence;
  ratingsCount: number;
  positiveCount: number;
  negativeCount: number;
  topCategories: CategoryScore[];
  styleHints: string[];
  avoidHints: string[];
  message: string;
}

export interface RecommendedImage {
  category: string;
  filename: string;
  url: string;
  label: string;
  score: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Rating persistence
// ---------------------------------------------------------------------------

export function recordRating(input: RatingInput): RatingResult {
  const db = getRawDb();
  const now = new Date().toISOString();

  // Upsert by (user_id, source_type, source_id)
  db.prepare(
    `
    INSERT INTO art_ratings (user_id, tv_id, source_type, source_id, rating,
      category, filename, prompt, provider, context_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, source_type, source_id) DO UPDATE SET
      rating = excluded.rating,
      tv_id = COALESCE(excluded.tv_id, art_ratings.tv_id),
      updated_at = excluded.updated_at
  `,
  ).run(
    input.userId,
    input.tvId || null,
    input.sourceType,
    input.sourceId,
    input.rating,
    input.category || null,
    input.filename || null,
    input.prompt || null,
    input.provider || null,
    input.contextJson || null,
    now,
    now,
  );

  const row = db
    .prepare(
      "SELECT id FROM art_ratings WHERE user_id = ? AND source_type = ? AND source_id = ?",
    )
    .get(input.userId, input.sourceType, input.sourceId) as { id: number };

  // Recompute profile synchronously
  const result = recomputeProfile(input.userId);
  const { _counts, ...profile } = result;

  logger.info(
    {
      userId: input.userId,
      sourceType: input.sourceType,
      rating: input.rating,
    },
    "Rating recorded",
  );

  return {
    id: row.id,
    rating: input.rating,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    profile: toProfileSummary(
      profile,
      _counts.total,
      _counts.ups,
      _counts.downs,
    ),
  };
}

export function getUserRating(
  userId: string,
  sourceType: SourceType,
  sourceId: string,
): Rating | null {
  const row = getRawDb()
    .prepare(
      "SELECT rating FROM art_ratings WHERE user_id = ? AND source_type = ? AND source_id = ?",
    )
    .get(userId, sourceType, sourceId) as { rating: string } | undefined;
  return (row?.rating as Rating) || null;
}

// ---------------------------------------------------------------------------
// Profile computation
// ---------------------------------------------------------------------------

function getConfidence(count: number): Confidence {
  if (count < 5) return "cold_start";
  if (count < 20) return "learning";
  return "useful";
}

function confidenceMessage(confidence: Confidence, count: number): string {
  switch (confidence) {
    case "cold_start":
      return `Rate ${5 - count} more piece${5 - count === 1 ? "" : "s"} to start personalizing recommendations.`;
    case "learning":
      return "Learning your taste";
    case "useful":
      return "Personalized recommendations active";
  }
}

export function recomputeProfile(
  userId: string,
): TasteProfile & { _counts: { total: number; ups: number; downs: number } } {
  const db = getRawDb();

  const counts = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as ups,
      SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) as downs
    FROM art_ratings WHERE user_id = ?
  `,
    )
    .get(userId) as { total: number; ups: number; downs: number };

  const confidence = getConfidence(counts.total);

  // Category scores: likes - dislikes, normalized
  const categoryRows = db
    .prepare(
      `
    SELECT category,
      SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as ups,
      SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) as downs,
      COUNT(*) as total
    FROM art_ratings
    WHERE user_id = ? AND category IS NOT NULL
    GROUP BY category
  `,
    )
    .all(userId) as Array<{
    category: string;
    ups: number;
    downs: number;
    total: number;
  }>;

  const categoryScores: CategoryScore[] = categoryRows
    .map((r) => ({
      id: r.category,
      score: r.total > 0 ? (r.ups - r.downs) / r.total : 0,
    }))
    .sort((a, b) => b.score - a.score);

  const topCategories = categoryScores.filter((c) => c.score > 0).slice(0, 5);
  const avoidedCategories = categoryScores
    .filter((c) => c.score < 0)
    .slice(-3)
    .reverse();

  // Source weights
  const sourceRows = db
    .prepare(
      `
    SELECT source_type,
      COUNT(*) as total,
      SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as ups
    FROM art_ratings WHERE user_id = ?
    GROUP BY source_type
  `,
    )
    .all(userId) as Array<{ source_type: string; total: number; ups: number }>;

  const genRow = sourceRows.find((r) => r.source_type === "generated");
  const libRow = sourceRows.find((r) => r.source_type === "library");
  const totalRated = (genRow?.total || 0) + (libRow?.total || 0);
  const sourceWeights = {
    generated: totalRated > 0 ? (genRow?.total || 0) / totalRated : 0.5,
    library: totalRated > 0 ? (libRow?.total || 0) / totalRated : 0.5,
  };

  // Build style hints from liked categories and prompts
  const styleHints = buildStyleHints(userId, db);
  const avoidHints = buildAvoidHints(userId, db);

  const lastRating = db
    .prepare(
      "SELECT MAX(updated_at) as last FROM art_ratings WHERE user_id = ?",
    )
    .get(userId) as { last: string | null };

  const profile: TasteProfile = {
    version: 1,
    topCategories,
    avoidedCategories,
    styleHints,
    avoidHints,
    sourceWeights,
    confidence,
    lastRatingAt: lastRating.last || new Date().toISOString(),
  };

  // Persist profile
  db.prepare(
    `
    INSERT INTO taste_profiles (user_id, profile_json, ratings_count, positive_count, negative_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      profile_json = excluded.profile_json,
      ratings_count = excluded.ratings_count,
      positive_count = excluded.positive_count,
      negative_count = excluded.negative_count,
      updated_at = excluded.updated_at
  `,
  ).run(
    userId,
    JSON.stringify(profile),
    counts.total,
    counts.ups,
    counts.downs,
    new Date().toISOString(),
  );

  return { ...profile, _counts: counts };
}

function buildStyleHints(userId: string, db: any): string[] {
  // Extract patterns from liked items
  const likedCategories = db
    .prepare(
      `
    SELECT DISTINCT category FROM art_ratings
    WHERE user_id = ? AND rating = 'up' AND category IS NOT NULL
    ORDER BY updated_at DESC LIMIT 5
  `,
    )
    .all(userId) as Array<{ category: string }>;

  return likedCategories.map((r) => r.category.toLowerCase());
}

function buildAvoidHints(userId: string, db: any): string[] {
  const dislikedCategories = db
    .prepare(
      `
    SELECT DISTINCT category FROM art_ratings
    WHERE user_id = ? AND rating = 'down' AND category IS NOT NULL
    ORDER BY updated_at DESC LIMIT 3
  `,
    )
    .all(userId) as Array<{ category: string }>;

  return dislikedCategories.map((r) => r.category.toLowerCase());
}

// ---------------------------------------------------------------------------
// Profile retrieval
// ---------------------------------------------------------------------------

/**
 * Returns the parsed full taste profile JSON, or null for users with no
 * recorded ratings. Use this when callers need fields beyond the
 * ProfileSummary shape (e.g. avoidedCategories, sourceWeights).
 */
export function getFullProfile(userId: string): TasteProfile | null {
  const row = getRawDb()
    .prepare("SELECT profile_json FROM taste_profiles WHERE user_id = ?")
    .get(userId) as { profile_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.profile_json) as TasteProfile;
  } catch {
    return null;
  }
}

export function getTasteProfile(userId: string): ProfileSummary {
  const db = getRawDb();
  const row = db
    .prepare(
      "SELECT profile_json, ratings_count, positive_count, negative_count FROM taste_profiles WHERE user_id = ?",
    )
    .get(userId) as
    | {
        profile_json: string;
        ratings_count: number;
        positive_count: number;
        negative_count: number;
      }
    | undefined;

  if (!row) {
    return {
      confidence: "cold_start",
      ratingsCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      topCategories: [],
      styleHints: [],
      avoidHints: [],
      message: "Rate 5 pieces to start personalizing recommendations.",
    };
  }

  const profile = JSON.parse(row.profile_json) as TasteProfile;
  return toProfileSummary(
    profile,
    row.ratings_count,
    row.positive_count,
    row.negative_count,
  );
}

function toProfileSummary(
  profile: TasteProfile,
  ratingsCount: number,
  positiveCount: number,
  negativeCount: number,
): ProfileSummary {
  return {
    confidence: profile.confidence,
    ratingsCount,
    positiveCount,
    negativeCount,
    topCategories: profile.topCategories,
    styleHints: profile.styleHints,
    avoidHints: profile.avoidHints,
    message: confidenceMessage(profile.confidence, ratingsCount),
  };
}

// ---------------------------------------------------------------------------
// Prompt personalization
// ---------------------------------------------------------------------------

/**
 * Build prompt-ready hint strings from a taste profile.
 *
 * Hint volume scales with confidence (per spec Q4):
 *   - cold_start: no hints (returns null)
 *   - learning  (5-19 ratings): conservative — top 2 styles, top 1 avoid
 *   - useful    (20+ ratings):  full — top 5 styles, top 3 avoids
 *
 * The strings returned are bare phrases (e.g. "warm coastal light, painterly
 * landscapes") suitable for the rendering composer to wrap with its own
 * prefixes ("Style preferences: ...", "Avoid: ...").
 */
export function buildTastePromptHints(
  profile: ProfileSummary,
): { positive: string; negative: string } | null {
  if (profile.confidence === "cold_start") return null;

  const styleLimit = profile.confidence === "learning" ? 2 : 5;
  const avoidLimit = profile.confidence === "learning" ? 1 : 3;

  const styleSlice = profile.styleHints.slice(0, styleLimit);
  const avoidSlice = profile.avoidHints.slice(0, avoidLimit);

  const positive =
    styleSlice.length > 0
      ? `User taste: prefers ${styleSlice.join(", ")}.`
      : "";

  const negative =
    avoidSlice.length > 0 ? `Avoid: ${avoidSlice.join(", ")}.` : "";

  if (!positive && !negative) return null;

  return { positive, negative };
}
