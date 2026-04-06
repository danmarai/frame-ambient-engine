export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb, settings, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import type { AppSettings, TvDeviceInfo } from "@frame/core";
import { ensureSchema } from "@/lib/db-bootstrap";
import { getTvPublisher } from "@/lib/providers";

export async function GET() {
  try {
    ensureSchema();
    const db = getDb();
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"));

    const current: AppSettings =
      rows.length > 0 ? JSON.parse(rows[0]!.data) : DEFAULT_SETTINGS;

    const ip = current.tv.ip;
    if (!ip) {
      return NextResponse.json({
        connected: false,
        reason: "No TV configured",
        device: null,
        artMode: false,
      });
    }

    const tvPublisher = getTvPublisher();
    const device: TvDeviceInfo | null = await tvPublisher.testConnectivity(ip);

    if (!device) {
      return NextResponse.json({
        connected: false,
        reason: "TV not reachable",
        device: null,
        artMode: false,
      });
    }

    let artMode = false;
    try {
      artMode = await tvPublisher.getArtModeStatus(ip);
    } catch {
      // Art mode status check is optional; default to false
    }

    return NextResponse.json({
      connected: true,
      device,
      artMode,
    });
  } catch (error) {
    console.error("TV status check failed:", error);
    return NextResponse.json(
      { error: "TV status check failed" },
      { status: 500 },
    );
  }
}
