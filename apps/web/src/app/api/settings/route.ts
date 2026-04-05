import { NextResponse } from "next/server";
import { getDb, settings, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import { validateSettings, mergeSettings } from "@frame/config";
import type { AppSettings } from "@frame/core";

function ensureSchema() {
  const db = getDb();
  // Create tables if they don't exist (simple bootstrap for v1)
  const sqliteDb = (
    db as unknown as {
      _: { session: { client: { exec: (sql: string) => void } } };
    }
  )._.session.client;
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  sqliteDb.exec(`
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
  sqliteDb.exec(`
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
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS health_snapshots (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      captured_at TEXT NOT NULL
    )
  `);
}

export async function GET() {
  try {
    ensureSchema();
    const db = getDb();
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"));

    if (rows.length === 0) {
      return NextResponse.json(DEFAULT_SETTINGS);
    }

    return NextResponse.json(JSON.parse(rows[0]!.data));
  } catch (error) {
    console.error("Failed to load settings:", error);
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function PUT(request: Request) {
  try {
    ensureSchema();
    const body = await request.json();

    const validation = validateSettings(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid settings", details: validation.errors },
        { status: 400 },
      );
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"));
    const current: AppSettings =
      rows.length > 0 ? JSON.parse(rows[0]!.data) : DEFAULT_SETTINGS;
    const merged = mergeSettings(current, body);
    const now = new Date().toISOString();

    if (rows.length === 0) {
      await db.insert(settings).values({
        id: "default",
        data: JSON.stringify(merged),
        updatedAt: now,
      });
    } else {
      await db
        .update(settings)
        .set({
          data: JSON.stringify(merged),
          updatedAt: now,
        })
        .where(eq(settings.id, "default"));
    }

    return NextResponse.json(merged);
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
