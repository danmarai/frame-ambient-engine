/** Google OAuth authentication for the phone app */
import type { Request, Response, NextFunction } from "express";

// Google OAuth client ID — set via environment variable
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

interface UserSession {
  userId: string;
  email: string;
  name: string;
  picture: string;
  token: string; // Google ID token
}

// In-memory session store (replace with DB in production)
const sessions = new Map<string, UserSession>();

/** Verify a Google ID token and extract user info */
export async function verifyGoogleToken(
  idToken: string,
): Promise<UserSession | null> {
  try {
    // Verify with Google's tokeninfo endpoint
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

/** Create or get a session from an auth token */
export function createSession(user: UserSession): string {
  const sessionId =
    "sess-" + Math.random().toString(36).substring(2) + Date.now();
  sessions.set(sessionId, user);
  return sessionId;
}

/** Get user from session ID */
export function getSession(sessionId: string): UserSession | null {
  return sessions.get(sessionId) || null;
}

/** Express middleware to check auth (optional — passes through if no auth) */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const sessionId = authHeader.substring(7);
    const session = sessions.get(sessionId);
    if (session) {
      (req as any).user = session;
    }
  }
  next();
}

/** Express middleware to require auth */
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
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  (req as any).user = session;
  next();
}

/** List all active sessions (admin) */
export function listSessions(): Array<{
  sessionId: string;
  email: string;
  name: string;
}> {
  return Array.from(sessions.entries()).map(([id, s]) => ({
    sessionId: id,
    email: s.email,
    name: s.name,
  }));
}
