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
} from "@frame/core";

// ---------------------------------------------------------------------------
// Theme palettes
// ---------------------------------------------------------------------------

interface ThemePalette {
  scene: string;
  style: string;
  /** For most themes, 2-3 are picked randomly. For "single-pick" themes, exactly 1 is used as the full scene. */
  elements: string[];
  /** If true, pick exactly one element and use it AS the scene description (replaces base scene). */
  singlePick?: boolean;
}

const THEME_PALETTES: Record<ThemeName, ThemePalette> = {
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

  // Single-pick themes: each element is a complete scene description
  landmarks: {
    scene: "", // Overridden by single pick
    style:
      "travel photography, architectural detail, dramatic natural lighting",
    singlePick: true,
    elements: [
      "The Eiffel Tower in Paris at golden hour, with the Seine River in the foreground and classic Parisian rooftops surrounding it",
      "Machu Picchu at sunrise, morning mist rising from the Urubamba Valley below, lush Andean mountains in the background",
      "The Grand Canyon at sunset, layers of red and orange sandstone stretching to the horizon under a dramatic sky",
      "Santorini, Greece — whitewashed buildings with blue domes overlooking the deep blue Aegean Sea at dusk",
      "The Taj Mahal at dawn, reflected perfectly in the long pool, with the gardens of Agra in soft morning light",
      "The Great Wall of China winding through misty green mountains in the Mutianyu section during autumn",
      "Venice, Italy — gondolas on the Grand Canal with historic palazzos and the Rialto Bridge in warm afternoon light",
      "The Northern Lights dancing over a frozen Icelandic landscape, with snow-covered mountains and a still fjord",
      "Mount Fuji in spring, framed by delicate pink cherry blossoms with Lake Kawaguchi in the foreground",
      "Angkor Wat at sunrise in Cambodia, the temple silhouetted against an orange sky reflected in the moat",
      "Petra, Jordan — the Treasury carved into rose-red sandstone cliffs, viewed through the narrow Siq canyon",
      "The Great Barrier Reef from above — turquoise and deep blue waters with coral formations visible beneath the surface",
    ],
  },
  natgeo: {
    scene: "", // Overridden by single pick
    style:
      "National Geographic photography, editorial quality, perfect timing, raw natural beauty",
    singlePick: true,
    elements: [
      "A male lion surveying the vast Serengeti savanna at dawn, golden grass stretching to the horizon",
      "An aerial view of a winding turquoise river cutting through dense Amazon rainforest canopy",
      "A humpback whale breaching out of crystal-clear Antarctic waters against an iceberg backdrop",
      "A massive supercell thunderstorm over the Great Plains of the American Midwest at twilight",
      "An emperor penguin colony huddled together on Antarctic sea ice under a pale polar sky",
      "The aurora borealis in vivid green and purple over a frozen Norwegian tundra landscape",
      "A vibrant coral reef teeming with tropical fish, sea turtles, and waving anemones in clear ocean water",
      "A snow leopard perched on a rocky Himalayan ridge, scanning the valley below in soft diffused light",
      "Red-hot lava flowing from Kilauea volcano into the Pacific Ocean at twilight, steam rising dramatically",
      "A vast herd of wildebeest crossing the Mara River during the Great Migration, dramatic dust and splashing water",
    ],
  },
  science: {
    scene: "", // Overridden by single pick
    style:
      "scientific illustration meets fine art, educational yet beautiful, detailed and accurate",
    singlePick: true,
    elements: [
      "The double helix structure of DNA unwinding in a bioluminescent cellular landscape, showing base pairs and proteins",
      "A cross-section of planet Earth showing its layers — crust, mantle, outer core, inner core — with tectonic plates visible",
      "The solar system in accurate scale and color, with the Sun casting light across all eight planets and their orbital paths",
      "A neuron firing in the human brain, with dendrites lit up in electric blue and synaptic connections visible in a neural network",
      "The water cycle in a single dramatic landscape — evaporation from the ocean, cloud formation, rain over mountains, rivers returning to sea",
      "An atom's structure with electron orbits, protons, and neutrons, visualized with quantum probability clouds",
      "Deep ocean hydrothermal vents with extremophile organisms glowing in the darkness of the abyssal zone",
      "A butterfly emerging from its chrysalis, showing the metamorphosis stages with wing patterns forming",
      "The formation of a star from a nebula — gas and dust collapsing, protostar igniting, a new sun being born",
      "Bioluminescent plankton illuminating a dark ocean bay, with the Milky Way reflected in the glowing water above",
    ],
  },
  "famous-women": {
    scene: "", // Overridden by single pick
    style:
      "dignified portrait photography, empowering and respectful, historically accurate setting",
    singlePick: true,
    elements: [
      "Marie Curie in her laboratory in Paris, surrounded by scientific instruments and glowing radium samples. Pioneer of radioactivity research, first woman to win a Nobel Prize, and the only person to win Nobel Prizes in two different sciences.",
      "Frida Kahlo in her Casa Azul studio in Mexico City, painting at her easel with her iconic flower crown and bold colors. Revolutionary artist who transformed pain into powerful, deeply personal surrealist art.",
      "Amelia Earhart standing beside her Lockheed Electra aircraft on a sunny airfield. First woman to fly solo across the Atlantic Ocean, she inspired generations to push beyond boundaries.",
      "Ada Lovelace working at Charles Babbage's Analytical Engine in Victorian England. The world's first computer programmer, she envisioned that machines could go beyond pure calculation.",
      "Harriet Tubman leading people through a moonlit forest on the Underground Railroad. She freed over 300 enslaved people and later served as a spy for the Union Army.",
      "Rosa Parks seated on a Montgomery bus, dignified and resolute. Her quiet act of defiance in 1955 became a catalyst for the American Civil Rights Movement.",
      "Malala Yousafzai speaking at a podium with the United Nations emblem, her voice reaching millions. The youngest Nobel Prize laureate, she advocates for girls' education worldwide.",
      "Wangari Maathai planting a tree in the Kenyan highlands with women from her Green Belt Movement. Nobel Peace Prize winner who planted over 51 million trees across Africa.",
      "Hypatia of Alexandria teaching astronomy and mathematics in the ancient Library, surrounded by scrolls and celestial instruments. One of the greatest scholars of the ancient world.",
      "Katherine Johnson at her desk at NASA, calculating orbital trajectories by hand. Her math sent astronauts to the moon and broke barriers for women and Black Americans in science.",
    ],
  },
  holiday: {
    scene: "", // Determined dynamically by getHolidayScene()
    style: "warm, festive, culturally authentic and respectful",
    singlePick: true,
    elements: [], // Populated dynamically
  },
};

