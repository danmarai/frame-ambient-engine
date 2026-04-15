/**
 * Art generation — wires @frame/rendering with providers.
 * Generates scenes with weather, market, quote overlays.
 */
import { randomUUID } from "crypto";
import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";
// Types — use direct path to avoid ESM/CJS resolution issues
type AppSettings = any;
type ImageProviderName = "openai" | "gemini" | "mock";
type ThemeName = string;
type ImageStyleName = string;

// Inline defaults to avoid cross-module-system import issues
const DEFAULT_SETTINGS: AppSettings = {
  location: { mode: "auto" },
  weather: {
    enabled: true,
    mode: "reflect",
    target: "auto",
    bar: { enabled: true, style: "compact" },
  },
  market: { enabled: true, symbol: "BTC", timeframe: "day" },
  theme: "forest",
  imageStyle: "photorealistic",
  overlay: {
    showQuote: false,
    showWeather: false,
    showMarket: false,
    temperatureUnit: "celsius",
  },
  holiday: { enabled: false },
  quotes: { enabled: true },
  imageProvider: "openai",
  tv: { ip: "" },
  scheduler: { enabled: true, intervalMinutes: 15 },
};
// Lazy-load monorepo packages to avoid ESM/CJS conflicts
async function loadProviders() {
  const providers = await import("@frame/providers");
  return providers;
}
async function loadRendering() {
  const rendering = await import("@frame/rendering");
  return rendering;
}

// Data directory for generated images
const DATA_DIR = path.resolve(process.cwd(), "../../data/images");

// Per-user settings store (in-memory for MVP, will move to DB)
const userSettings = new Map<string, Partial<AppSettings>>();

export function getUserSettings(userId: string): AppSettings {
  const overrides = userSettings.get(userId) || {};
  return { ...DEFAULT_SETTINGS, ...overrides };
}

export function updateUserSettings(
  userId: string,
  updates: Partial<AppSettings>,
): void {
  const current = userSettings.get(userId) || {};
  userSettings.set(userId, { ...current, ...updates });
}

async function getImageProvider(name?: ImageProviderName) {
  const { OpenAIImageProvider, GeminiImageProvider, MockImageProvider } =
    await loadProviders();
  switch (name) {
    case "openai":
      if (!process.env.OPENAI_API_KEY) {
        console.warn("OPENAI_API_KEY not set, falling back to mock");
        return new MockImageProvider();
      }
      return new OpenAIImageProvider(process.env.OPENAI_API_KEY);
    case "gemini":
      if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY not set, falling back to mock");
        return new MockImageProvider();
      }
      return new GeminiImageProvider(process.env.GEMINI_API_KEY);
    case "mock":
      return new MockImageProvider();
    default:
      // Default: OpenAI (Gemini image gen currently broken), fallback to mock
      if (process.env.OPENAI_API_KEY)
        return new OpenAIImageProvider(process.env.OPENAI_API_KEY);
      if (process.env.GEMINI_API_KEY)
        return new GeminiImageProvider(process.env.GEMINI_API_KEY);
      return new MockImageProvider();
  }
}

export interface GenerateOptions {
  userId?: string;
  theme?: ThemeName;
  imageStyle?: ImageStyleName;
  provider?: ImageProviderName;
  overlays?: {
    showWeather?: boolean;
    showMarket?: boolean;
    showQuote?: boolean;
  };
}

export interface GenerateResult {
  sceneId: string;
  imagePath: string;
  imageData: Buffer;
  prompt: string;
  context: Record<string, unknown>;
  durationMs: number;
  provider: string;
}

