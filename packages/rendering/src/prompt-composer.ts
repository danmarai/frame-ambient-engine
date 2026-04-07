/**
 * Prompt Composer — transforms scene context into an image generation prompt.
 *
 * Takes weather, market mood, quote, theme, and image style to build
 * a rich prompt for DALL-E or Gemini. The image style controls the
 * visual rendering approach (photorealistic, fine art, etc.).
 */

import type {
  ThemeName,
  ImageStyleName,
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
    style: "golden hour lighting, depth of field",
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
    style: "long exposure water, dramatic sky",
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
    style: "long exposure stars, deep sky, high dynamic range",
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
    style: "dramatic cloud formations, volumetric lighting",
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
    style: "studio ghibli inspired, pastel watercolor, warm and inviting",
    elements: [
      "tiny woodland creatures",
      "floating lanterns",
      "a cozy cottage",
      "blooming cherry blossoms",
      "a gentle rainbow",
    ],
  },
  landmarks: {
    scene: "An iconic world landmark at its most photogenic moment",
    style: "travel photography, architectural detail, dramatic lighting",
    elements: [
      "the Eiffel Tower at golden hour",
      "Machu Picchu in morning mist",
      "the Grand Canyon at sunset",
      "Santorini whitewashed buildings overlooking the sea",
      "Taj Mahal reflected in still water",
      "Great Wall of China winding through mountains",
      "Venice canals with gondolas",
      "Northern Lights over Icelandic landscape",
      "Mount Fuji with cherry blossoms",
      "Angkor Wat at sunrise",
    ],
  },
  natgeo: {
    scene:
      "A National Geographic-worthy scene capturing the raw beauty and drama of the natural world",
    style:
      "National Geographic photography, editorial quality, perfect timing, raw natural beauty",
    elements: [
      "a lion surveying the savanna at dawn",
      "an aerial view of a winding river through dense jungle",
      "a humpback whale breaching in crystal blue ocean",
      "a massive thunderstorm cell over the Great Plains",
      "an emperor penguin colony in Antarctica",
      "the aurora borealis over a frozen tundra",
      "a coral reef teeming with tropical fish",
      "a snow leopard on a Himalayan ridge",
      "lava flowing into the ocean at twilight",
      "a vast herd of wildebeest crossing the Mara River",
    ],
  },
};

/**
 * Image style presets that control the rendering approach.
 * These are appended to the prompt to guide the AI model.
 */
const IMAGE_STYLES: Record<Exclude<ImageStyleName, "random">, string> = {
  photorealistic:
    "Professional DSLR photograph, shot on Canon EOS R5 with 85mm f/1.4 lens. " +
    "Natural lighting, realistic colors, no digital artifacts. " +
    "Indistinguishable from a real photograph. RAW quality, sharp focus.",
  "fine-art":
    "Gallery-quality fine art painting. Oil on canvas texture with visible brushstrokes. " +
    "Rich color palette, museum-worthy composition. Classical artistic technique.",
  artistic:
    "Digital art with a polished, stylized aesthetic. Rich colors, " +
    "clean composition, artistic interpretation of reality.",
  illustration:
    "High-quality digital illustration, concept art style. " +
    "Clean linework, vibrant colors, detailed scene design. " +
    "Trending on ArtStation, professional illustrator quality.",
};

/** Resolve 'random' to a concrete style. */
function resolveStyle(
  style: ImageStyleName,
): Exclude<ImageStyleName, "random"> {
  if (style !== "random") return style;
  const options = Object.keys(IMAGE_STYLES) as Exclude<
    ImageStyleName,
    "random"
  >[];
  return options[Math.floor(Math.random() * options.length)]!;
}

/** Map weather conditions to visual modifiers. */
function weatherToVisual(weather: SemanticWeather): string {
  const parts: string[] = [];

  const skyMap: Record<string, string> = {
    clear: "clear blue sky with brilliant sunlight",
    "partly-cloudy": "scattered clouds with patches of blue sky",
    cloudy: "a soft overcast sky with diffused light",
    overcast: "dramatic heavy clouds, moody atmosphere",
    fog: "mysterious fog rolling through the scene, soft diffused light",
  };
  parts.push(skyMap[weather.sky] ?? "open sky");

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
 *
 * @param context - The scene context (weather, market, quote, theme)
 * @param imageStyle - The rendering style to use (default: "photorealistic")
 */
export function composePrompt(
  context: SceneContext,
  imageStyle: ImageStyleName = "photorealistic",
): string {
  const theme = THEME_PALETTES[context.theme];
  const style = resolveStyle(imageStyle);
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

  // Style preferences from taste feedback
  if (context.styleHints && context.styleHints.length > 0) {
    parts.push(`Style preferences: ${context.styleHints}`);
  }

  // Image style direction
  parts.push(IMAGE_STYLES[style]);

  // Theme-specific style hints
  parts.push(`Style: ${theme.style}`);

  // Composition direction
  parts.push(
    "Wide 16:9 landscape composition, suitable as ambient wall art for a living room display. No text, no watermarks, no people.",
  );

  return parts.join(". ") + ".";
}