// ---------------------------------------------------------------------------
// Holiday calendar
// ---------------------------------------------------------------------------

interface Holiday {
  name: string;
  /** Month (1-12) and day. For floating dates, use approximate. */
  month: number;
  day: number;
  /** How many days before the holiday to start showing themed art. */
  leadDays: number;
  scenes: string[];
}

const HOLIDAYS: Holiday[] = [
  {
    name: "New Year's",
    month: 1,
    day: 1,
    leadDays: 3,
    scenes: [
      "A spectacular New Year's Eve fireworks display over a city skyline reflected in water, midnight celebration",
      "A cozy scene of fresh snow and a warmly lit cabin, symbolizing new beginnings and fresh starts for the new year",
    ],
  },
  {
    name: "Valentine's Day",
    month: 2,
    day: 14,
    leadDays: 5,
    scenes: [
      "A romantic Parisian street scene with heart-shaped lights, roses, and a warm café glow on a winter evening",
      "A field of red and pink tulips stretching to the horizon at sunset, symbolizing love and beauty",
    ],
  },
  {
    name: "Easter",
    month: 4,
    day: 20,
    leadDays: 7,
    scenes: [
      "A vibrant spring meadow with decorated Easter eggs hidden among wildflowers and blooming cherry trees",
      "A serene sunrise over rolling green hills with spring lambs, symbolizing renewal and hope",
    ],
  },
  {
    name: "Independence Day",
    month: 7,
    day: 4,
    leadDays: 3,
    scenes: [
      "Fireworks bursting in red, white, and blue over the Washington Monument and reflecting pool at night",
      "A classic American summer scene — a lakeside celebration with flags, sparklers, and a warm sunset sky",
    ],
  },
  {
    name: "Halloween",
    month: 10,
    day: 31,
    leadDays: 10,
    scenes: [
      "A moonlit New England village on Halloween night — carved pumpkins glowing on porches, autumn leaves swirling, a friendly spooky atmosphere",
      "A misty autumn forest path lined with jack-o-lanterns and golden leaves, mysterious but inviting",
    ],
  },
  {
    name: "Thanksgiving",
    month: 11,
    day: 27,
    leadDays: 7,
    scenes: [
      "A rustic farmhouse table set for Thanksgiving dinner — autumn harvest centerpiece, warm candlelight, golden-brown turkey, family gathering",
      "A beautiful autumn landscape of Vermont — rolling hills covered in red, orange, and gold foliage under a crisp blue sky",
    ],
  },
  {
    name: "Hanukkah",
    month: 12,
    day: 15,
    leadDays: 7,
    scenes: [
      "A beautiful menorah fully lit with all nine candles glowing warmly against a window with a starry winter night outside",
      "A family Hanukkah celebration scene — dreidels, sufganiyot (jelly donuts), gold coins, and warm blue and silver decorations",
    ],
  },
  {
    name: "Christmas",
    month: 12,
    day: 25,
    leadDays: 14,
    scenes: [
      "A classic Christmas scene — a warmly decorated living room with a glowing tree, stockings on the fireplace, soft snowfall visible through the window",
      "A snowy European Christmas market at night — wooden stalls with warm lights, evergreen garlands, mulled wine, and a towering Christmas tree",
    ],
  },
];

