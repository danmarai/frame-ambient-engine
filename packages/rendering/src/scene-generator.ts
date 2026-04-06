/**
 * Scene Generator — orchestrates a full generation cycle.
 *
 * 1. Gather context (weather, market, quote)
 * 2. Compose prompt from context + theme
 * 3. Call image provider
 * 4. Return the generated scene
 */

import type {
  WeatherProvider,
  MarketProvider,
  QuoteProvider,
  ImageProvider,
  SceneContext,
  Scene,
  ThemeName,
  AppSettings,
} from "@frame/core";
import { composePrompt } from "./prompt-composer";
import { RENDER_TARGET } from "./index";

export interface GeneratorDeps {
  weather: WeatherProvider;
  market: MarketProvider;
  quote: QuoteProvider;
  image: ImageProvider;
}

/**
 * Generate a complete scene — from data gathering to image.
 *
 * Returns the Scene object and the raw image buffer.
 * The caller is responsible for persisting both.
 */
export async function generateScene(
  deps: GeneratorDeps,
  settings: AppSettings,
  overrides?: { theme?: ThemeName; styleHints?: string },
): Promise<{ scene: Omit<Scene, "id" | "imagePath">; imageData: Buffer }> {
  const start = Date.now();
  const theme = overrides?.theme ?? settings.theme;

  // 1. Gather context in parallel
  const [weather, market, quote] = await Promise.allSettled([
    settings.weather.enabled &&
    settings.location.lat != null &&
    settings.location.lon != null
      ? deps.weather.fetch(settings.location.lat, settings.location.lon)
      : Promise.resolve(null),
    settings.market.enabled
      ? deps.market.fetch(settings.market.symbol, settings.market.timeframe)
      : Promise.resolve(null),
    settings.quotes.enabled ? deps.quote.getQuote() : Promise.resolve(null),
  ]);

  const context: SceneContext = {
    weather: weather.status === "fulfilled" ? weather.value : null,
    market: market.status === "fulfilled" ? market.value : null,
    quote: quote.status === "fulfilled" ? quote.value : null,
    theme,
    ...(overrides?.styleHints ? { styleHints: overrides.styleHints } : {}),
  };

  // 2. Compose prompt
  const prompt = composePrompt(context);

  // 3. Generate image
  const generated = await deps.image.generate({
    prompt,
    width: RENDER_TARGET.width,
    height: RENDER_TARGET.height,
  });

  const durationMs = Date.now() - start;

  return {
    scene: {
      status: "complete",
      context,
      prompt,
      imageProvider: settings.imageProvider,
      createdAt: new Date(start).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      error: null,
    },
    imageData: generated.data,
  };
}
