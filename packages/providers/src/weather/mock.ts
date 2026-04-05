import type {
  WeatherProvider,
  SemanticWeather,
  ProviderHealth,
} from "@frame/core";

const MOCK_CONDITIONS: SemanticWeather[] = [
  {
    sky: "clear",
    precipitation: "none",
    temperature: "warm",
    temperatureF: 75,
    temperatureC: 24,
    wind: "light",
    humidity: 45,
    description: "Clear skies, warm afternoon",
    location: "Mock City",
    fetchedAt: new Date().toISOString(),
  },
  {
    sky: "partly-cloudy",
    precipitation: "none",
    temperature: "mild",
    temperatureF: 62,
    temperatureC: 17,
    wind: "moderate",
    humidity: 60,
    description: "Partly cloudy with a gentle breeze",
    location: "Mock City",
    fetchedAt: new Date().toISOString(),
  },
  {
    sky: "overcast",
    precipitation: "light-rain",
    temperature: "cool",
    temperatureF: 52,
    temperatureC: 11,
    wind: "moderate",
    humidity: 80,
    description: "Light rain, overcast skies",
    location: "Mock City",
    fetchedAt: new Date().toISOString(),
  },
];

export class MockWeatherProvider implements WeatherProvider {
  name = "mock";

  async fetch(_lat: number, _lon: number): Promise<SemanticWeather> {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 200));

    const condition =
      MOCK_CONDITIONS[Math.floor(Math.random() * MOCK_CONDITIONS.length)]!;
    return { ...condition, fetchedAt: new Date().toISOString() };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "healthy",
      lastChecked: new Date().toISOString(),
      latencyMs: 5,
      message: "Mock provider always healthy",
    };
  }
}
