import type {
  AppSettings,
  ThemeName,
  ImageStyleName,
  MarketSymbol,
  MarketTimeframe,
  WeatherIntegrationMode,
  WeatherTarget,
  WeatherBarStyle,
  ImageProviderName,
} from "@frame/core";

const VALID_THEMES: ThemeName[] = [
  "forest",
  "ocean",
  "astro",
  "sky",
  "cute",
  "landmarks",
  "natgeo",
  "science",
  "famous-women",
  "holiday",
];
const VALID_IMAGE_STYLES: ImageStyleName[] = [
  "photorealistic",
  "fine-art",
  "artistic",
  "illustration",
  "random",
];
const VALID_SYMBOLS: MarketSymbol[] = ["BTC", "SPY"];
const VALID_TIMEFRAMES: MarketTimeframe[] = ["day", "week"];
const VALID_WEATHER_MODES: WeatherIntegrationMode[] = [
  "reflect",
  "invert",
  "accent-only",
  "off",
];
const VALID_WEATHER_TARGETS: WeatherTarget[] = ["auto", "today", "tomorrow"];
const VALID_BAR_STYLES: WeatherBarStyle[] = ["compact", "large", "scroll"];
const VALID_IMAGE_PROVIDERS: ImageProviderName[] = ["mock", "gemini", "openai"];

export function validateSettings(input: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Settings must be an object"] };
  }

  const s = input as Record<string, unknown>;

  // Location
  if (s.location && typeof s.location === "object") {
    const loc = s.location as Record<string, unknown>;
    if (loc.mode && !["manual", "auto"].includes(loc.mode as string)) {
      errors.push(`Invalid location mode: ${loc.mode}`);
    }
    if (
      loc.lat !== undefined &&
      (typeof loc.lat !== "number" || loc.lat < -90 || loc.lat > 90)
    ) {
      errors.push("Latitude must be between -90 and 90");
    }
    if (
      loc.lon !== undefined &&
      (typeof loc.lon !== "number" || loc.lon < -180 || loc.lon > 180)
    ) {
      errors.push("Longitude must be between -180 and 180");
    }
  }

  // Weather
  if (s.weather && typeof s.weather === "object") {
    const w = s.weather as Record<string, unknown>;
    if (
      w.mode &&
      !VALID_WEATHER_MODES.includes(w.mode as WeatherIntegrationMode)
    ) {
      errors.push(`Invalid weather mode: ${w.mode}`);
    }
    if (
      w.target &&
      !VALID_WEATHER_TARGETS.includes(w.target as WeatherTarget)
    ) {
      errors.push(`Invalid weather target: ${w.target}`);
    }
    if (w.bar && typeof w.bar === "object") {
      const bar = w.bar as Record<string, unknown>;
      if (
        bar.style &&
        !VALID_BAR_STYLES.includes(bar.style as WeatherBarStyle)
      ) {
        errors.push(`Invalid bar style: ${bar.style}`);
      }
    }
  }

  // Market
  if (s.market && typeof s.market === "object") {
    const m = s.market as Record<string, unknown>;
    if (m.symbol && !VALID_SYMBOLS.includes(m.symbol as MarketSymbol)) {
      errors.push(`Invalid market symbol: ${m.symbol}`);
    }
    if (
      m.timeframe &&
      !VALID_TIMEFRAMES.includes(m.timeframe as MarketTimeframe)
    ) {
      errors.push(`Invalid market timeframe: ${m.timeframe}`);
    }
  }

  // Theme
  if (s.theme && !VALID_THEMES.includes(s.theme as ThemeName)) {
    errors.push(`Invalid theme: ${s.theme}`);
  }

  // Image style
  if (
    s.imageStyle &&
    !VALID_IMAGE_STYLES.includes(s.imageStyle as ImageStyleName)
  ) {
    errors.push(`Invalid image style: ${s.imageStyle}`);
  }

  // Image provider
  if (
    s.imageProvider &&
    !VALID_IMAGE_PROVIDERS.includes(s.imageProvider as ImageProviderName)
  ) {
    errors.push(`Invalid image provider: ${s.imageProvider}`);
  }

  // Scheduler
  if (s.scheduler && typeof s.scheduler === "object") {
    const sched = s.scheduler as Record<string, unknown>;
    if (sched.intervalMinutes !== undefined) {
      const interval = sched.intervalMinutes as number;
      if (typeof interval !== "number" || interval < 1 || interval > 1440) {
        errors.push("Scheduler interval must be between 1 and 1440 minutes");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function mergeSettings(
  current: AppSettings,
  partial: Partial<AppSettings>,
): AppSettings {
  return {
    location: { ...current.location, ...partial.location },
    weather: {
      ...current.weather,
      ...partial.weather,
      bar: { ...current.weather.bar, ...partial.weather?.bar },
    },
    market: { ...current.market, ...partial.market },
    theme: partial.theme ?? current.theme,
    imageStyle: partial.imageStyle ?? current.imageStyle,
    overlay: { ...current.overlay, ...partial.overlay },
    holiday: { ...current.holiday, ...partial.holiday },
    quotes: { ...current.quotes, ...partial.quotes },
    imageProvider: partial.imageProvider ?? current.imageProvider,
    tv: { ...current.tv, ...partial.tv },
    scheduler: { ...current.scheduler, ...partial.scheduler },
  };
}
