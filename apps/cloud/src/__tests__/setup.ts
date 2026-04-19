/**
 * Test setup — initializes an in-memory SQLite database before each test file.
 *
 * This ensures tests don't need a disk-based database and don't
 * interfere with each other across test files.
 */
import { beforeAll } from "vitest";

// Force in-memory database for tests
process.env.DATABASE_URL = "file::memory:";

// Import and run DB initialization to create all tables
import { initDatabase } from "../db.js";

beforeAll(() => {
  initDatabase();
});
