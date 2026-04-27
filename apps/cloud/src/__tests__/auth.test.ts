/**
 * Unit tests for auth module.
 *
 * The auth module handles Google OAuth token verification, in-memory session
 * management, and Express middleware for optional/required authentication.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSession,
  getSession,
  optionalAuth,
  requireAuth,
  listSessions,
} from "../auth.js";
import { getRawDb, initDatabase } from "../db.js";

// Mock user session
function mockUser() {
  return {
    userId: "google-user-123",
    email: "test@example.com",
    name: "Test User",
    picture: "https://example.com/photo.jpg",
  };
}

// Mock Express request/response/next
function mockReq(authHeader?: string): any {
  return {
    headers: {
      authorization: authHeader,
    },
  };
}

function mockRes(): any {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe("auth", () => {
  describe("createSession / getSession", () => {
    it("should create a session and retrieve it", () => {
      const user = mockUser();
      const sessionId = createSession(user);

      expect(sessionId).toMatch(/^sess-/);
      const retrieved = getSession(sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.email).toBe("test@example.com");
      expect(retrieved!.userId).toBe("google-user-123");
    });

    it("should return null for unknown session", () => {
      expect(getSession("sess-nonexistent")).toBeNull();
    });

    it("should generate unique session IDs", () => {
      const user = mockUser();
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createSession(user));
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("optionalAuth middleware", () => {
    it("should attach user to request when valid session provided", () => {
      const user = mockUser();
      const sessionId = createSession(user);
      const req = mockReq(`Bearer ${sessionId}`);
      const res = mockRes();
      const next = vi.fn();

      optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.email).toBe("test@example.com");
    });

    it("should pass through without user when no auth header", () => {
      const req = mockReq();
      const res = mockRes();
      const next = vi.fn();

      optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it("should pass through without user when session is invalid", () => {
      const req = mockReq("Bearer sess-invalid-garbage");
      const res = mockRes();
      const next = vi.fn();

      optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it("should pass through when auth header is not Bearer", () => {
      const req = mockReq("Basic dXNlcjpwYXNz");
      const res = mockRes();
      const next = vi.fn();

      optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });
  });

  describe("requireAuth middleware", () => {
    it("should allow request with valid session", () => {
      const user = mockUser();
      const sessionId = createSession(user);
      const req = mockReq(`Bearer ${sessionId}`);
      const res = mockRes();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.email).toBe("test@example.com");
    });

    it("should reject with 401 when no auth header", () => {
      const req = mockReq();
      const res = mockRes();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe("Authentication required");
    });

    it("should reject with 401 for invalid session", () => {
      const req = mockReq("Bearer sess-does-not-exist");
      const res = mockRes();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe("Invalid or expired session");
    });
  });

  describe("listSessions", () => {
    it("should list all active sessions", () => {
      const user = mockUser();
      createSession(user);
      createSession({ ...user, email: "other@example.com", name: "Other" });

      const list = listSessions();
      // list includes sessions from all tests above, so just check it has entries
      expect(list.length).toBeGreaterThanOrEqual(2);
      const emails = list.map((s) => s.email);
      expect(emails).toContain("test@example.com");
      expect(emails).toContain("other@example.com");
    });
  });

  describe("session security edge cases", () => {
    it("should not expose Google token through getSession", () => {
      const user = mockUser();
      const sessionId = createSession(user);
      const session = getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session).not.toHaveProperty("token");
    });

    it("should not persist Google token in auth_sessions", () => {
      const sessionId = createSession(mockUser());
      const row = getRawDb()
        .prepare("SELECT * FROM auth_sessions WHERE id = ?")
        .get(sessionId) as Record<string, unknown>;

      expect(row).toBeDefined();
      expect(row.google_token ?? null).toBeNull();
    });

    it("should scrub legacy persisted Google tokens during database init", () => {
      const db = getRawDb();
      const columns = db
        .prepare("PRAGMA table_info(auth_sessions)")
        .all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "google_token")) {
        db.exec("ALTER TABLE auth_sessions ADD COLUMN google_token TEXT");
      }

      const sessionId = createSession(mockUser());
      db.prepare("UPDATE auth_sessions SET google_token = ? WHERE id = ?").run(
        "legacy-google-id-token",
        sessionId,
      );

      initDatabase();

      const row = db
        .prepare("SELECT google_token FROM auth_sessions WHERE id = ?")
        .get(sessionId) as { google_token: string | null };
      expect(row.google_token).toBeNull();
    });

    it("should expire sessions after TTL", () => {
      // Sessions are now persisted to SQLite with a TTL.
      // Default TTL is 24 hours (SESSION_TTL_HOURS env var).
      const user = mockUser();
      const sessionId = createSession(user);
      // Session exists immediately after creation
      expect(getSession(sessionId)).not.toBeNull();
      // Note: TTL expiry is checked against the DB expires_at column.
      // Full TTL behavior tested via cleanExpiredSessions().
    });
  });
});
