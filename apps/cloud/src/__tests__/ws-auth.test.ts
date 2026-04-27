import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "http";
import { createSession } from "../auth.js";
import {
  authenticatePhoneWs,
  getWsBearerToken,
  shouldRequirePhoneWsAuth,
} from "../ws-auth.js";

function mockRequest(
  url: string,
  headers: Record<string, string | undefined> = {},
): IncomingMessage {
  return {
    url,
    headers: {
      host: "localhost:3847",
      ...headers,
    },
  } as IncomingMessage;
}

function mockUser() {
  return {
    userId: "google-user-123",
    email: "test@example.com",
    name: "Test User",
    picture: "https://example.com/photo.jpg",
    token: "fake-google-id-token",
  };
}

describe("ws-auth", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRequirePhoneWsAuth = process.env.REQUIRE_PHONE_WS_AUTH;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalRequirePhoneWsAuth === undefined) {
      delete process.env.REQUIRE_PHONE_WS_AUTH;
    } else {
      process.env.REQUIRE_PHONE_WS_AUTH = originalRequirePhoneWsAuth;
    }
  });

  beforeEach(() => {
    delete process.env.REQUIRE_PHONE_WS_AUTH;
  });

  it("should read token from the ws query string", () => {
    const req = mockRequest("/ws/phone?token=sess-abc");
    expect(getWsBearerToken(req)).toBe("sess-abc");
  });

  it("should prefer Authorization bearer token over query token", () => {
    const req = mockRequest("/ws/phone?token=sess-query", {
      authorization: "Bearer sess-header",
    });
    expect(getWsBearerToken(req)).toBe("sess-header");
  });

  it("should authenticate a valid phone websocket session", () => {
    const sessionId = createSession(mockUser());
    const req = mockRequest(`/ws/phone?token=${sessionId}`);

    const auth = authenticatePhoneWs(req);

    expect(auth).not.toBeNull();
    expect(auth!.sessionId).toBe(sessionId);
    expect(auth!.user.userId).toBe("google-user-123");
  });

  it("should reject an invalid phone websocket session", () => {
    const req = mockRequest("/ws/phone?token=sess-invalid");
    expect(authenticatePhoneWs(req)).toBeNull();
  });

  it("should require phone websocket auth in production", () => {
    process.env.NODE_ENV = "production";
    expect(shouldRequirePhoneWsAuth()).toBe(true);
  });

  it("should allow explicit auth enforcement outside production", () => {
    process.env.NODE_ENV = "test";
    process.env.REQUIRE_PHONE_WS_AUTH = "true";
    expect(shouldRequirePhoneWsAuth()).toBe(true);
  });
});
