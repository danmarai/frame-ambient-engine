export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { discoverFrameTVs } from "@frame/tv";
import { getDb, settings, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import type { AppSettings, TvDeviceInfo } from "@frame/core";
import { ensureSchema } from "@/lib/db-bootstrap";
import { getTvPublisher } from "@/lib/providers";

export async function POST() {
  try {
    // Run SSDP discovery in parallel with a direct probe of the configured IP
    const ssdpPromise = discoverFrameTVs(8000).catch(
      () => [] as TvDeviceInfo[],
    );

    // Also try direct HTTP probe on configured/known IPs
    const directProbePromise = (async () => {
      ensureSchema();
      const db = getDb();
      const rows = await db
        .select()
        .from(settings)
        .where(eq(settings.id, "default"));
      const appSettings: AppSettings =
        rows.length > 0 ? JSON.parse(rows[0]!.data) : DEFAULT_SETTINGS;

      const knownIp = appSettings.tv?.ip || process.env.SAMSUNG_TV_IP;
      if (!knownIp) return [] as TvDeviceInfo[];

      const tvPublisher = getTvPublisher(knownIp);
      const device = await tvPublisher.testConnectivity(knownIp);
      if (!device) return [] as TvDeviceInfo[];

      return [{ ...device, ip: knownIp } as TvDeviceInfo & { ip: string }];
    })().catch(() => [] as TvDeviceInfo[]);

    const [ssdpDevices, directDevices] = await Promise.all([
      ssdpPromise,
      directProbePromise,
    ]);

    // Merge results, dedup by IP if both found the same device
    const seenIps = new Set<string>();
    const allDevices: (TvDeviceInfo & { ip?: string })[] = [];

    for (const d of directDevices) {
      const ip = (d as TvDeviceInfo & { ip?: string }).ip;
      if (ip) seenIps.add(ip);
      allDevices.push(d);
    }
    for (const d of ssdpDevices) {
      const ip = (d as TvDeviceInfo & { ip?: string }).ip;
      if (ip && seenIps.has(ip)) continue;
      allDevices.push(d);
    }

    return NextResponse.json(allDevices);
  } catch (error) {
    console.error("TV discovery failed:", error);
    return NextResponse.json({ error: "TV discovery failed" }, { status: 500 });
  }
}
