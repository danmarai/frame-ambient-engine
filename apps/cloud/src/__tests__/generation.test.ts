/**
 * Generation taste-integration tests.
 *
 * Verifies that the cloud `generate()` wrapper:
 *   - Loads the user's taste profile when authenticated.
 *   - Reports `tasteProfileUsed=false` and `tasteConfidence='cold_start'`
 *     for users with insufficient ratings.
 *   - Reports `tasteProfileUsed=true` once a learning profile exists.
 *   - Reports `tasteProfileUsed=false` for anonymous (no userId) calls.
 *
 * Uses the in-package MockImageProvider to avoid real provider calls.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getRawDb } from "../db.js";
import { generate } from "../generation.js";
import { recordRating } from "../taste-profile.js";

const TEST_USER = "user-gen-test";

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

describe("generate() taste integration", () => {
  beforeEach(() => {
    seedUser();
    clearRatings();
  });

  it("returns tasteProfileUsed=false for anonymous calls", async () => {
    const result = await generate({ provider: "mock" });
    expect(result.tasteProfileUsed).toBe(false);
    expect(result.tasteConfidence).toBeUndefined();
  }, 15000);

  it("returns tasteProfileUsed=false for cold_start users", async () => {
    const result = await generate({ userId: TEST_USER, provider: "mock" });
    expect(result.tasteProfileUsed).toBe(false);
    expect(result.tasteConfidence).toBe("cold_start");
  }, 15000);

  it("returns tasteProfileUsed=true once user has a learning profile", async () => {
    // 5 library ratings → learning confidence
    for (let i = 0; i < 5; i++) {
      recordRating({
        userId: TEST_USER,
        sourceType: "library",
        sourceId: `Coastal/img${i}.jpg`,
        rating: "up",
        category: "Coastal",
        filename: `img${i}.jpg`,
      });
    }

    const result = await generate({ userId: TEST_USER, provider: "mock" });
    expect(result.tasteProfileUsed).toBe(true);
    expect(result.tasteConfidence).toBe("learning");
  }, 15000);
});
