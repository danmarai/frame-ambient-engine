/**
 * Application settings types.
 *
 * These types define the operator-configurable settings for the
 * Frame Ambient Engine. Settings are persisted in SQLite and
 * editable through the web control panel.
 */

export type LocationMode = "manual" | "auto";

export interface LocationSettings {
  mode: LocationMode;
  lat?: number;
  lon?: number;
  city?: string;
}

export type WeatherIntegrationMode =
  | "reflect"
  | "invert"
  | "accent-only"
  | "off";
export type WeatherTarget = "auto" | "today" | "tomorrow";
export type WeatherBarStyle = "compact" | "large" | "scroll";

export interface WeatherBarSettings {
  enabled: boolean;
  style: WeatherBarStyle;
}

export interface WeatherSettings {
  enabled: boolean;
  mode: WeatherIntegrationMode;
  target: WeatherTarget;
  bar: WeatherBarSettings;
}

export type MarketSymbol = "BTC" | "SPY";
export type MarketTimeframe = "day" | "week";

export interface MarketSettings {
  enabled: boolean;
  symbol: MarketSymbol;
  timeframe: MarketTimeframe;
}

export type ThemeName = "forest" | "ocean" | "astro" | "sky" | "cute";

export interface QuoteSettings {
  enabled: boolean;
}

export type ImageProviderName = "mock" | "gemini" | "openai";

export type TvConnectionStatus = "disconnected" | "pairing" | "connected";

export interface TvSettings {
  ip: string;
  token?: string;
  connectionStatus?: TvConnectionStatus;
  discoveredDevices?: import("./providers").TvDeviceInfo[];
}

export interface SchedulerSettings {
  enabled: boolean;
  intervalMinutes: number;
}

export interface AppSettings {
  location: LocationSettings;
  weather: WeatherSettings;
  market: MarketSettings;
  theme: ThemeName;
  quotes: QuoteSettings;
  imageProvider: ImageProviderName;
  tv: TvSettings;
  scheduler: SchedulerSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  location: { mode: "auto" },
  weather: {
    enabled: true,
    mode: "reflect",
    target: "auto",
    bar: { enabled: true, style: "compact" },
  },
  market: {
    enabled: true,
    symbol: "BTC",
    timeframe: "day",
  },
  theme: "forest",
  quotes: { enabled: true },
  imageProvider: "mock",
  tv: { ip: "" },
  scheduler: {
    enabled: true,
    intervalMinutes: 15,
  },
};