/** Check if we're near a holiday and return a themed scene, or null. */
function getHolidayScene(): string | null {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  for (const holiday of HOLIDAYS) {
    // Calculate days until the holiday (simplified — same year)
    const holidayDate = new Date(
      now.getFullYear(),
      holiday.month - 1,
      holiday.day,
    );
    const diff = Math.floor(
      (holidayDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Show themed art during lead days before and on the holiday itself
    if (diff >= 0 && diff <= holiday.leadDays) {
      return holiday.scenes[Math.floor(Math.random() * holiday.scenes.length)]!;
    }
    // Also show on the holiday itself if diff is slightly negative (day-of)
    if (diff >= -1 && diff <= 0) {
      return holiday.scenes[Math.floor(Math.random() * holiday.scenes.length)]!;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Image style presets
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Weather & market helpers
// ---------------------------------------------------------------------------

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

function pickElements(elements: string[]): string {
  const shuffled = [...elements].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2 + Math.floor(Math.random() * 2)).join(", ");
}

function pickOne(elements: string[]): string {
  return elements[Math.floor(Math.random() * elements.length)]!;
}

// ---------------------------------------------------------------------------
// Main prompt composer
// ---------------------------------------------------------------------------

/**
 * Quality directive appended to all prompts.
 * Tells the model its output will be judged professionally.
 */
const QUALITY_DIRECTIVE =
  "This image will be displayed as fine art in a living room and judged by professional art critics. " +
  "Ensure it is culturally, geographically, and contextually accurate. " +
  "Every detail must be authentic and believable.";

/**
 * Compose a full image generation prompt from scene context.
 *
 * @param context - The scene context (weather, market, quote, theme)
 * @param imageStyle - The rendering style to use (default: "photorealistic")
 * @param holidayEnabled - Whether holiday mode is active
 */
export function composePrompt(
  context: SceneContext,
  imageStyle: ImageStyleName = "photorealistic",
  holidayEnabled = false,
): string {
  const theme = THEME_PALETTES[context.theme];
  const style = resolveStyle(imageStyle);
  const parts: string[] = [];

  // Check for holiday override
  if (holidayEnabled || context.theme === "holiday") {
    const holidayScene = getHolidayScene();
    if (holidayScene) {
      parts.push(holidayScene);
      parts.push(IMAGE_STYLES[style]);
      parts.push(QUALITY_DIRECTIVE);
      parts.push(
        "Wide 16:9 landscape composition, suitable as ambient wall art. No text, no watermarks.",
      );
      return parts.join(". ") + ".";
    }
    // No upcoming holiday — fall through to regular theme
  }

  // Single-pick themes: one element IS the full scene
  if (theme.singlePick && theme.elements.length > 0) {
    parts.push(pickOne(theme.elements));
  } else {
    // Multi-element themes: base scene + random elements
    parts.push(theme.scene);
    if (context.weather) {
      parts.push(weatherToVisual(context.weather));
    }
    if (context.market) {
      parts.push(`The scene conveys ${marketToMood(context.market)}`);
    }
    parts.push(`Featuring ${pickElements(theme.elements)}`);
  }

  // Quote integration (subtle — as feeling, not visible text)
  if (context.quote) {
    parts.push(
      `The overall mood evokes the feeling of "${context.quote.text}"`,
    );
  }

  // Style preferences from taste feedback
  if (context.styleHints && context.styleHints.length > 0) {
    parts.push(`Style preferences: ${context.styleHints}`);
  }

  // Image style + theme style
  parts.push(IMAGE_STYLES[style]);
  parts.push(`Style: ${theme.style}`);

  // Quality and composition
  parts.push(QUALITY_DIRECTIVE);
  parts.push(
    "Wide 16:9 landscape composition, suitable as ambient wall art for a living room display. No text, no watermarks, no people.",
  );

  return parts.join(". ") + ".";
}
