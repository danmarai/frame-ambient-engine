import { getRawDb } from "@frame/db";

let bootstrapped = false;

/** Ensure all tables exist. Call once per request cycle. */
export function ensureSchema() {
  if (bootstrapped) return;

  const sqlite = getRawDb();

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS job_runs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      error TEXT,
      metadata TEXT
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS publish_history (
      id TEXT PRIMARY KEY,
      scene_id TEXT,
      status TEXT NOT NULL,
      published_at TEXT NOT NULL,
      duration_ms INTEGER,
      error TEXT,
      content_id TEXT
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS health_snapshots (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      captured_at TEXT NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      context_json TEXT,
      prompt TEXT,
      image_provider TEXT,
      image_path TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      error TEXT
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id),
      rating TEXT NOT NULL,
      features TEXT,
      rated_at TEXT NOT NULL
    )
  `);

  // Add columns that may not exist on older databases
  try {
    sqlite.exec(`ALTER TABLE scenes ADD COLUMN favorite INTEGER DEFAULT 0`);
  } catch {
    /* already exists */
  }
  try {
    sqlite.exec(`ALTER TABLE scenes ADD COLUMN publish_status TEXT`);
  } catch {
    /* already exists */
  }

  bootstrapped = true;
}