export async function generate(
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const settings = options.userId
    ? getUserSettings(options.userId)
    : DEFAULT_SETTINGS;

  // Apply location defaults from env
  if (settings.location.lat == null && process.env.DEFAULT_LATITUDE) {
    settings.location.lat = parseFloat(process.env.DEFAULT_LATITUDE);
    settings.location.lon = parseFloat(process.env.DEFAULT_LONGITUDE ?? "0");
  }

  const { OpenMeteoWeatherProvider, MockMarketProvider, MockQuoteProvider } =
    await loadProviders();
  const deps = {
    weather: new OpenMeteoWeatherProvider(),
    market: new MockMarketProvider(),
    quote: new MockQuoteProvider(),
    image: await getImageProvider(options.provider ?? settings.imageProvider),
  };

  console.log(
    `Generating: theme=${options.theme || settings.theme}, style=${options.imageStyle || settings.imageStyle}, provider=${options.provider || settings.imageProvider}`,
  );

  const { generateScene: genScene } = await loadRendering();
  const { scene, imageData: rawImage } = await genScene(deps, settings, {
    theme: options.theme,
    imageStyle: options.imageStyle,
  });

  // Prepare for TV (resize to 3840x2160 JPEG)
  const { prepareForTV: prepTV } = await loadRendering();
  let processedImage = await prepTV(rawImage);

  // Apply overlays if requested
  const overlayOpts = options.overlays || {};
  if (
    overlayOpts.showWeather ||
    overlayOpts.showMarket ||
    overlayOpts.showQuote
  ) {
    const { applyOverlays: applyOvl } = await loadRendering();
    processedImage = await applyOvl(processedImage, scene.context, {
      showWeather: overlayOpts.showWeather ?? false,
      showMarket: overlayOpts.showMarket ?? false,
      showQuote: overlayOpts.showQuote ?? false,
      temperatureUnit: "celsius",
    });
  }

  // Save to filesystem
  await mkdir(DATA_DIR, { recursive: true });
  const sceneId = randomUUID();
  const imagePath = path.join(DATA_DIR, `${sceneId}.jpg`);
  await writeFile(imagePath, processedImage);

  console.log(
    `Generated: ${sceneId} (${processedImage.length} bytes, ${scene.durationMs}ms)`,
  );

  return {
    sceneId,
    imagePath,
    imageData: processedImage,
    prompt: scene.prompt ?? "",
    context: scene.context as unknown as Record<string, unknown>,
    durationMs: scene.durationMs ?? 0,
    provider: options.provider || settings.imageProvider,
  };
}

/** Load a previously generated image */
export async function loadImage(sceneId: string): Promise<Buffer | null> {
  // Validate sceneId to prevent path traversal (must be UUID-like)
  if (!/^[a-f0-9-]{36}$/.test(sceneId)) {
    return null;
  }
  try {
    const imagePath = path.join(DATA_DIR, `${sceneId}.jpg`);
    return await readFile(imagePath);
  } catch {
    // Try .png fallback
    try {
      const imagePath = path.join(DATA_DIR, `${sceneId}.png`);
      return await readFile(imagePath);
    } catch {
      return null;
    }
  }
}

/** List available themes and styles */
export function getGenerationConfig() {
  return {
    themes: [
      { id: "forest", label: "Forest" },
      { id: "ocean", label: "Ocean" },
      { id: "astro", label: "Astro / Night Sky" },
      { id: "sky", label: "Cloudscapes" },
      { id: "cute", label: "Cute / Whimsical" },
      { id: "landmarks", label: "Global Landmarks" },
      { id: "natgeo", label: "National Geographic" },
      { id: "science", label: "Science" },
      { id: "famous-women", label: "Famous Women in History" },
      { id: "holiday", label: "Holiday (auto-seasonal)" },
    ],
    styles: [
      { id: "photorealistic", label: "Photorealistic" },
      { id: "fine-art", label: "Fine Art" },
      { id: "artistic", label: "Artistic" },
      { id: "illustration", label: "Illustration" },
      { id: "random", label: "Random (cycles)" },
    ],
    providers: [
      { id: "openai", label: "OpenAI (DALL-E 3)" },
      { id: "gemini", label: "Google Gemini" },
      { id: "mock", label: "Mock (test)" },
    ],
    overlays: ["weather", "market", "quote"],
  };
}
