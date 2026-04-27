/**
 * Unit tests for pairing module.
 *
 * The pairing module manages 6-character codes that link a TV to a phone
 * session. Codes expire quickly, can only be claimed once, and are persisted
 * in SQLite so restart does not lose active pairings.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getRawDb } from "../db.js";
import {
  createPairingCode,
  claimCode,
  validateCode,
  getSessionByTvId,
  getSessionByPhone,
  cleanExpired,
} from "../pairing.js";

describe("pairing", () => {
  // Use unique tvIds per test to avoid cross-test state leakage
  let testCounter = 0;
  function uniqueTvId() {
    return `test-tv-${Date.now()}-${testCounter++}`;
  }

  beforeEach(() => {
    const db = getRawDb();
    db.prepare("DELETE FROM pairing_codes").run();
    db.prepare("DELETE FROM users").run();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

      vi.useFakeTimers();
      vi.advanceTimersByTime(11 * 60 * 1000);

      expect(validateCode(code)).toBeNull();
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
      vi.advanceTimersByTime(11 * 60 * 1000);

      const session = claimCode(code, "phone-xyz");
      expect(session).toBeNull();
    });

    it("should reject claim of nonexistent code", () => {
      expect(claimCode("AAA111", "phone-xyz")).toBeNull();
    });

    it("should bind an authenticated user to the claimed pairing", () => {
      getRawDb()
        .prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)")
        .run("user-1", "user-1@example.com", new Date().toISOString());

      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");
      const session = claimCode(code, "phone-abc", "user-1");

      expect(session).not.toBeNull();
      expect(session!.userId).toBe("user-1");
      expect(getSessionByTvId(tvId)!.userId).toBe("user-1");
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

      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      cleanExpired();
      expect(getSessionByTvId(tvId)).toBeUndefined();
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
    it("should rate-limit rapid code generation for same TV", () => {
      const tvId = uniqueTvId();
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) {
        codes.push(createPairingCode(tvId, "192.168.1.100"));
      }
      expect(() => createPairingCode(tvId, "192.168.1.100")).toThrow(
        "Too many pairing codes requested",
      );

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

  describe("persistence", () => {
    it("should store active codes in SQLite", () => {
      const tvId = uniqueTvId();
      const code = createPairingCode(tvId, "192.168.1.100");

      const row = getRawDb()
        .prepare("SELECT tv_id, tv_ip FROM pairing_codes WHERE code = ?")
        .get(code) as { tv_id: string; tv_ip: string } | undefined;
      expect(row).toEqual({ tv_id: tvId, tv_ip: "192.168.1.100" });

      const session = validateCode(code);
      expect(session).not.toBeNull();
      expect(session!.tvId).toBe(tvId);
      expect(session!.tvIp).toBe("192.168.1.100");
    });
  });
});
