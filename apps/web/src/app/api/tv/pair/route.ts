export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb, settings, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import type { AppSettings } from "@frame/core";
import { ensureSchema } from "@/lib/db-bootstrap";
import { getTvPublisher } from "@/lib/providers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ip } = body as { ip?: string };

    if (!ip) {
      return NextResponse.json(
        { error: "Missing required field: ip" },
        { status: 400 },
      );
    }

    const tvPublisher = getTvPublisher();
    const device = await tvPublisher.testConnectivity(ip);

    if (!device) {
      return NextResponse.json(
        { error: "Could not connect to TV" },
        { status: 400 },
      );
    }

    // Save the IP to settings
    ensureSchema();
    const db = getDb();
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"));

    const current: AppSettings =
      rows.length > 0 ? JSON.parse(rows[0]!.data) : DEFAULT_SETTINGS;
    const merged: AppSettings = {
      ...current,
      tv: { ...current.tv, ip },
    };
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

    return NextResponse.json(device);
  } catch (error) {
    console.error("TV pairing failed:", error);
    return NextResponse.json({ error: "TV pairing failed" }, { status: 500 });
  }
}
