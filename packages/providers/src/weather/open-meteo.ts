/**
 * Open-Meteo weather provider — free, no API key required.
 * https://open-meteo.com/
 */

import type {
  WeatherProvider,
  SemanticWeather,
  ProviderHealth,
  SkyCondition,
  PrecipitationState,
  TemperatureBand,
  WindBand,
} from "@frame/core";

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    cloud_cover: number;
  };
  current_units: {
    temperature_2m: string;
  };
}

/** WMO weather codes → semantic conditions */
function weatherCodeToSky(code: number): SkyCondition {
  if (code <= 1) return "clear";
  if (code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code >= 45 && code <= 48) return "fog";
  return "overcast";
}

function weatherCodeToPrecipitation(code: number): PrecipitationState {
  if (code <= 3 || (code >= 45 && code <= 48)) return "none";
  if (code >= 51 && code <= 55) return "light-rain";
  if (code >= 56 && code <= 57) return "sleet";
  if (code >= 61 && code <= 63) return "rain";
  if (code >= 65 && code <= 67) return "heavy-rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95) return "thunderstorm";
  return "none";
}

function celsiusToTempBand(c: number): TemperatureBand {
  if (c <= 0) return "freezing";
  if (c <= 10) return "cold";
  if (c <= 15) return "cool";
  if (c <= 22) return "mild";
  if (c <= 30) return "warm";
  return "hot";
}

function windSpeedToBand(kmh: number): WindBand {
  if (kmh <= 5) return "calm";
  if (kmh <= 20) return "light";
  if (kmh <= 40) return "moderate";
  if (kmh <= 70) return "strong";
  return "gale";
}

function weatherCodeToDescription(code: number, tempC: number): string {
  const desc: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  const tempF = Math.round((tempC * 9) / 5 + 32);
  const base = desc[code] ?? `Weather code ${code}`;
  return `${base}, ${tempF}°F (${Math.round(tempC)}°C)`;
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  name = "open-meteo";

  async fetch(lat: number, lon: number): Promise<SemanticWeather> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat.toString());
    url.searchParams.set("longitude", lon.toString());
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,cloud_cover",
    );
    url.searchParams.set("temperature_unit", "celsius");
    url.searchParams.set("wind_speed_unit", "kmh");

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Open-Meteo API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as OpenMeteoResponse;
    const c = data.current;
    const tempC = c.temperature_2m;
    const tempF = Math.round((tempC * 9) / 5 + 32);

    return {
      sky: weatherCodeToSky(c.weather_code),
      precipitation: weatherCodeToPrecipitation(c.weather_code),
      temperature: celsiusToTempBand(tempC),
      temperatureF: tempF,
      temperatureC: Math.round(tempC),
      wind: windSpeedToBand(c.wind_speed_10m),
      humidity: c.relative_humidity_2m,
      description: weatherCodeToDescription(c.weather_code, tempC),
      location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
      fetchedAt: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m",
      );
      return {
        provider: this.name,
        status: res.ok ? "healthy" : "degraded",
        lastChecked: new Date().toISOString(),
        latencyMs: Date.now() - start,
        message: res.ok ? "Open-Meteo API reachable" : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        provider: this.name,
        status: "failed",
        lastChecked: new Date().toISOString(),
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}
