import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Settings table — stores the operator's configuration as JSON.
 * Single-row table (id = 'default').
 */
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default("default"),
  data: text("data").notNull(), // JSON-serialized AppSettings
  updatedAt: text("updated_at").notNull(),
});

/**
 * Job runs — tracks generation, preview, and publish jobs
 * for health reporting and debugging.
 */
export const jobRuns = sqliteTable("job_runs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // 'generation' | 'publish' | 'preview'
  status: text("status").notNull(), // 'pending' | 'running' | 'success' | 'failed' | 'retry'
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  metadata: text("metadata"), // JSON
});

/**
 * Publish history — records each publish attempt to the TV.
 */
export const publishHistory = sqliteTable("publish_history", {
  id: text("id").primaryKey(),
  sceneId: text("scene_id"),
  status: text("status").notNull(), // 'success' | 'failed'
  publishedAt: text("published_at").notNull(),
  durationMs: integer("duration_ms"),
  error: text("error"),
  contentId: text("content_id"), // Samsung TV content ID
});

/**
 * Scenes — each row is one generation cycle.
 */
export const scenes = sqliteTable("scenes", {
  id: text("id").primaryKey(),
  status: text("status").notNull(), // 'pending' | 'generating' | 'complete' | 'failed'
  contextJson: text("context_json"), // JSON SceneContext
  prompt: text("prompt"),
  imageProvider: text("image_provider"),
  imagePath: text("image_path"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  favorite: integer("favorite").default(0),
  publishStatus: text("publish_status"), // null | 'pending' | 'published' | 'failed'
});

/**
 * Ratings — thumbs up/down feedback on scenes.
 */
export const ratings = sqliteTable("ratings", {
  id: text("id").primaryKey(),
  sceneId: text("scene_id")
    .notNull()
    .references(() => scenes.id),
  rating: text("rating").notNull(), // 'up' | 'down'
  features: text("features"), // JSON string of extracted features
  ratedAt: text("rated_at").notNull(), // ISO timestamp
});

// ============================================
// Multi-user / Multi-TV tables (cloud service)
// ============================================

/**
 * Users — authenticated via Google OAuth.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // Google sub ID or UUID
  email: text("email").notNull(),
  name: text("name"),
  picture: text("picture"), // Google profile pic URL
  createdAt: text("created_at").notNull(),
  lastLoginAt: text("last_login_at"),
});

/**
 * TV Devices — registered Samsung Frame TVs.
 * One user can have multiple TVs, each TV belongs to one user.
 */
export const tvDevices = sqliteTable("tv_devices", {
  id: text("id").primaryKey(), // tvId from pairing
  userId: text("user_id").references(() => users.id),
  name: text("name"), // User-friendly name ("Living Room Frame")
  // Device info (fetched from TV REST API)
  modelName: text("model_name"), // "QN65LS03TAFXZA"
  modelCode: text("model_code"), // "20_NIKEM_FRAME"
  tvIp: text("tv_ip"), // Last known IP
  firmwareVersion: text("firmware_version"),
  resolution: text("resolution"), // "3840x2160"
  flashSizeGB: integer("flash_size_gb"),
  tizenVersion: text("tizen_version"),
  apiVersion: text("api_version"), // Art mode API version
  isFrameTV: integer("is_frame_tv").default(1),
  // State
  pairedAt: text("paired_at"),
  lastSeenAt: text("last_seen_at"),
  lastSyncAt: text("last_sync_at"),
  artCacheSize: integer("art_cache_size").default(20), // max images to cache
  currentContentId: text("current_content_id"),
  autoRotation: integer("auto_rotation").default(0),
  // Capabilities (discovered during testing)
  canFgSendImage: integer("can_fg_send_image"), // null=untested, 0=no, 1=yes
  canSetRotation: integer("can_set_rotation"), // null=untested, 0=no, 1=yes
  canBgService: integer("can_bg_service"), // null=untested, 0=no, 1=yes
});

/**
 * TV Art — tracks images uploaded to each TV.
 */
export const tvArt = sqliteTable("tv_art", {
  id: text("id").primaryKey(), // UUID
  tvId: text("tv_id")
    .notNull()
    .references(() => tvDevices.id),
  contentId: text("content_id").notNull(), // Samsung MY_F* ID
  sceneId: text("scene_id").references(() => scenes.id), // Link to generation
  uploadedAt: text("uploaded_at").notNull(),
  deletedAt: text("deleted_at"), // null = still on TV
  rating: text("rating"), // 'up' | 'down' | null
  ratedAt: text("rated_at"),
});

/**
 * User preferences — per-user art style preferences.
 */
export const userPreferences = sqliteTable("user_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tvId: text("tv_id").references(() => tvDevices.id), // null = applies to all TVs
  key: text("key").notNull(), // 'style', 'theme', 'weather_location', 'stock_symbols', etc.
  value: text("value").notNull(), // JSON value
  updatedAt: text("updated_at").notNull(),
});

/**
 * Health snapshots — periodic captures of dependency health.
 */
export const healthSnapshots = sqliteTable("health_snapshots", {
  id: text("id").primaryKey(),
  status: text("status").notNull(), // 'healthy' | 'degraded' | 'failed' | 'stale'
  data: text("data").notNull(), // JSON-serialized SystemHealth
  capturedAt: text("captured_at").notNull(),
});

// ============================================
// Cloud service session & telemetry tables
// ============================================

/**
 * Auth sessions — tracks authenticated user sessions with TTL.
 * Replaces the in-memory session Map for persistence across restarts.
 */
export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(), // sess-{uuid}
  userId: text("user_id").notNull(), // Google sub ID
  email: text("email").notNull(),
  name: text("name"),
  picture: text("picture"),
  googleToken: text("google_token"), // Original ID token (not sent to clients)
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(), // TTL-based expiry
  lastAccessedAt: text("last_accessed_at"),
});

/**
 * Telemetry entries — device debug logs from Tizen/mobile apps.
 * Capped to prevent unbounded growth (cleanup handled by application).
 */
export const telemetryEntries = sqliteTable("telemetry_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: text("device_id").notNull(),
  sessionId: text("session_id").notNull(),
  tvIp: text("tv_ip"),
  screen: text("screen"),
  timestamp: text("timestamp"),
  logs: text("logs"), // JSON array of log strings
  receivedAt: text("received_at").notNull(),
});

/**
 * Feedback — user ratings on generated art.
 * Persists thumbs up/down data for taste learning.
 */
export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tvId: text("tv_id").notNull(),
  contentId: text("content_id").notNull(),
  rating: text("rating").notNull(), // 'up' | 'down'
  userId: text("user_id"),
  timestamp: text("timestamp").notNull(),
});

/**
 * Scene archive — generated art metadata for gallery display.
 * Image files are stored on disk; this table tracks metadata.
 */
export const sceneArchive = sqliteTable("scene_archive", {
  id: text("id").primaryKey(), // sceneId (UUID)
  prompt: text("prompt"),
  contextJson: text("context_json"), // JSON
  durationMs: integer("duration_ms"),
  provider: text("provider"),
  imageUrl: text("image_url"),
  createdAt: text("created_at").notNull(),
});
