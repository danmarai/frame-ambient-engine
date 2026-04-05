export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb, settings, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import { validateSettings, mergeSettings } from "@frame/config";
import type { AppSettings } from "@frame/core";
import { ensureSchema } from "@/lib/db-bootstrap";

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
