/**
 * Unit tests for HTTP route handlers.
 *
 * Tests middleware utilities (isValidTvIp, requireValidTvIp), feedback routes,
 * quote routes, and generation config. Uses mock req/res objects to call
 * handlers directly without standing up a full Express server.
 *
 * DB state is provided by setup.ts (in-memory SQLite).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidTvIp, requireValidTvIp } from "../middleware.js";
import { getRawDb } from "../db.js";
import { getGenerationConfig, getUserSettings } from "../generation.js";
import { getQuoteCategories, pickQuote, getQuoteStats } from "../quotes.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockReq(body?: any, params?: any, query?: any): any {
  return {
    body: body || {},
    params: params || {},
    query: query || {},
    headers: {},
  };
}

function mockRes(): any {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res.headers[k] = v;
    return res;
  };
  res.send = (data: any) => {
    res.body = data;
    return res;
  };
  return res;
}

// ---------------------------------------------------------------------------
// 1. isValidTvIp — RFC 1918 + link-local + loopback validation
// ---------------------------------------------------------------------------

describe("isValidTvIp", () => {
  describe("accepts private RFC 1918 ranges", () => {
    it("should accept 10.0.0.0/8 addresses", () => {
      expect(isValidTvIp("10.0.0.1")).toBe(true);
      expect(isValidTvIp("10.255.255.255")).toBe(true);
      expect(isValidTvIp("10.0.0.0")).toBe(true);
      expect(isValidTvIp("10.1.2.3")).toBe(true);
      expect(isValidTvIp("10.100.200.50")).toBe(true);
    });

    it("should accept 172.16.0.0/12 addresses", () => {
      expect(isValidTvIp("172.16.0.1")).toBe(true);
      expect(isValidTvIp("172.31.255.255")).toBe(true);
      expect(isValidTvIp("172.20.10.5")).toBe(true);
      expect(isValidTvIp("172.16.0.0")).toBe(true);
      expect(isValidTvIp("172.31.0.0")).toBe(true);
    });

    it("should reject 172.x.x.x outside /12 range", () => {
      expect(isValidTvIp("172.15.0.1")).toBe(false);
      expect(isValidTvIp("172.32.0.1")).toBe(false);
      expect(isValidTvIp("172.0.0.1")).toBe(false);
      expect(isValidTvIp("172.255.0.1")).toBe(false);
    });

    it("should accept 192.168.0.0/16 addresses", () => {
      expect(isValidTvIp("192.168.0.1")).toBe(true);
      expect(isValidTvIp("192.168.1.1")).toBe(true);
      expect(isValidTvIp("192.168.255.255")).toBe(true);
      expect(isValidTvIp("192.168.0.0")).toBe(true);
      expect(isValidTvIp("192.168.86.42")).toBe(true);
    });
  });

  describe("accepts link-local and loopback", () => {
    it("should accept 169.254.0.0/16 (link-local)", () => {
      expect(isValidTvIp("169.254.0.1")).toBe(true);
      expect(isValidTvIp("169.254.255.255")).toBe(true);
      expect(isValidTvIp("169.254.1.1")).toBe(true);
    });

    it("should accept 127.0.0.0/8 (loopback)", () => {
      expect(isValidTvIp("127.0.0.1")).toBe(true);
      expect(isValidTvIp("127.0.0.0")).toBe(true);
      expect(isValidTvIp("127.255.255.255")).toBe(true);
      expect(isValidTvIp("127.1.2.3")).toBe(true);
    });
  });

  describe("rejects public IPs", () => {
    it("should reject common public IPs", () => {
      expect(isValidTvIp("8.8.8.8")).toBe(false);
      expect(isValidTvIp("1.1.1.1")).toBe(false);
      expect(isValidTvIp("142.250.80.46")).toBe(false); // google.com
      expect(isValidTvIp("93.184.216.34")).toBe(false); // example.com
      expect(isValidTvIp("0.0.0.0")).toBe(false);
      expect(isValidTvIp("255.255.255.255")).toBe(false);
    });

    it("should reject IPs that look similar to private ranges", () => {
      expect(isValidTvIp("11.0.0.1")).toBe(false); // not 10.x
      expect(isValidTvIp("192.169.1.1")).toBe(false); // not 192.168.x
      expect(isValidTvIp("192.167.1.1")).toBe(false);
      expect(isValidTvIp("169.253.0.1")).toBe(false); // not 169.254.x
      expect(isValidTvIp("128.0.0.1")).toBe(false); // not 127.x
    });
  });

  describe("rejects invalid formats", () => {
    it("should reject non-IP strings", () => {
      expect(isValidTvIp("")).toBe(false);
      expect(isValidTvIp("not-an-ip")).toBe(false);
      expect(isValidTvIp("abc.def.ghi.jkl")).toBe(false);
      expect(isValidTvIp("hello world")).toBe(false);
    });

    it("should reject IPs with wrong number of octets", () => {
      expect(isValidTvIp("192.168.1")).toBe(false);
      expect(isValidTvIp("192.168.1.1.1")).toBe(false);
      expect(isValidTvIp("192")).toBe(false);
      expect(isValidTvIp("192.168")).toBe(false);
    });

    it("should reject IPs with out-of-range octets", () => {
      expect(isValidTvIp("192.168.1.256")).toBe(false);
      expect(isValidTvIp("192.168.1.-1")).toBe(false);
      expect(isValidTvIp("300.168.1.1")).toBe(false);
      expect(isValidTvIp("10.0.0.999")).toBe(false);
    });

    it("should reject IPv6 and other formats", () => {
      expect(isValidTvIp("::1")).toBe(false);
      expect(isValidTvIp("fe80::1")).toBe(false);
      expect(isValidTvIp("192.168.1.1:8080")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// requireValidTvIp middleware
// ---------------------------------------------------------------------------

describe("requireValidTvIp", () => {
  it("should call next when tvIp is a valid private IP", () => {
    const req = mockReq({ tvIp: "192.168.1.100" });
    const res = mockRes();
    const next = vi.fn();

    requireValidTvIp(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("should reject a public IP with 400", () => {
    const req = mockReq({ tvIp: "8.8.8.8" });
    const res = mockRes();
    const next = vi.fn();

    requireValidTvIp(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("private network");
  });

  it("should pass through when tvIp is absent (no validation needed)", () => {
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn();

    requireValidTvIp(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should pass through when body is empty", () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    requireValidTvIp(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Feedback routes — direct handler invocation
// ---------------------------------------------------------------------------

describe("feedback routes", () => {
  // Import the route handlers by extracting them from the router
  // We call the handlers directly with mock req/res.
  let feedbackRouter: any;

  beforeEach(async () => {
    feedbackRouter = (await import("../routes/feedback.js")).default;

    // Clear the feedback table before each test
    const db = getRawDb();
    db.prepare("DELETE FROM feedback").run();
  });

  /**
   * Helper: find a route handler on the Express Router's internal stack.
   * Express stores layers as { route: { path, methods, stack: [{ handle }] } }.
   */
  function findHandler(
    router: any,
    method: string,
    path: string,
  ): Function | null {
    for (const layer of router.stack) {
      if (
        layer.route &&
        layer.route.path === path &&
        layer.route.methods[method]
      ) {
        // Return the last handler in the stack (skips middleware like optionalAuth)
        const handlers = layer.route.stack;
        return handlers[handlers.length - 1].handle;
      }
    }
    return null;
  }

  describe("POST /api/feedback", () => {
    it("should reject missing tvId", () => {
      const handler = findHandler(feedbackRouter, "post", "/api/feedback");
      expect(handler).not.toBeNull();

      const req = mockReq({ contentId: "c1", rating: "up" });
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain("Missing");
    });

    it("should reject missing contentId", () => {
      const handler = findHandler(feedbackRouter, "post", "/api/feedback");

      const req = mockReq({ tvId: "tv1", rating: "up" });
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain("Missing");
    });

    it("should reject missing rating", () => {
      const handler = findHandler(feedbackRouter, "post", "/api/feedback");

      const req = mockReq({ tvId: "tv1", contentId: "c1" });
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain("Missing");
    });

    it("should persist feedback and return count", () => {
      const handler = findHandler(feedbackRouter, "post", "/api/feedback");

      const req = mockReq({
        tvId: "tv-abc",
        contentId: "content-001",
        rating: "up",
      });
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalFeedback).toBe(1);

      // Verify in the database
      const db = getRawDb();
      const rows = db.prepare("SELECT * FROM feedback").all() as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].tv_id).toBe("tv-abc");
      expect(rows[0].content_id).toBe("content-001");
      expect(rows[0].rating).toBe("up");
      expect(rows[0].user_id).toBeNull(); // no auth
      expect(rows[0].timestamp).toBeTruthy();
    });

    it("should increment totalFeedback on multiple submissions", () => {
      const handler = findHandler(feedbackRouter, "post", "/api/feedback");

      // Submit three feedbacks
      for (let i = 0; i < 3; i++) {
        const req = mockReq({
          tvId: "tv-abc",
          contentId: `content-${i}`,
          rating: i % 2 === 0 ? "up" : "down",
        });
        const res = mockRes();
        handler!(req, res, vi.fn());
        expect(res.body.totalFeedback).toBe(i + 1);
      }

      const db = getRawDb();
      const count = db
        .prepare("SELECT COUNT(*) as cnt FROM feedback")
        .get() as { cnt: number };
      expect(count.cnt).toBe(3);
    });

    it("should store userId when auth is present", () => {
      const handler = findHandler(feedbackRouter, "post", "/api/feedback");

      const req = mockReq({
        tvId: "tv-xyz",
        contentId: "content-auth",
        rating: "up",
      });
      // Simulate authenticated user (as optionalAuth would set it)
      req.user = { userId: "google-user-42" };
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.body.success).toBe(true);

      const db = getRawDb();
      const row = db
        .prepare("SELECT user_id FROM feedback WHERE tv_id = ?")
        .get("tv-xyz") as any;
      expect(row.user_id).toBe("google-user-42");
    });
  });

  describe("GET /api/feedback/:tvId", () => {
    it("should return empty array when no feedback exists", () => {
      const handler = findHandler(feedbackRouter, "get", "/api/feedback/:tvId");
      expect(handler).not.toBeNull();

      const req = mockReq(undefined, { tvId: "no-such-tv" });
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("should return feedback filtered by tvId", () => {
      const db = getRawDb();
      const ts = new Date().toISOString();

      // Insert feedback for two different TVs
      db.prepare(
        "INSERT INTO feedback (tv_id, content_id, rating, timestamp) VALUES (?, ?, ?, ?)",
      ).run("tv-A", "c1", "up", ts);
      db.prepare(
        "INSERT INTO feedback (tv_id, content_id, rating, timestamp) VALUES (?, ?, ?, ?)",
      ).run("tv-A", "c2", "down", ts);
      db.prepare(
        "INSERT INTO feedback (tv_id, content_id, rating, timestamp) VALUES (?, ?, ?, ?)",
      ).run("tv-B", "c3", "up", ts);

      const handler = findHandler(feedbackRouter, "get", "/api/feedback/:tvId");

      // Query for tv-A
      const reqA = mockReq(undefined, { tvId: "tv-A" });
      const resA = mockRes();
      handler!(reqA, resA, vi.fn());

      expect(resA.body).toHaveLength(2);
      expect(resA.body.every((r: any) => r.tv_id === "tv-A")).toBe(true);

      // Query for tv-B
      const reqB = mockReq(undefined, { tvId: "tv-B" });
      const resB = mockRes();
      handler!(reqB, resB, vi.fn());

      expect(resB.body).toHaveLength(1);
      expect(resB.body[0].tv_id).toBe("tv-B");
      expect(resB.body[0].content_id).toBe("c3");
    });

    it("should return results ordered by timestamp DESC", () => {
      const db = getRawDb();

      // Insert with known timestamps
      db.prepare(
        "INSERT INTO feedback (tv_id, content_id, rating, timestamp) VALUES (?, ?, ?, ?)",
      ).run("tv-order", "old", "up", "2024-01-01T00:00:00Z");
      db.prepare(
        "INSERT INTO feedback (tv_id, content_id, rating, timestamp) VALUES (?, ?, ?, ?)",
      ).run("tv-order", "mid", "up", "2024-06-15T00:00:00Z");
      db.prepare(
        "INSERT INTO feedback (tv_id, content_id, rating, timestamp) VALUES (?, ?, ?, ?)",
      ).run("tv-order", "new", "up", "2024-12-31T00:00:00Z");

      const handler = findHandler(feedbackRouter, "get", "/api/feedback/:tvId");
      const req = mockReq(undefined, { tvId: "tv-order" });
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.body).toHaveLength(3);
      expect(res.body[0].content_id).toBe("new");
      expect(res.body[1].content_id).toBe("mid");
      expect(res.body[2].content_id).toBe("old");
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Quote routes — categories, pick, stats
// ---------------------------------------------------------------------------

describe("quote routes", () => {
  describe("GET /api/quotes/categories", () => {
    it("should return an array of categories", () => {
      const categories = getQuoteCategories();

      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);

      // Each category should have id and label
      for (const cat of categories) {
        expect(cat).toHaveProperty("id");
        expect(cat).toHaveProperty("label");
        expect(typeof cat.id).toBe("string");
        expect(typeof cat.label).toBe("string");
      }
    });

    it("should include a 'random' category", () => {
      const categories = getQuoteCategories();
      const randomCat = categories.find((c: any) => c.id === "random");
      expect(randomCat).toBeDefined();
    });
  });

  describe("GET /api/quotes/pick", () => {
    it("should return a quote with text, author, and category", () => {
      const quote = pickQuote("random");

      expect(quote).toHaveProperty("text");
      expect(quote).toHaveProperty("author");
      expect(quote).toHaveProperty("category");
      expect(typeof quote.text).toBe("string");
      expect(typeof quote.author).toBe("string");
      expect(quote.text.length).toBeGreaterThan(0);
      expect(quote.author.length).toBeGreaterThan(0);
    });

    it("should return quotes from the requested category", () => {
      const categories = getQuoteCategories();
      // Pick a non-random category
      const nonRandom = categories.find((c: any) => c.id !== "random");
      if (!nonRandom) return; // skip if only random exists

      const quote = pickQuote(nonRandom.id);
      expect(quote.category).toBe(nonRandom.id);
    });

    it("should fall back to all quotes for unknown category", () => {
      const quote = pickQuote("nonexistent-category-xyz");

      // Should still return a valid quote (falls back to allQuotes)
      expect(quote).toHaveProperty("text");
      expect(quote).toHaveProperty("author");
      expect(quote.text.length).toBeGreaterThan(0);
    });

    it("should return different quotes over multiple picks (not always same)", () => {
      // Pick 20 quotes; with any reasonable pool, we should get variation
      const texts = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const q = pickQuote("random");
        texts.add(q.text);
      }
      // With 200 quotes, picking 20 should give us at least 2 different ones
      expect(texts.size).toBeGreaterThan(1);
    });
  });

  describe("GET /api/quotes/stats", () => {
    it("should return stats with totalQuotes and ttlDays", () => {
      const stats = getQuoteStats();

      expect(stats).toHaveProperty("categories");
      expect(stats).toHaveProperty("totalQuotes");
      expect(stats).toHaveProperty("ttlDays");
      expect(typeof stats.totalQuotes).toBe("number");
      expect(stats.totalQuotes).toBeGreaterThan(0);
      expect(stats.ttlDays).toBe(7);
    });

    it("should have per-category stats with total, used, available", () => {
      const stats = getQuoteStats();

      for (const [catId, catStats] of Object.entries(stats.categories)) {
        expect(catStats).toHaveProperty("total");
        expect(catStats).toHaveProperty("used");
        expect(catStats).toHaveProperty("available");
        const s = catStats as {
          total: number;
          used: number;
          available: number;
        };
        expect(s.total).toBeGreaterThanOrEqual(0);
        expect(s.used).toBeGreaterThanOrEqual(0);
        expect(s.available).toBeLessThanOrEqual(s.total);
      }
    });
  });

  describe("quote route handlers via router", () => {
    let quoteRouter: any;

    beforeEach(async () => {
      quoteRouter = (await import("../routes/quotes.js")).default;
    });

    function findHandler(
      router: any,
      method: string,
      path: string,
    ): Function | null {
      for (const layer of router.stack) {
        if (
          layer.route &&
          layer.route.path === path &&
          layer.route.methods[method]
        ) {
          const handlers = layer.route.stack;
          return handlers[handlers.length - 1].handle;
        }
      }
      return null;
    }

    it("categories handler should return JSON array", () => {
      const handler = findHandler(quoteRouter, "get", "/api/quotes/categories");
      expect(handler).not.toBeNull();

      const req = mockReq();
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("pick handler should return a quote defaulting to random", () => {
      const handler = findHandler(quoteRouter, "get", "/api/quotes/pick");
      expect(handler).not.toBeNull();

      const req = mockReq(undefined, undefined, {});
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.body).toHaveProperty("text");
      expect(res.body).toHaveProperty("author");
      expect(res.body).toHaveProperty("category");
    });

    it("pick handler should accept category query param", () => {
      const handler = findHandler(quoteRouter, "get", "/api/quotes/pick");

      const categories = getQuoteCategories();
      const nonRandom = categories.find((c: any) => c.id !== "random");
      if (!nonRandom) return;

      const req = mockReq(undefined, undefined, { category: nonRandom.id });
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.body.category).toBe(nonRandom.id);
    });

    it("stats handler should return stats object", () => {
      const handler = findHandler(quoteRouter, "get", "/api/quotes/stats");
      expect(handler).not.toBeNull();

      const req = mockReq();
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.body).toHaveProperty("totalQuotes");
      expect(res.body).toHaveProperty("ttlDays");
      expect(res.body).toHaveProperty("categories");
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Generation config — themes, styles, providers
// ---------------------------------------------------------------------------

describe("generation config", () => {
  it("should return themes, styles, providers, and overlays", () => {
    const config = getGenerationConfig();

    expect(config).toHaveProperty("themes");
    expect(config).toHaveProperty("styles");
    expect(config).toHaveProperty("providers");
    expect(config).toHaveProperty("overlays");
  });

  it("should have themes with id and label", () => {
    const { themes } = getGenerationConfig();

    expect(Array.isArray(themes)).toBe(true);
    expect(themes.length).toBeGreaterThan(0);

    for (const theme of themes) {
      expect(theme).toHaveProperty("id");
      expect(theme).toHaveProperty("label");
      expect(typeof theme.id).toBe("string");
      expect(typeof theme.label).toBe("string");
    }
  });

  it("should include expected theme IDs", () => {
    const { themes } = getGenerationConfig();
    const ids = themes.map((t: any) => t.id);

    expect(ids).toContain("forest");
    expect(ids).toContain("ocean");
    expect(ids).toContain("astro");
    expect(ids).toContain("holiday");
  });

  it("should have styles with id and label", () => {
    const { styles } = getGenerationConfig();

    expect(Array.isArray(styles)).toBe(true);
    expect(styles.length).toBeGreaterThan(0);

    for (const style of styles) {
      expect(style).toHaveProperty("id");
      expect(style).toHaveProperty("label");
    }
  });

  it("should include photorealistic and fine-art styles", () => {
    const { styles } = getGenerationConfig();
    const ids = styles.map((s: any) => s.id);

    expect(ids).toContain("photorealistic");
    expect(ids).toContain("fine-art");
  });

  it("should have providers with id and label", () => {
    const { providers } = getGenerationConfig();

    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);

    for (const provider of providers) {
      expect(provider).toHaveProperty("id");
      expect(provider).toHaveProperty("label");
    }
  });

  it("should include gpt-image, openai, gemini, and mock providers", () => {
    const { providers } = getGenerationConfig();
    const ids = providers.map((p: any) => p.id);

    expect(ids).toContain("gpt-image");
    expect(ids).toContain("openai");
    expect(ids).toContain("gemini");
    expect(ids).toContain("mock");
  });

  it("should list gpt-image first (default/recommended)", () => {
    const { providers } = getGenerationConfig();
    expect(providers[0].id).toBe("gpt-image");
  });

  it("should default to gpt-image provider in user settings", () => {
    const settings = getUserSettings("nonexistent-user");
    expect(settings.imageProvider).toBe("gpt-image");
  });

  it("should list supported overlay types", () => {
    const { overlays } = getGenerationConfig();

    expect(Array.isArray(overlays)).toBe(true);
    expect(overlays).toContain("weather");
    expect(overlays).toContain("market");
    expect(overlays).toContain("quote");
  });

  describe("generation config route handler", () => {
    it("should respond with config via the route handler", async () => {
      const genRouter = (await import("../routes/generation.js")).default;

      // Find the GET /api/generation/config handler
      let handler: Function | null = null;
      for (const layer of genRouter.stack) {
        if (
          layer.route &&
          layer.route.path === "/api/generation/config" &&
          layer.route.methods.get
        ) {
          const handlers = layer.route.stack;
          handler = handlers[handlers.length - 1].handle;
          break;
        }
      }
      expect(handler).not.toBeNull();

      const req = mockReq();
      const res = mockRes();
      handler!(req, res, vi.fn());

      expect(res.body).toHaveProperty("themes");
      expect(res.body).toHaveProperty("styles");
      expect(res.body).toHaveProperty("providers");
      expect(res.body).toHaveProperty("overlays");
      expect(res.body.themes.length).toBeGreaterThan(0);
    });
  });
});
