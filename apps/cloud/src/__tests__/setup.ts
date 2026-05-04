/**
 * Test setup — initializes an in-memory SQLite database and a fixture
 * art library before each test file. Env vars must be set before any
 * module that captures them at import time (db.ts, routes/library.ts).
 */
import { beforeAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Force in-memory database for tests
process.env.DATABASE_URL = "file::memory:";

// Set up a fixture art library at a unique tmp path so library.ts
// (which captures ART_LIBRARY_PATH at import time) sees real files.
const FIXTURE_LIBRARY = path.join(
  tmpdir(),
  `frame-test-library-${process.pid}`,
);
process.env.ART_LIBRARY_PATH = FIXTURE_LIBRARY;

const FIXTURE_CATEGORIES: Record<string, string[]> = {
  Coastal: [
    "blue-horizon.jpg",
    "sunset-bay.jpg",
    "white-sand.jpg",
    "rocky-shore.jpg",
    "tide-pool.jpg",
  ],
  Abstract: [
    "blocks.jpg",
    "swirl.jpg",
    "lines.jpg",
    "splash.jpg",
    "geometry.jpg",
  ],
  Nature: ["forest.jpg", "meadow.jpg", "river.jpg", "mountain.jpg", "fog.jpg"],
  Portrait: ["face-1.jpg", "face-2.jpg", "face-3.jpg"],
};

if (existsSync(FIXTURE_LIBRARY)) rmSync(FIXTURE_LIBRARY, { recursive: true });
mkdirSync(FIXTURE_LIBRARY, { recursive: true });
for (const [cat, files] of Object.entries(FIXTURE_CATEGORIES)) {
  const dir = path.join(FIXTURE_LIBRARY, cat);
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(path.join(dir, f), "fixture");
}

// Import and run DB initialization to create all tables
import { initDatabase } from "../db.js";

beforeAll(() => {
  initDatabase();
});
