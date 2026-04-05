/**
 * Prompt Composer — transforms scene context into an image generation prompt.
 *
 * Takes weather, market mood, quote, and theme to build a rich,
 * artistic prompt for DALL-E or Gemini.
 */

import type {
  ThemeName,
  SceneContext,
  SemanticWeather,
  SemanticMarket,
  Quote,
} from "@frame/core";

/** Theme-specific scene descriptions and artistic direction. */
const THEME_PALETTES: Record<
  ThemeName,
  { scene: string; style: string; elements: string[] }
> = {
  forest: {
    scene:
      "A serene forest clearing with tall ancient trees, dappled light filtering through the canopy",
    style:
      "photorealistic landscape photography, golden hour lighting, depth of field",
    elements: [
      "moss-covered stones",
      "wildflowers",
      "a gentle stream",
      "ferns",
      "fallen leaves",
    ],
  },
  ocean: {
    scene:
      "A sweeping coastal vista with waves meeting the shore, distant horizon line",
    style: "fine art seascape photography, long exposure water, dramatic sky",
    elements: [
      "sea foam",
      "tidepools",
      "distant sailboats",
      "seabirds",
      "coastal rocks",
    ],
  },
  astro: {
    scene:
      "A breathtaking night sky filled with stars above a dark landscape silhouette",
    style:
      "astrophotography, long exposure stars, deep sky, high dynamic range",
    elements: [
      "the Milky Way",
      "meteor streaks",
      "nebula colors",
      "silhouetted trees",
      "a calm lake reflecting the sky",
    ],
  },
  sky: {
    scene:
      "A vast, atmospheric cloudscape viewed from a high vantage point, layers of clouds and light",
    style: "aerial photography, dramatic cloud formations, volumetric lighting",
    elements: [
      "cumulonimbus towers",
      "sun rays",
      "color gradients",
      "distant mountains",
      "wispy cirrus clouds",
    ],
  },
  cute: {
    scene:
      "A whimsical, warm illustration of a cozy scene with adorable characters and soft colors",
    style:
      "studio ghibli inspired illustration, pastel watercolor, warm and inviting",
    elements: [
      "tiny woodland creatures",
      "floating lanterns",
      "a cozy cottage",
      "blooming cherry blossoms",
      "a gentle rainbow",
    ],
  },
};

/** Map weather conditions to visual modifiers. */
function weatherToVisual(weather: SemanticWeather): string {
  const parts: string[] = [];

  // Sky condition
  const skyMap: Record<string, string> = {
    clear: "clear blue sky with brilliant sunlight",
    "partly-cloudy": "scattered clouds with patches of blue sky",
    cloudy: "a soft overcast sky with diffused light",
    overcast: "dramatic heavy clouds, moody atmosphere",
    fog: "mysterious fog rolling through the scene, soft diffused light",
  };
  parts.push(skyMap[weather.sky] ?? "open sky");

  // Precipitation
  if (weather.precipitation !== "none") {
    const precipMap: Record<string, string> = {
      "light-rain": "gentle rain with visible droplets",
      rain: "steady rainfall creating ripples",
      "heavy-rain": "dramatic downpour with sheets of rain",
      snow: "soft snowflakes drifting gently",
      sleet: "mixed precipitation in the air",
      thunderstorm: "dramatic lightning in the distance, stormy atmosphere",
    };
    parts.push(precipMap[weather.precipitation] ?? "");
  }

  // Temperature mood
  const tempMood: Record<string, string> = {
    freezing: "frost-covered, icy blue tones, winter stillness",
    cold: "crisp cold air visible as mist, cool blue palette",
    cool: "fresh autumn-like atmosphere, cool earth tones",
    mild: "comfortable spring-like warmth, balanced natural colors",
    warm: "warm golden light, summer energy, vibrant greens",
    hot: "intense sunlight, heat shimmer, saturated warm tones",
  };
  parts.push(tempMood[weather.temperature] ?? "");

  return parts.filter(Boolean).join(". ");
}

/** Map market mood to abstract visual energy. */
function marketToMood(market: SemanticMarket): string {
  const energy =
    market.direction === "up"
      ? "ascending, optimistic energy"
      : market.direction === "down"
        ? "contemplative, grounding energy"
        : "balanced, harmonious stillness";

  const intensity =
    market.strength === "strong"
      ? "with bold, confident composition"
      : market.strength === "moderate"
        ? "with steady, assured framing"
        : "with subtle, understated presence";

  return `${energy} ${intensity}`;
}

/** Select 2-3 random elements from the theme's element list. */
function pickElements(elements: string[]): string {
  const shuffled = [...elements].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2 + Math.floor(Math.random() * 2)).join(", ");
}

/**
 * Compose a full image generation prompt from scene context.
 */
export function composePrompt(context: SceneContext): string {
  const theme = THEME_PALETTES[context.theme];
  const parts: string[] = [];

  // Base scene
  parts.push(theme.scene);

  // Weather integration
  if (context.weather) {
    parts.push(weatherToVisual(context.weather));
  }

  // Market mood (subtle, abstract)
  if (context.market) {
    parts.push(`The scene conveys ${marketToMood(context.market)}`);
  }

  // Theme elements
  parts.push(`Featuring ${pickElements(theme.elements)}`);

  // Quote integration (very subtle — as feeling, not text)
  if (context.quote) {
    parts.push(
      `The overall mood evokes the feeling of "${context.quote.text}"`,
    );
  }

  // Technical direction
  parts.push(`Style: ${theme.style}`);
  parts.push(
    "Wide 16:9 landscape composition, suitable as ambient wall art for a living room display. No text, no watermarks, no people.",
  );

  return parts.join(". ") + ".";
}
