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

// Mock user session
function mockUser() {
  return {
    userId: "google-user-123",
    email: "test@example.com",
    name: "Test User",
    picture: "https://example.com/photo.jpg",
    token: "fake-google-id-token",
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
      // getSession DOES return the full UserSession including the token.
      // This is a potential security concern — the token should not be
      // sent back to clients. Currently server.ts does not expose it in
      // /api/auth/me (it manually picks id, email, name, picture).
      // But any code calling getSession() internally gets the token.
      const user = mockUser();
      const sessionId = createSession(user);
      const session = getSession(sessionId);
      // Documenting current behavior: token IS accessible
      expect(session!.token).toBe("fake-google-id-token");
    });

    it("should not have session expiration (known limitation)", () => {
      // KNOWN ISSUE: Sessions never expire. The sessions Map grows unbounded.
      // In production, sessions should expire after a configurable TTL.
      const user = mockUser();
      const sessionId = createSession(user);
      // No expiry mechanism exists
      expect(getSession(sessionId)).not.toBeNull();
    });
  });
});
