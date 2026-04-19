/**
 * Shared middleware and utilities for route handlers.
 *
 * Provides rate limiters, IP validation, and async route wrapping
 * used across all route modules.
 */
import express from "express";
import rateLimit from "express-rate-limit";

// --- Async Handler ---

type AsyncHandler = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<void>;

/** Wrap async Express handlers so errors forward to error middleware */
export function asyncHandler(fn: AsyncHandler): AsyncHandler {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// --- IP Validation (SSRF Prevention) ---

/**
 * Validate that a TV IP is a private/local network address.
 * Prevents SSRF attacks where an attacker could make the server
 * fetch from arbitrary internal or external IPs.
 */
export function isValidTvIp(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = nums;
  return (
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local)
    a === 127 // 127.0.0.0/8 (loopback)
  );
}

/** Middleware: validate tvIp in request body */
export function requireValidTvIp(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const tvIp = req.body?.tvIp;
  if (tvIp && !isValidTvIp(tvIp)) {
    res
      .status(400)
      .json({ error: "Invalid TV IP — must be a private network address" });
    return;
  }
  next();
}

// --- Rate Limiters ---

/** Auth: 10 attempts per 15 minutes per IP */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many auth attempts, try again later" },
});

/** Generation: 20 per hour per IP (each call hits paid AI APIs) */
export const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Generation rate limit reached, try again later" },
});

/** Telemetry: 60 per minute per IP */
export const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Telemetry rate limit reached" },
});
