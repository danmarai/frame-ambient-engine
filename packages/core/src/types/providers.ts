/**
 * Provider interface types.
 *
 * All external integrations are isolated behind these interfaces.
 * Concrete implementations live in @frame/providers and @frame/tv.
 * The core application logic only depends on these contracts.
 */

// ─── Weather Provider ───────────────────────────────────────

export type SkyCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "overcast"
  | "fog";

export type PrecipitationState =
  | "none"
  | "light-rain"
  | "rain"
  | "heavy-rain"
  | "snow"
  | "sleet"
  | "thunderstorm";

export type TemperatureBand =
  | "freezing"
  | "cold"
  | "cool"
  | "mild"
  | "warm"
  | "hot";
export type WindBand = "calm" | "light" | "moderate" | "strong" | "gale";

export interface SemanticWeather {
  sky: SkyCondition;
  precipitation: PrecipitationState;
  temperature: TemperatureBand;
  temperatureF: number;
  temperatureC: number;
  wind: WindBand;
  humidity: number;
  description: string;
  location: string;
  fetchedAt: string;
}

export interface WeatherProvider {
  name: string;
  fetch(lat: number, lon: number): Promise<SemanticWeather>;
  healthCheck(): Promise<ProviderHealth>;
}

// ─── Market Provider ────────────────────────────────────────

export type MarketDirection = "up" | "down" | "flat";
export type MarketStrength = "strong" | "moderate" | "weak";
export type MarketVolatility = "low" | "medium" | "high";

export interface SemanticMarket {
  symbol: string;
  direction: MarketDirection;
  strength: MarketStrength;
  volatility: MarketVolatility;
  changePercent: number;
  price: number;
  timeframe: string;
  fetchedAt: string;
}

export interface MarketProvider {
  name: string;
  fetch(symbol: string, timeframe: string): Promise<SemanticMarket>;
  healthCheck(): Promise<ProviderHealth>;
}

// ─── Image Generation Provider ──────────────────────────────

export interface ImageGenerationRequest {
  prompt: string;
  width: number;
  height: number;
  style?: string;
}

export interface GeneratedImage {
  data: Buffer;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  provider: string;
  generatedAt: string;
}

export interface ImageProvider {
  name: string;
  generate(request: ImageGenerationRequest): Promise<GeneratedImage>;
  healthCheck(): Promise<ProviderHealth>;
}

// ─── Quote Provider ─────────────────────────────────────────

export interface Quote {
  text: string;
  author?: string;
  source: string;
}

export interface QuoteProvider {
  name: string;
  getQuote(): Promise<Quote>;
  healthCheck(): Promise<ProviderHealth>;
}

// ─── TV Publisher ───────────────────────────────────────────

export interface TvDeviceInfo {
  name: string;
  model: string;
  isFrameTV: boolean;
  isArtMode: boolean;
  firmwareVersion?: string;
}

export interface TvPublishResult {
  success: boolean;
  contentId?: string;
  error?: string;
  durationMs: number;
}

export interface TvPublisher {
  name: string;
  testConnectivity(ip: string): Promise<TvDeviceInfo | null>;
  upload(
    ip: string,
    imageData: Buffer,
    token?: string,
  ): Promise<TvPublishResult>;
  setActive(ip: string, contentId: string, token?: string): Promise<boolean>;
  getArtModeStatus(ip: string, token?: string): Promise<boolean>;
  setArtMode(ip: string, enabled: boolean, token?: string): Promise<boolean>;
  healthCheck(): Promise<ProviderHealth>;
}

// ─── Shared Health ──────────────────────────────────────────

export type ProviderStatus = "healthy" | "degraded" | "failed" | "unknown";

export interface ProviderHealth {
  provider: string;
  status: ProviderStatus;
  lastChecked: string;
  latencyMs?: number;
  message?: string;
}
