/**
 * Database initialization for the cloud server.
 *
 * Uses SQLite via @frame/db for persistence. All tables are created
 * on first run using CREATE TABLE IF NOT EXISTS — no migration step needed.
 *
 * The database file defaults to ../../data/cloud.db (relative to cwd),
 * configurable via DATABASE_URL env var.
 */
import { getDb, getRawDb } from "@frame/db";
import { logger } from "./logger.js";

// Re-export for convenience
export { getDb, getRawDb };

/**
 * Initialize the database and create all tables.
 * Safe to call multiple times — uses IF NOT EXISTS.
 */
export function initDatabase(): void {
  const raw = getRawDb();

  // Core tables from @frame/db schema
  raw.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tv_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      name TEXT,
      model_name TEXT,
      model_code TEXT,
      tv_ip TEXT,
      firmware_version TEXT,
      resolution TEXT,
      flash_size_gb INTEGER,
      tizen_version TEXT,
      api_version TEXT,
      is_frame_tv INTEGER DEFAULT 1,
      paired_at TEXT,
      last_seen_at TEXT,
      last_sync_at TEXT,
      art_cache_size INTEGER DEFAULT 20,
      current_content_id TEXT,
      auto_rotation INTEGER DEFAULT 0,
      can_fg_send_image INTEGER,
      can_set_rotation INTEGER,
      can_bg_service INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

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
      error TEXT,
      favorite INTEGER DEFAULT 0,
      publish_status TEXT
    );

    -- Cloud-specific tables

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_accessed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS telemetry_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      tv_ip TEXT,
      screen TEXT,
      timestamp TEXT,
      logs TEXT,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tv_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      user_id TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scene_archive (
      id TEXT PRIMARY KEY,
      prompt TEXT,
      context_json TEXT,
      duration_ms INTEGER,
      provider TEXT,
      image_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      tv_id TEXT REFERENCES tv_devices(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pairing_codes (
      code TEXT PRIMARY KEY,
      tv_id TEXT NOT NULL,
      tv_ip TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      phone_session_id TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      claimed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS art_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      tv_id TEXT REFERENCES tv_devices(id),
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      category TEXT,
      filename TEXT,
      prompt TEXT,
      provider TEXT,
      context_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, source_type, source_id)
    );

    CREATE TABLE IF NOT EXISTS taste_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      profile_json TEXT NOT NULL,
      ratings_count INTEGER NOT NULL DEFAULT 0,
      positive_count INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  // Create indexes for common queries
  raw.exec(`
    DROP INDEX IF EXISTS idx_pairing_codes_active_tv;

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
      ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
      ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_device_session
      ON telemetry_entries(device_id, session_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_received
      ON telemetry_entries(received_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_tv
      ON feedback(tv_id);
    CREATE INDEX IF NOT EXISTS idx_scene_archive_created
      ON scene_archive(created_at);
    CREATE INDEX IF NOT EXISTS idx_tv_devices_user
      ON tv_devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_prefs_user
      ON user_preferences(user_id, key);
    CREATE INDEX IF NOT EXISTS idx_pairing_codes_tv
      ON pairing_codes(tv_id);
    CREATE INDEX IF NOT EXISTS idx_pairing_codes_phone
      ON pairing_codes(phone_session_id);
    CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires
      ON pairing_codes(expires_at);
    CREATE INDEX IF NOT EXISTS idx_pairing_codes_user
      ON pairing_codes(user_id);

    CREATE INDEX IF NOT EXISTS idx_art_ratings_user_rating
      ON art_ratings(user_id, rating);
    CREATE INDEX IF NOT EXISTS idx_art_ratings_user_source
      ON art_ratings(user_id, source_type);
    CREATE INDEX IF NOT EXISTS idx_art_ratings_user_category
      ON art_ratings(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_art_ratings_tv_created
      ON art_ratings(tv_id, created_at);
  `);

  const sceneArchiveColumns = raw
    .prepare("PRAGMA table_info(scene_archive)")
    .all() as Array<{ name: string }>;
  if (!sceneArchiveColumns.some((column) => column.name === "user_id")) {
    raw.exec(
      "ALTER TABLE scene_archive ADD COLUMN user_id TEXT REFERENCES users(id)",
    );
  }
  raw.exec(`
    CREATE INDEX IF NOT EXISTS idx_scene_archive_user
      ON scene_archive(user_id);
  `);

  const authSessionColumns = raw
    .prepare("PRAGMA table_info(auth_sessions)")
    .all() as Array<{ name: string }>;
  if (authSessionColumns.some((column) => column.name === "google_token")) {
    raw.exec("UPDATE auth_sessions SET google_token = NULL");
  }

  logger.info("Database initialized");
}
