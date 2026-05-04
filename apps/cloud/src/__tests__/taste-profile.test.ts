/**
 * Tests for taste profile service and ratings routes.
 *
 * Covers: rating persistence, upsert, profile computation, confidence
 * transitions, prompt hint construction, and route-level auth/validation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getRawDb } from "../db.js";
import {
  recordRating,
  getTasteProfile,
  recomputeProfile,
  buildTastePromptHints,
  getUserRating,
  type RatingInput,
} from "../taste-profile.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER = "user-taste-test";
const TEST_TV = "tv-taste-test";

function seedUser(userId = TEST_USER) {
  const db = getRawDb();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)",
  ).run(userId, `${userId}@test.com`, "Test User", new Date().toISOString());
}

function seedTv(tvId = TEST_TV, userId = TEST_USER) {
  const db = getRawDb();
  db.prepare(
    "INSERT OR IGNORE INTO tv_devices (id, user_id, tv_ip, paired_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    tvId,
    userId,
    "10.0.0.1",
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

function seedScene(sceneId: string, userId = TEST_USER) {
  const db = getRawDb();
  db.prepare(
    "INSERT OR IGNORE INTO scene_archive (id, user_id, prompt, provider, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(sceneId, userId, "test prompt", "mock", new Date().toISOString());
}

function clearRatings() {
  const db = getRawDb();
  db.prepare("DELETE FROM art_ratings").run();
  db.prepare("DELETE FROM taste_profiles").run();
}

function rateLibrary(
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

// ---------------------------------------------------------------------------
// Service tests
// ---------------------------------------------------------------------------

describe("taste-profile service", () => {
  beforeEach(() => {
    seedUser();
    seedTv();
    clearRatings();
  });

  describe("recordRating", () => {
    it("records a library rating", () => {
      const result = rateLibrary("Coastal", "sunset.jpg", "up");
      expect(result.rating).toBe("up");
      expect(result.sourceType).toBe("library");
      expect(result.sourceId).toBe("Coastal/sunset.jpg");
      expect(result.id).toBeGreaterThan(0);
    });

    it("records a generated scene rating", () => {
      seedScene("scene-1");
      const result = recordRating({
        userId: TEST_USER,
        sourceType: "generated",
        sourceId: "scene-1",
        rating: "down",
      });
      expect(result.rating).toBe("down");
      expect(result.sourceType).toBe("generated");
    });

    it("upserts — changes rating instead of duplicating", () => {
      rateLibrary("Coastal", "sunset.jpg", "up");
      const result = rateLibrary("Coastal", "sunset.jpg", "down");
      expect(result.rating).toBe("down");

      // Verify only one row exists
      const rows = getRawDb()
        .prepare("SELECT * FROM art_ratings WHERE user_id = ?")
        .all(TEST_USER);
      expect(rows).toHaveLength(1);
    });

    it("returns updated profile with rating result", () => {
      const result = rateLibrary("Coastal", "sunset.jpg", "up");
      expect(result.profile).toBeDefined();
      expect(result.profile.ratingsCount).toBe(1);
      expect(result.profile.positiveCount).toBe(1);
    });
  });

  describe("getUserRating", () => {
    it("returns null for unrated item", () => {
      expect(
        getUserRating(TEST_USER, "library", "Coastal/sunset.jpg"),
      ).toBeNull();
    });

    it("returns the current rating", () => {
      rateLibrary("Coastal", "sunset.jpg", "up");
      expect(getUserRating(TEST_USER, "library", "Coastal/sunset.jpg")).toBe(
        "up",
      );
    });
  });

  describe("confidence transitions", () => {
    it("cold_start with fewer than 5 ratings", () => {
      rateLibrary("A", "1.jpg", "up");
      rateLibrary("B", "2.jpg", "up");
      const profile = getTasteProfile(TEST_USER);
      expect(profile.confidence).toBe("cold_start");
      expect(profile.message).toContain("Rate");
    });

    it("learning at 5 ratings", () => {
      for (let i = 0; i < 5; i++) {
        rateLibrary(`Cat${i}`, `img${i}.jpg`, "up");
      }
      const profile = getTasteProfile(TEST_USER);
      expect(profile.confidence).toBe("learning");
      expect(profile.message).toBe("Learning your taste");
    });

    it("useful at 20 ratings", () => {
      for (let i = 0; i < 20; i++) {
        rateLibrary(`Cat${i % 4}`, `img${i}.jpg`, i % 3 === 0 ? "down" : "up");
      }
      const profile = getTasteProfile(TEST_USER);
      expect(profile.confidence).toBe("useful");
      expect(profile.message).toBe("Personalized recommendations active");
    });
  });

  describe("category scoring", () => {
    it("ranks liked categories higher", () => {
      rateLibrary("Coastal", "a.jpg", "up");
      rateLibrary("Coastal", "b.jpg", "up");
      rateLibrary("Coastal", "c.jpg", "up");
      rateLibrary("Abstract", "d.jpg", "down");
      rateLibrary("Abstract", "e.jpg", "down");

      const profile = getTasteProfile(TEST_USER);
      expect(profile.topCategories.length).toBeGreaterThan(0);
      expect(profile.topCategories[0].id).toBe("Coastal");
    });

    it("puts disliked categories in avoidHints", () => {
      rateLibrary("Coastal", "a.jpg", "up");
      rateLibrary("Coastal", "b.jpg", "up");
      rateLibrary("Abstract", "c.jpg", "down");
      rateLibrary("Abstract", "d.jpg", "down");
      rateLibrary("Abstract", "e.jpg", "down");

      const profile = getTasteProfile(TEST_USER);
      expect(profile.avoidHints).toContain("abstract");
    });
  });

  describe("profile for unrated user", () => {
    it("returns cold_start with empty arrays", () => {
      const profile = getTasteProfile("nonexistent-user");
      expect(profile.confidence).toBe("cold_start");
      expect(profile.ratingsCount).toBe(0);
      expect(profile.topCategories).toEqual([]);
      expect(profile.styleHints).toEqual([]);
    });
  });
});

describe("buildTastePromptHints", () => {
  beforeEach(() => {
    seedUser();
    clearRatings();
  });

  it("returns null for cold_start", () => {
    const profile = getTasteProfile(TEST_USER);
    const hints = buildTastePromptHints(profile);
    expect(hints).toBeNull();
  });

  it("returns hints when learning", () => {
    for (let i = 0; i < 5; i++) {
      rateLibrary(`Coastal`, `img${i}.jpg`, "up");
    }
    const profile = getTasteProfile(TEST_USER);
    const hints = buildTastePromptHints(profile);
    expect(hints).not.toBeNull();
    expect(hints!.positive).toContain("coastal");
  });

  it("includes avoid hints when available", () => {
    for (let i = 0; i < 3; i++) {
      rateLibrary("Coastal", `good${i}.jpg`, "up");
    }
    for (let i = 0; i < 3; i++) {
      rateLibrary("Abstract", `bad${i}.jpg`, "down");
    }
    // Need 5 total for learning
    rateLibrary("Nature", "x.jpg", "up");

    const profile = getTasteProfile(TEST_USER);
    expect(profile.confidence).not.toBe("cold_start");
    const hints = buildTastePromptHints(profile);
    expect(hints).not.toBeNull();
    expect(hints!.negative).toContain("abstract");
  });
});

// ---------------------------------------------------------------------------
// Route-level tests (using mock req/res)
// ---------------------------------------------------------------------------

describe("ratings routes", () => {
  // Import the router to test handlers directly
  let ratingsRouter: any;

  beforeEach(async () => {
    seedUser();
    seedTv();
    clearRatings();
    const mod = await import("../routes/ratings.js");
    ratingsRouter = mod.default;
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

  function mockReq(body?: any, params?: any, query?: any, user?: any): any {
    return {
      body: body || {},
      params: params || {},
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

  it("POST /api/ratings rejects invalid rating value", () => {
    const handler = findHandler(ratingsRouter, "post", "/api/ratings");
    const req = mockReq(
      {
        sourceType: "library",
        sourceId: "A/b.jpg",
        rating: "meh",
        category: "A",
        filename: "b.jpg",
      },
      {},
      {},
      { userId: TEST_USER },
    );
    const res = mockRes();
    handler!(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("up");
  });

  it("POST /api/ratings rejects invalid source type", () => {
    const handler = findHandler(ratingsRouter, "post", "/api/ratings");
    const req = mockReq(
      { sourceType: "unknown", sourceId: "x", rating: "up" },
      {},
      {},
      { userId: TEST_USER },
    );
    const res = mockRes();
    handler!(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/ratings rejects generated scene not owned by user", () => {
    seedUser("other-user");
    seedScene("scene-other", "other-user");
    const handler = findHandler(ratingsRouter, "post", "/api/ratings");
    const req = mockReq(
      { sourceType: "generated", sourceId: "scene-other", rating: "up" },
      {},
      {},
      { userId: TEST_USER },
    );
    const res = mockRes();
    handler!(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("POST /api/ratings rejects TV not owned by user", () => {
    seedUser("other-user");
    seedTv("other-tv", "other-user");
    const handler = findHandler(ratingsRouter, "post", "/api/ratings");
    const req = mockReq(
      {
        tvId: "other-tv",
        sourceType: "library",
        sourceId: "A/b.jpg",
        rating: "up",
        category: "A",
        filename: "b.jpg",
      },
      {},
      {},
      { userId: TEST_USER },
    );
    const res = mockRes();
    handler!(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("POST /api/ratings rejects library image not on disk", () => {
    const handler = findHandler(ratingsRouter, "post", "/api/ratings");
    const req = mockReq(
      {
        sourceType: "library",
        sourceId: "Nonexistent/fake.jpg",
        rating: "up",
        category: "Nonexistent",
        filename: "fake.jpg",
      },
      {},
      {},
      { userId: TEST_USER },
    );
    const res = mockRes();
    handler!(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/ratings accepts valid generated scene rating", () => {
    seedScene("scene-valid");
    const handler = findHandler(ratingsRouter, "post", "/api/ratings");
    const req = mockReq(
      {
        sourceType: "generated",
        sourceId: "scene-valid",
        rating: "up",
      },
      {},
      {},
      { userId: TEST_USER },
    );
    const res = mockRes();
    handler!(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.rating).toBe("up");
    expect(res.body.profile).toBeDefined();
  });

  it("GET /api/taste/profile returns cold_start for new user", () => {
    const handler = findHandler(ratingsRouter, "get", "/api/taste/profile");
    const req = mockReq({}, {}, {}, { userId: TEST_USER });
    const res = mockRes();
    handler!(req, res);
    expect(res.body.confidence).toBe("cold_start");
    expect(res.body.ratingsCount).toBe(0);
  });
});

describe("feedback routes auth migration", () => {
  let feedbackRouter: any;

  beforeEach(async () => {
    seedUser();
    seedTv();
    const mod = await import("../routes/feedback.js");
    feedbackRouter = mod.default;
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
        // First handler is requireAuth middleware, last is the route handler
        return handlers[handlers.length - 1].handle;
      }
    }
    return null;
  }

  it("POST /api/feedback has requireAuth middleware", () => {
    for (const layer of feedbackRouter.stack) {
      if (
        layer.route &&
        layer.route.path === "/api/feedback" &&
        layer.route.methods.post
      ) {
        const middlewareNames = layer.route.stack.map(
          (s: any) => s.handle.name || "anonymous",
        );
        expect(middlewareNames).toContain("requireAuth");
        return;
      }
    }
    throw new Error("POST /api/feedback route not found");
  });

  it("GET /api/feedback/:tvId has requireAuth middleware", () => {
    for (const layer of feedbackRouter.stack) {
      if (
        layer.route &&
        layer.route.path === "/api/feedback/:tvId" &&
        layer.route.methods.get
      ) {
        const middlewareNames = layer.route.stack.map(
          (s: any) => s.handle.name || "anonymous",
        );
        expect(middlewareNames).toContain("requireAuth");
        return;
      }
    }
    throw new Error("GET /api/feedback/:tvId route not found");
  });
});
