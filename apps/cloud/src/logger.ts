/**
 * Structured logging with pino.
 *
 * Logs JSON in production, pretty-printed in development.
 * Each log entry includes a timestamp, level, and message.
 *
 * Usage:
 *   import { logger } from "./logger.js";
 *   logger.info("User signed in", { email: "foo@bar.com" });
 *   logger.error("Upload failed", { tvIp, error: err.message });
 */
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  redact: {
    paths: ["token", "idToken", "sessionId", "*.token", "*.idToken"],
    censor: "[REDACTED]",
  },
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "HH:MM:ss",
        },
      }
    : undefined,
});
