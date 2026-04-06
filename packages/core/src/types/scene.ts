/**
 * Scene types — the central domain object.
 *
 * A Scene captures everything about a single generation cycle:
 * the context gathered (weather, market, quote), the prompt composed,
 * and the resulting image. Scenes are the unit of work in the system.
 */

import type { SemanticWeather } from "./providers";
import type { SemanticMarket } from "./providers";
import type { Quote } from "./providers";
import type { ThemeName, ImageProviderName } from "./settings";

export type SceneStatus = "pending" | "generating" | "complete" | "failed";
export type PublishStatus = "pending" | "published" | "failed";

/** The gathered context that feeds prompt composition. */
export interface SceneContext {
  weather: SemanticWeather | null;
  market: SemanticMarket | null;
  quote: Quote | null;
  theme: ThemeName;
  styleHints?: string;
}

/** A fully realized scene with generated image. */
export interface Scene {
  id: string;
  status: SceneStatus;
  context: SceneContext;
  prompt: string | null;
  imageProvider: ImageProviderName | null;
  imagePath: string | null;
  createdAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  favorite?: boolean;
  publishStatus?: PublishStatus;
}

/** A user rating on a generated scene. */
export interface Rating {
  id: string;
  sceneId: string;
  rating: "up" | "down";
  features: Record<string, string>;
  ratedAt: string;
}

/** What the generate endpoint accepts. */
export interface GenerateRequest {
  theme?: ThemeName;
  provider?: ImageProviderName;
}

/** What the generate endpoint returns. */
export interface GenerateResponse {
  scene: Scene;
}
