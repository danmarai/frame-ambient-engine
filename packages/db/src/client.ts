import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: InstanceType<typeof Database> | null = null;

function init() {
  if (_db) return;

  const dbPath =
    process.env.DATABASE_URL?.replace("file:", "") || "../../data/frame.db";

  // Ensure the directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  _sqlite = new Database(dbPath);

  // Performance and reliability pragmas
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  _sqlite.pragma("busy_timeout = 5000");

  _db = drizzle(_sqlite, { schema });
}

export function getDb() {
  init();
  return _db!;
}

/** Access the raw better-sqlite3 instance for DDL operations. */
export function getRawDb(): InstanceType<typeof Database> {
  init();
  return _sqlite!;
}

export type FrameDb = ReturnType<typeof getDb>;
