export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb, settings, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import type { AppSettings } from "@frame/core";
import { ensureSchema } from "@/lib/db-bootstrap";
import { getTvPublisher } from "@/lib/providers";
import { pairWithTv, saveToken } from "@/lib/tv-pairing";

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

    // Step 1: HTTP probe to verify TV is reachable
    const tvPublisher = getTvPublisher(ip);
    const device = await tvPublisher.testConnectivity(ip);

    if (!device) {
      return NextResponse.json(
        {
          error:
            "Could not reach TV at " +
            ip +
            ". Make sure it is powered on and on the same network.",
        },
        { status: 400 },
      );
    }

    // Step 2: WebSocket pairing — this triggers the Allow/Deny popup on the TV
    // Give the user 60 seconds to press Allow on their remote
    const pairResult = await pairWithTv(ip, 60000);

    if (!pairResult.success) {
      return NextResponse.json(
        {
          error: pairResult.error ?? "Pairing failed",
          device, // Still return device info since HTTP probe worked
          paired: false,
        },
        { status: 400 },
      );
    }

    // Step 3: Save token for samsung-frame-connect library
    if (pairResult.token) {
      await saveToken(pairResult.token);
    }

    // Step 4: Save IP and token to settings DB
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
      tv: { ...current.tv, ip, token: pairResult.token },
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

    return NextResponse.json({
      device,
      paired: true,
      token: pairResult.token ? "saved" : undefined,
    });
  } catch (error) {
    console.error("TV pairing failed:", error);
    return NextResponse.json({ error: "TV pairing failed" }, { status: 500 });
  }
}
