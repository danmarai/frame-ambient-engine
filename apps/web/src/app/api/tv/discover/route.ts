export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import os from "node:os";
import { discoverFrameTVs } from "@frame/tv";
import { getDb, settings, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import type { AppSettings } from "@frame/core";
import { ensureSchema } from "@/lib/db-bootstrap";

interface DiscoveredTv {
  ip: string;
  name: string;
  model: string;
  isFrameTV: boolean;
}

/** Probe a single IP for a Samsung Frame TV via HTTP on port 8001. */
async function probeIp(ip: string): Promise<DiscoveredTv | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://${ip}:8001/api/v2/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const device = data?.device;
    if (!device) return null;
    const isFrame =
      device.FrameTVSupport === "true" || device.FrameTVSupport === true;
    if (!isFrame) return null;
    return {
      ip,
      name: device.name || "Samsung TV",
      model: device.modelName || "Unknown",
      isFrameTV: true,
    };
  } catch {
    return null;
  }
}

/** Scan the local subnet for Samsung Frame TVs. */
async function scanSubnet(): Promise<DiscoveredTv[]> {
  // Get local IP to determine subnet
  const interfaces = os.networkInterfaces();
  let localIp = "";
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        localIp = addr.address;
        break;
      }
    }
    if (localIp) break;
  }
  if (!localIp) return [];

  // Scan common TV IP ranges on the subnet (last octet 1-254)
  const prefix = localIp.split(".").slice(0, 3).join(".");
  console.log(`[discover] Scanning subnet ${prefix}.0/24 from ${localIp}`);

  const promises: Promise<DiscoveredTv | null>[] = [];
  for (let i = 1; i <= 254; i++) {
    promises.push(probeIp(`${prefix}.${i}`));
  }

  const results = await Promise.all(promises);
  return results.filter((r): r is DiscoveredTv => r !== null);
}

export async function POST() {
  try {
    // Run SSDP, subnet scan, and known-IP probe in parallel
    const ssdpPromise = discoverFrameTVs(6000).catch(() => []);

    const subnetPromise = scanSubnet().catch(() => []);

    const knownIpPromise = (async () => {
      ensureSchema();
      const db = getDb();
      const rows = await db
        .select()
        .from(settings)
        .where(eq(settings.id, "default"));
      const appSettings: AppSettings =
        rows.length > 0 ? JSON.parse(rows[0]!.data) : DEFAULT_SETTINGS;
      const knownIp = appSettings.tv?.ip || process.env.SAMSUNG_TV_IP;
      if (!knownIp) return [];
      const result = await probeIp(knownIp);
      return result ? [result] : [];
    })().catch(() => []);

    const [ssdpResults, subnetResults, knownResults] = await Promise.all([
      ssdpPromise,
      subnetPromise,
      knownIpPromise,
    ]);

    // Merge and dedup by IP
    const seen = new Set<string>();
    const devices: DiscoveredTv[] = [];

    // Known IPs first (highest priority)
    for (const d of knownResults) {
      if (!seen.has(d.ip)) {
        seen.add(d.ip);
        devices.push(d);
      }
    }
    // Then subnet scan results
    for (const d of subnetResults) {
      if (!seen.has(d.ip)) {
        seen.add(d.ip);
        devices.push(d);
      }
    }
    // Then SSDP results (add ip from rinfo if available)
    for (const d of ssdpResults) {
      const ip = (d as unknown as DiscoveredTv).ip;
      if (ip && !seen.has(ip)) {
        seen.add(ip);
        devices.push({ ip, name: d.name, model: d.model, isFrameTV: true });
      }
    }

    console.log(
      `[discover] Found ${devices.length} Frame TV(s):`,
      devices.map((d) => d.ip),
    );
    return NextResponse.json(devices);
  } catch (error) {
    console.error("TV discovery failed:", error);
    return NextResponse.json({ error: "TV discovery failed" }, { status: 500 });
  }
}
