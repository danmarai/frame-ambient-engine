/**
 * Provider factory — resolves concrete provider instances based on settings and env.
 */

import type {
  WeatherProvider,
  MarketProvider,
  QuoteProvider,
  ImageProvider,
  ImageProviderName,
  TvPublisher,
} from "@frame/core";
import {
  MockMarketProvider,
  MockImageProvider,
  MockQuoteProvider,
  OpenMeteoWeatherProvider,
  OpenAIImageProvider,
  GeminiImageProvider,
} from "@frame/providers";
import { MockTvPublisher, DlnaFramePublisher } from "@frame/tv";
import { loadEnvConfig } from "@frame/config";

export function getWeatherProvider(): WeatherProvider {
  // Open-Meteo is free, always use real provider
  return new OpenMeteoWeatherProvider();
}

export function getMarketProvider(): MarketProvider {
  // Market data stays mock for now — no reliable free API wired yet
  return new MockMarketProvider();
}

export function getQuoteProvider(): QuoteProvider {
  return new MockQuoteProvider();
}

export function getImageProvider(name?: ImageProviderName): ImageProvider {
  const env = loadEnvConfig();
  const providerName = name ?? (env.imageProvider as ImageProviderName);

  switch (providerName) {
    case "openai": {
      if (!env.openaiApiKey) {
        console.warn("OPENAI_API_KEY not set, falling back to mock");
        return new MockImageProvider();
      }
      return new OpenAIImageProvider(env.openaiApiKey);
    }
    case "gemini": {
      if (!env.geminiApiKey) {
        console.warn("GEMINI_API_KEY not set, falling back to mock");
        return new MockImageProvider();
      }
      return new GeminiImageProvider(env.geminiApiKey);
    }
    default:
      return new MockImageProvider();
  }
}

export function getTvPublisher(tvIp?: string): TvPublisher {
  const env = loadEnvConfig();

  if (tvIp || env.samsungTvIp) {
    return new DlnaFramePublisher();
  }

  return new MockTvPublisher();
}
