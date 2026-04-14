/**
 * Unit tests for tv-connections module.
 *
 * Manages in-memory WebSocket connections for TV apps and phone clients.
 * Tests cover registration, removal, message sending, and IP lookup.
 */
import { describe, it, expect, vi } from "vitest";
import {
  addTvConnection,
  removeTvConnection,
  getTvConnection,
  addPhoneConnection,
  removePhoneConnection,
  getPhoneConnection,
  sendToTv,
  sendToPhone,
  getTvIp,
} from "../tv-connections.js";

// Create a minimal mock WebSocket
function mockWs(readyState = 1) {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState,
    on: vi.fn(),
  } as any;
}

describe("tv-connections", () => {
  describe("TV connections", () => {
    it("should register a TV connection", () => {
      const ws = mockWs();
      addTvConnection("tv-conn-1", "192.168.1.10", "ABC123", ws);
      const conn = getTvConnection("tv-conn-1");
      expect(conn).toBeDefined();
      expect(conn!.tvId).toBe("tv-conn-1");
      expect(conn!.tvIp).toBe("192.168.1.10");
      expect(conn!.pairingCode).toBe("ABC123");
    });

    it("should close existing connection when same TV re-registers", () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      addTvConnection("tv-recon", "192.168.1.10", "ABC123", ws1);
      addTvConnection("tv-recon", "192.168.1.10", "DEF456", ws2);

      expect(ws1.close).toHaveBeenCalled();
      const conn = getTvConnection("tv-recon");
      expect(conn!.pairingCode).toBe("DEF456");
    });

    it("should remove a TV connection", () => {
      const ws = mockWs();
      addTvConnection("tv-remove", "192.168.1.10", "ABC123", ws);
      removeTvConnection("tv-remove");
      expect(getTvConnection("tv-remove")).toBeUndefined();
    });

    it("should not crash removing nonexistent TV", () => {
      expect(() => removeTvConnection("nonexistent")).not.toThrow();
    });
  });

  describe("Phone connections", () => {
    it("should register a phone connection", () => {
      const ws = mockWs();
      addPhoneConnection("phone-conn-1", ws);
      const conn = getPhoneConnection("phone-conn-1");
      expect(conn).toBeDefined();
      expect(conn!.sessionId).toBe("phone-conn-1");
    });

    it("should remove a phone connection", () => {
      const ws = mockWs();
      addPhoneConnection("phone-remove", ws);
      removePhoneConnection("phone-remove");
      expect(getPhoneConnection("phone-remove")).toBeUndefined();
    });
  });

  describe("sendToTv", () => {
    it("should send JSON message to connected TV", () => {
      const ws = mockWs(1); // OPEN
      addTvConnection("tv-send", "192.168.1.10", "ABC123", ws);

      const result = sendToTv("tv-send", { type: "test", data: "hello" });
      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "test", data: "hello" }),
      );
    });

    it("should return false for disconnected TV", () => {
      const ws = mockWs(3); // CLOSED
      addTvConnection("tv-closed", "192.168.1.10", "ABC123", ws);

      const result = sendToTv("tv-closed", { type: "test" });
      expect(result).toBe(false);
    });

    it("should return false for unknown TV", () => {
      const result = sendToTv("nonexistent-tv", { type: "test" });
      expect(result).toBe(false);
    });
  });

  describe("sendToPhone", () => {
    it("should send JSON message to connected phone", () => {
      const ws = mockWs(1);
      addPhoneConnection("phone-send", ws);

      const result = sendToPhone("phone-send", { type: "status", ok: true });
      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "status", ok: true }),
      );
    });

    it("should return false for disconnected phone", () => {
      const ws = mockWs(3);
      addPhoneConnection("phone-closed", ws);

      const result = sendToPhone("phone-closed", { type: "test" });
      expect(result).toBe(false);
    });
  });

  describe("getTvIp", () => {
    it("should return IP for registered TV", () => {
      const ws = mockWs();
      addTvConnection("tv-ip-lookup", "10.0.0.42", "ABC123", ws);
      expect(getTvIp("tv-ip-lookup")).toBe("10.0.0.42");
    });

    it("should return undefined for unknown TV", () => {
      expect(getTvIp("nonexistent")).toBeUndefined();
    });
  });
});
