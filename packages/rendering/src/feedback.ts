import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SceneContext } from "@frame/core";
import { ratings, scenes } from "@frame/db";

/**
 * Derive time-of-day bucket from the current hour.
 */
function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Save a thumbs up/down rating for a scene.
 * Extracts features from the scene's context for preference learning.
 */
export function saveRating(
  db: BetterSQLite3Database,
  sceneId: string,
  rating: "up" | "down",
  context: SceneContext,
): void {
  const features = {
    theme: context.theme,
    weather: context.weather?.sky ?? "unknown",
    marketDirection: context.market?.direction ?? "unknown",
    timeOfDay: getTimeOfDay(),
  };

  db.insert(ratings)
    .values({
      id: crypto.randomUUID(),
      sceneId,
      rating,
      features: JSON.stringify(features),
      ratedAt: new Date().toISOString(),
    })
    .run();
}

interface FeatureStats {
  likes: number;
  total: number;
}

/**
 * Compute natural language style hints from rating history.
 * Returns empty string if fewer than 20 ratings exist.
 */
export function computeStyleHints(db: BetterSQLite3Database): string {
  const allRatings = db.select().from(ratings).all();

  if (allRatings.length < 20) {
    return "";
  }

  // Track stats per feature key + value
  const stats = new Map<string, FeatureStats>();

  for (const row of allRatings) {
    if (!row.features) continue;
    const features = JSON.parse(row.features) as Record<string, string>;
    const isLike = row.rating === "up";

    for (const [key, value] of Object.entries(features)) {
      const statKey = `${key}:${value}`;
      const existing = stats.get(statKey) ?? { likes: 0, total: 0 };
      existing.total += 1;
      if (isLike) existing.likes += 1;
      stats.set(statKey, existing);
    }
  }

  // Compute probabilities and sort into likes/dislikes
  const preferred: { label: string; pLike: number }[] = [];
  const disliked: { label: string; pLike: number }[] = [];

  for (const [statKey, { likes, total }] of stats.entries()) {
    const pLike = likes / total;
    const idx = statKey.indexOf(":");
    const value = statKey.slice(idx + 1);
    if (pLike > 0.65) {
      preferred.push({ label: value, pLike });
    } else if (pLike < 0.35) {
      disliked.push({ label: value, pLike });
    }
  }

  // Sort by strength of signal
  preferred.sort((a, b) => b.pLike - a.pLike);
  disliked.sort((a, b) => a.pLike - b.pLike);

  const parts: string[] = [];

  if (preferred.length > 0) {
    const top = preferred.slice(0, 3).map((p) => p.label);
    parts.push(`User prefers: ${top.join(", ")}`);
  }

  if (disliked.length > 0) {
    const top = disliked.slice(0, 3).map((p) => p.label);
    parts.push(`User dislikes: ${top.join(", ")}`);
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.join(". ");
}
