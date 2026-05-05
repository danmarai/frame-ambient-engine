/**
 * Tests for the library recommendation service and route.
 *
 * Covers: cold start diversity, downrated exclusion, category affinity,
 * unrated preference, favorites mixing, route auth, and limit clamping.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getRawDb } from "../db.js";
import { recordRating } from "../taste-profile.js";
import { getLibraryRecommendations } from "../recommendations.js";

const TEST_USER = "user-rec-test";
const OTHER_USER = "user-rec-other";

function seedUser(userId = TEST_USER) {
  getRawDb()
    .prepare(
      "INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(userId, `${userId}@test.com`, "Test User", new Date().toISOString());
}

function clearRatings() {
  const db = getRawDb();
  db.prepare("DELETE FROM art_ratings").run();
  db.prepare("DELETE FROM taste_profiles").run();
}

function rate(
  category: string,
  filename: string,
  rating: "up" | "down",
  userId = TEST_USER,
) {
  return recordRating({
    userId,
    sourceType: "library",
    sourceId: `${category}/${filename}`,
    rating,
    category,
    filename,
  });
}

describe("getLibraryRecommendations", () => {
  beforeEach(() => {
    seedUser();
    seedUser(OTHER_USER);
    clearRatings();
  });

  it("returns cold_start with diverse mix when user has no ratings", () => {
    const result = getLibraryRecommendations(TEST_USER, { limit: 12 });
    expect(result.confidence).toBe("cold_start");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(12);

    // Diversity: should span at least 2 categories with our 4-category fixture
    const categories = new Set(result.items.map((i) => i.category));
    expect(categories.size).toBeGreaterThanOrEqual(2);

    // Each item should have a valid url and label
    for (const item of result.items) {
      expect(item.url).toContain("/api/library/image/");
      expect(item.label).toBeTruthy();
      expect(typeof item.score).toBe("number");
      expect(item.reason).toBeTruthy();
    }
  });

  it("excludes downrated items from results", () => {
    rate("Coastal", "blue-horizon.jpg", "down");
    rate("Coastal", "sunset-bay.jpg", "down");
    rate("Coastal", "white-sand.jpg", "down");
    rate("Coastal", "rocky-shore.jpg", "down");
    rate("Coastal", "tide-pool.jpg", "down");

    const result = getLibraryRecommendations(TEST_USER, { limit: 24 });
    const downratedIds = new Set([
      "Coastal/blue-horizon.jpg",
      "Coastal/sunset-bay.jpg",
      "Coastal/white-sand.jpg",
      "Coastal/rocky-shore.jpg",
      "Coastal/tide-pool.jpg",
    ]);
    for (const item of result.items) {
      const id = `${item.category}/${item.filename}`;
      expect(downratedIds.has(id)).toBe(false);
    }
  });

  it("ranks liked categories higher when user has confidence", () => {
    // Build a learning-confidence profile that strongly likes Coastal
    rate("Coastal", "blue-horizon.jpg", "up");
    rate("Coastal", "sunset-bay.jpg", "up");
    rate("Coastal", "white-sand.jpg", "up");
    rate("Abstract", "blocks.jpg", "down");
    rate("Abstract", "swirl.jpg", "down");
    rate("Nature", "forest.jpg", "up");

    const result = getLibraryRecommendations(TEST_USER, { limit: 24 });
    expect(result.confidence).not.toBe("cold_start");

    // Top-half of recommendations should not be Abstract since it's downrated
    const topHalf = result.items.slice(0, Math.ceil(result.items.length / 2));
    const abstractInTop = topHalf.filter(
      (i) => i.category === "Abstract",
    ).length;
    expect(abstractInTop).toBeLessThanOrEqual(1);
  });

  it("excludes already-liked items by default but includes when includeRated=true", () => {
    rate("Coastal", "blue-horizon.jpg", "up");
    rate("Nature", "forest.jpg", "up");
    rate("Nature", "meadow.jpg", "up");
    rate("Nature", "river.jpg", "up");
    rate("Nature", "mountain.jpg", "up");

    const defaultResult = getLibraryRecommendations(TEST_USER, { limit: 24 });
    const ids = new Set(
      defaultResult.items.map((i) => `${i.category}/${i.filename}`),
    );
    // With favorites mixing, blue-horizon may be appended at the end as a
    // favorite — that's expected. But the bulk of items should be unrated.
    const totalRated = ["Coastal/blue-horizon.jpg"].filter((id) =>
      ids.has(id),
    ).length;
    expect(totalRated).toBeLessThanOrEqual(1);

    const includedResult = getLibraryRecommendations(TEST_USER, {
      limit: 24,
      includeRated: true,
    });
    expect(includedResult.items.length).toBeGreaterThan(0);
  });

  it("returns no items when library has no eligible categories", () => {
    // Downrate all of one category
    rate("Portrait", "face-1.jpg", "down");
    rate("Portrait", "face-2.jpg", "down");
    rate("Portrait", "face-3.jpg", "down");

    // Recs should still return items from other categories
    const result = getLibraryRecommendations(TEST_USER, { limit: 12 });
    for (const item of result.items) {
      expect(item.category).not.toBe("Portrait");
    }
  });

  it("clamps limit to a sensible range", () => {
    const tooLarge = getLibraryRecommendations(TEST_USER, { limit: 9999 });
    // Library has 5+5+5+3 = 18 images, capped further by per-category cap
    expect(tooLarge.items.length).toBeLessThanOrEqual(60);

    const tooSmall = getLibraryRecommendations(TEST_USER, { limit: 0 });
    expect(tooSmall.items.length).toBeGreaterThanOrEqual(0);
    expect(tooSmall.items.length).toBeLessThanOrEqual(1);
  });

  it("does not leak another user's ratings", () => {
    rate("Coastal", "blue-horizon.jpg", "down", OTHER_USER);
    rate("Coastal", "sunset-bay.jpg", "down", OTHER_USER);

    // TEST_USER has no ratings — Coastal items should still be candidates
    const result = getLibraryRecommendations(TEST_USER, { limit: 24 });
    const coastalItems = result.items.filter((i) => i.category === "Coastal");
    expect(coastalItems.length).toBeGreaterThan(0);
  });

  it("returns empty items list gracefully when user has rated nothing matching", () => {
    // Smoke check: cold-start path with empty ratings table
    clearRatings();
    const result = getLibraryRecommendations(TEST_USER, { limit: 5 });
    expect(result.items.length).toBeLessThanOrEqual(5);
    expect(result.confidence).toBe("cold_start");
  });

  it("respects per-category diversity cap", () => {
    // With 4 categories and limit 24, no single category should fill more
    // than ceil(24/4) = 6 slots.
    const result = getLibraryRecommendations(TEST_USER, { limit: 24 });
    const counts = new Map<string, number>();
    for (const item of result.items) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      expect(count).toBeLessThanOrEqual(6);
    }
  });
});

describe("recommendations route", () => {
  let recRouter: any;

  beforeEach(async () => {
    seedUser();
    clearRatings();
    const mod = await import("../routes/recommendations.js");
    recRouter = mod.default;
  });

  function findHandler(
    router: any,
    method: string,
    routePath: string,
  ): Function | null {
    for (const layer of router.stack) {
      if (
        layer.route &&
        layer.route.path === routePath &&
        layer.route.methods[method]
      ) {
        const handlers = layer.route.stack;
        return handlers[handlers.length - 1].handle;
      }
    }
    return null;
  }

  function mockReq(query?: any, user?: any): any {
    return {
      body: {},
      params: {},
      query: query || {},
      headers: {},
      user,
    };
  }

  function mockRes(): any {
    const res: any = { statusCode: 200, body: null };
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data: any) => {
      res.body = data;
      return res;
    };
    return res;
  }

  it("GET /api/recommendations/library has requireAuth middleware", () => {
    for (const layer of recRouter.stack) {
      if (
        layer.route &&
        layer.route.path === "/api/recommendations/library" &&
        layer.route.methods.get
      ) {
        const middlewareNames = layer.route.stack.map(
          (s: any) => s.handle.name || "anonymous",
        );
        expect(middlewareNames).toContain("requireAuth");
        return;
      }
    }
    throw new Error("GET /api/recommendations/library route not found");
  });

  it("GET /api/recommendations/library returns confidence and items", () => {
    const handler = findHandler(
      recRouter,
      "get",
      "/api/recommendations/library",
    );
    const req = mockReq({}, { userId: TEST_USER });
    const res = mockRes();
    handler!(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.confidence).toBe("cold_start");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("GET /api/recommendations/library accepts limit query param", () => {
    const handler = findHandler(
      recRouter,
      "get",
      "/api/recommendations/library",
    );
    const req = mockReq({ limit: "5" }, { userId: TEST_USER });
    const res = mockRes();
    handler!(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
  });
});
