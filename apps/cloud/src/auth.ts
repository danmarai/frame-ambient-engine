/**
 * Google OAuth authentication for the cloud server.
 *
 * Sessions are persisted to SQLite so they survive server restarts.
 * Each session has a TTL (default 24h) and is cleaned up periodically.
 */
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { getRawDb } from "./db.js";

// Google OAuth client ID — set via environment variable
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// Session TTL: 24 hours by default, configurable via SESSION_TTL_HOURS
const SESSION_TTL_MS =
  (parseInt(process.env.SESSION_TTL_HOURS || "24") || 24) * 60 * 60 * 1000;

export interface UserSession {
  userId: string;
  email: string;
  name: string;
  picture: string;
  token: string; // Google ID token (never sent to clients)
}

/** Verify a Google ID token and extract user info */
export async function verifyGoogleToken(
  idToken: string,
): Promise<UserSession | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
    );
    if (!res.ok) return null;

    const payload = (await res.json()) as Record<string, string>;

    // Verify audience matches our client ID
    if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
      console.error("Token audience mismatch");
      return null;
    }

    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      picture: payload.picture || "",
      token: idToken,
    };
  } catch (err) {
    console.error("Token verification failed:", err);
    return null;
  }
}

/** Create a session and persist it to the database */
export function createSession(user: UserSession): string {
  // Use cryptographically secure session IDs
  const sessionId = `sess-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const db = getRawDb();
  db.prepare(
    `INSERT INTO auth_sessions (id, user_id, email, name, picture, google_token, created_at, expires_at, last_accessed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    user.userId,
    user.email,
    user.name,
    user.picture,
    user.token,
    now,
    expiresAt,
    now,
  );

  // Upsert the user record so we have a persistent user table
  db.prepare(
    `INSERT INTO users (id, email, name, picture, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       picture = excluded.picture,
       last_login_at = excluded.last_login_at`,
  ).run(user.userId, user.email, user.name, user.picture, now, now);

  return sessionId;
}

/** Get user from session ID. Returns null if session doesn't exist or is expired. */
export function getSession(sessionId: string): UserSession | null {
  const db = getRawDb();
  const row = db
    .prepare(
      `SELECT user_id, email, name, picture, google_token, expires_at
       FROM auth_sessions WHERE id = ?`,
    )
    .get(sessionId) as
    | {
        user_id: string;
        email: string;
        name: string;
        picture: string;
        google_token: string;
        expires_at: string;
      }
    | undefined;

  if (!row) return null;

  // Check TTL expiry
  if (new Date(row.expires_at) < new Date()) {
    // Session expired — clean it up
    db.prepare("DELETE FROM auth_sessions WHERE id = ?").run(sessionId);
    return null;
  }

  // Update last accessed time (sliding window for active sessions)
  db.prepare("UPDATE auth_sessions SET last_accessed_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    sessionId,
  );

  return {
    userId: row.user_id,
    email: row.email,
    name: row.name || "",
    picture: row.picture || "",
    token: row.google_token || "",
  };
}

/** Express middleware: attach user to request if valid session exists (optional) */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const sessionId = authHeader.substring(7);
    const session = getSession(sessionId);
    if (session) {
      (req as any).user = session;
    }
  }
  next();
}

/** Express middleware: require valid session or return 401 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const sessionId = authHeader.substring(7);
  const session = getSession(sessionId);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  (req as any).user = session;
  next();
}

/** List all active (non-expired) sessions — for admin/debugging */
export function listSessions(): Array<{
  sessionId: string;
  email: string;
  name: string;
}> {
  const db = getRawDb();
  const rows = db
    .prepare(
      `SELECT id, email, name FROM auth_sessions
       WHERE expires_at > datetime('now')
       ORDER BY created_at DESC`,
    )
    .all() as Array<{ id: string; email: string; name: string }>;

  return rows.map((r) => ({
    sessionId: r.id,
    email: r.email,
    name: r.name || "",
  }));
}

/** Remove expired sessions from the database */
export function cleanExpiredSessions(): number {
  const db = getRawDb();
  const result = db
    .prepare("DELETE FROM auth_sessions WHERE expires_at < datetime('now')")
    .run();
  if (result.changes > 0) {
    console.log(`Cleaned ${result.changes} expired sessions`);
  }
  return result.changes;
}
