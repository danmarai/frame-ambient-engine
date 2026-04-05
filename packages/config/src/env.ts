/**
 * Environment variable access with explicit documentation.
 * Secrets stay server-side. The browser never receives raw credentials.
 */

export function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (!value && fallback === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || fallback || "";
}

export function getOptionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

export interface EnvConfig {
  sessionSecret: string;
  passwordHash: string;
  samsungTvIp?: string;
  samsungTvToken?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  imageProvider: string;
  databaseUrl: string;
  defaultLatitude?: string;
  defaultLongitude?: string;
}

export function loadEnvConfig(): EnvConfig {
  return {
    sessionSecret: getEnv("SESSION_SECRET"),
    passwordHash: getEnv("APP_PASSWORD_HASH"),
    samsungTvIp: getOptionalEnv("SAMSUNG_TV_IP"),
    samsungTvToken: getOptionalEnv("SAMSUNG_TV_TOKEN"),
    openaiApiKey: getOptionalEnv("OPENAI_API_KEY"),
    geminiApiKey: getOptionalEnv("GEMINI_API_KEY"),
    imageProvider: getEnv("IMAGE_PROVIDER", "mock"),
    databaseUrl: getEnv("DATABASE_URL", "file:../../data/frame.db"),
    defaultLatitude: getOptionalEnv("DEFAULT_LATITUDE"),
    defaultLongitude: getOptionalEnv("DEFAULT_LONGITUDE"),
  };
}
