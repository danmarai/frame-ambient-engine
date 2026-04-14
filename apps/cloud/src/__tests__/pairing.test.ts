/**
 * Unit tests for pairing module.
 *
 * The pairing module manages 6-character codes that link a TV to a phone
 * session. Codes expire after 1 hour, can only be claimed once, and are
 * scoped per TV (creating a new code for the same TV invalidates the old one).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createPairingCode,
  claimCode,
  validateCode,
  getSessionByTvId,
  getSessionByPhone,
  cleanExpired,
} from "../pairing.js";

// We need to reset module state between tests since pairing uses an in-memory Map.
// The simplest approach: re-import a fresh module for each test group.
// However, since the module uses a module-level Map, we rely on the fact that
// createPairingCode removes old codes for the same tvId.

describe("pairing", () => {
  // Use unique tvIds per test to avoid cross-test state leakage
  let testCounter = 0;
  function uniqueTvId() {
    return `test-tv-${Date.now()}-${testCounter++}`;
  }

  describe("createPairingCode", () => {
    it("should generate a 6-character code (3 letters + 3 digits)", () => {
      const code = createPairingCode(uniqueTvId(), "192.168.1.100");
      expect(code).toHaveLength(6);
      expect(code.slice(0, 3)).toMatch(/^[A-Z]{3}$/);
      expect(code.slice(3)).toMatch(/^[0-9]{3}$/);
    });

    it("should not include ambiguous characters I or O", () => {
      // Generate many codes and check none contain I or O
      const codes: string[] = [];
      for (let i = 0; i < 100; i++) {
        codes.push(createPairingCode(uniqueTvId(), "192.168.1.100"));
      }
      for (const code of codes) {
        expect(code).not.toMatch(/[IO]/);
      }
    });

    it("should invalidate previous code for the same TV", () => {
      const tvId = uniqueTvId();
      const code1 = createPairingCode(tvId, "192.168.1.100");
      const code2 = createPairingCode(tvId, "192.168.1.100");

      expect(code1).not.toEqual(code2); // extremely unlikely to be the same
      expect(validateCode(code1)).toBeNull(); // old code is gone
      expect(validateCode(code2)).not.toBeNull(); // new code is valid
    });

    it("should allow different TVs to have independent codes", () => {
      const tvId1 = uniqueTvId();
      const tvId2 = uniqueTvId();
      const code1 = createPairingCode(tvId1, "192.168.1.100");
      const code2 = createPairingCode(tvId2, "192.168.1.101");

      expect(validateCode(code1)).not.toBeNull();
      expect(validateCode(code2)).not.toBeNull();
      expect(validateCode(code1)!.tvId).toBe(tvId1);
      expect(validateCode(code2)!.tvId).toBe(tvId2);
    });

    it("should store the TV IP in the session", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "10.0.0.50");
      const session = validateCode(code);
      expect(session).not.toBeNull();
      expect(session!.tvIp).toBe("10.0.0.50");
    });
  });

  describe("validateCode", () => {
    it("should return session for a valid code", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");
      const session = validateCode(code);
      expect(session).not.toBeNull();
      expect(session!.tvId).toBe(tvId);
      expect(session!.code).toBe(code);
    });

    it("should be case-insensitive", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");
      const session = validateCode(code.toLowerCase());
      expect(session).not.toBeNull();
      expect(session!.tvId).toBe(tvId);
    });

    it("should return null for nonexistent code", () => {
      expect(validateCode("ZZZ999")).toBeNull();
    });

    it("should return null for expired code", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");

      // Advance time past 1-hour expiry
      vi.useFakeTimers();
      vi.advanceTimersByTime(61 * 60 * 1000);

      expect(validateCode(code)).toBeNull();

      vi.useRealTimers();
    });
  });

  describe("claimCode", () => {
    it("should claim a valid code and return session", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");
      const session = claimCode(code, "phone-abc");

      expect(session).not.toBeNull();
      expect(session!.tvId).toBe(tvId);
      expect(session!.phoneSessionId).toBe("phone-abc");
      expect(session!.pairedAt).toBeDefined();
      expect(typeof session!.pairedAt).toBe("number");
    });

    it("should reject double-claim of the same code", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");

      const first = claimCode(code, "phone-1");
      expect(first).not.toBeNull();

      const second = claimCode(code, "phone-2");
      expect(second).toBeNull();
    });

    it("should reject claim of expired code", () => {
      const tvId = uniqueTvId();
      vi.useFakeTimers({ now: Date.now() });
      const code = createPairingCode(tvId, "192.168.1.100");
      vi.advanceTimersByTime(61 * 60 * 1000);

      const session = claimCode(code, "phone-xyz");
      expect(session).toBeNull();

      vi.useRealTimers();
    });

    it("should reject claim of nonexistent code", () => {
      expect(claimCode("AAA111", "phone-xyz")).toBeNull();
    });
  });

  describe("getSessionByTvId", () => {
    it("should find a paired session by TV ID", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");
      claimCode(code, "phone-abc");

      const session = getSessionByTvId(tvId);
      expect(session).toBeDefined();
      expect(session!.tvId).toBe(tvId);
      expect(session!.phoneSessionId).toBe("phone-abc");
    });

    it("should return undefined for unpaired TV", () => {
      const tvId = uniqueTvId();
      createPairingCode(tvId, "192.168.1.100");
      // Not claimed
      expect(getSessionByTvId(tvId)).toBeUndefined();
    });

    it("should return undefined for unknown TV", () => {
      expect(getSessionByTvId("nonexistent-tv")).toBeUndefined();
    });
  });

  describe("getSessionByPhone", () => {
    it("should find a session by phone session ID", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");
      claimCode(code, "phone-lookup");

      const session = getSessionByPhone("phone-lookup");
      expect(session).toBeDefined();
      expect(session!.tvId).toBe(tvId);
    });

    it("should return undefined for unknown phone", () => {
      expect(getSessionByPhone("nonexistent-phone")).toBeUndefined();
    });
  });

  describe("cleanExpired", () => {
    it("should remove sessions older than 24 hours", () => {
      vi.useFakeTimers({ now: Date.now() });
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");
      claimCode(code, "phone-old");

      // Advance past 24 * EXPIRY_MS (24 hours of the 1-hour expiry)
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      cleanExpired();
      expect(getSessionByTvId(tvId)).toBeUndefined();

      vi.useRealTimers();
    });

    it("should keep recent paired sessions", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");
      claimCode(code, "phone-recent");

      cleanExpired();
      expect(getSessionByTvId(tvId)).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle rapid code generation for same TV (race condition)", () => {
      const tvId = uniqueTvId();
      // Simulate rapid reconnections
      const codes: string[] = [];
      for (let i = 0; i < 50; i++) {
        codes.push(createPairingCode(tvId, "192.168.1.100"));
      }
      // Only the last code should be valid
      const lastCode = codes[codes.length - 1]!;
      expect(validateCode(lastCode)).not.toBeNull();
      for (let i = 0; i < codes.length - 1; i++) {
        if (codes[i] !== lastCode) {
          expect(validateCode(codes[i]!)).toBeNull();
        }
      }
    });

    it("should handle empty string tvId", () => {
      // This is an API misuse but should not crash
      const code = createPairingCode("", "192.168.1.100");
      expect(code).toHaveLength(6);
      const session = validateCode(code);
      expect(session).not.toBeNull();
      expect(session!.tvId).toBe("");
    });

    it("should handle TV IP change (new code with different IP)", () => {
      const tvId = uniqueTvId();
      const code1 = createPairingCode(tvId, "192.168.1.100");
      const code2 = createPairingCode(tvId, "192.168.1.200"); // IP changed (DHCP)

      const session = validateCode(code2);
      expect(session).not.toBeNull();
      expect(session!.tvIp).toBe("192.168.1.200");
      expect(validateCode(code1)).toBeNull(); // old code invalidated
    });
  });
});
