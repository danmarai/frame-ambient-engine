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
