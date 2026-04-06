import { Client as SsdpClient } from "node-ssdp";
import type { TvDeviceInfo } from "@frame/core";

/**
 * Discover Samsung Frame TVs on the local network.
 * Uses SSDP to find Samsung devices, then probes each via HTTP
 * to check for Frame TV Art Mode support.
 *
 * @param timeoutMs - Scan timeout in ms (default 10000)
 * @returns Array of discovered Frame TVs
 */
export async function discoverFrameTVs(
  timeoutMs = 10000,
): Promise<TvDeviceInfo[]> {
  const discoveredIPs = new Set<string>();
  let client: SsdpClient | undefined;

  try {
    client = new SsdpClient();

    // Collect response IPs from SSDP discovery
    client.on(
      "response",
      (_headers: unknown, _statusCode: unknown, rinfo: { address: string }) => {
        discoveredIPs.add(rinfo.address);
      },
    );

    // Search for Samsung remote control receiver devices
    client.search("urn:samsung.com:device:RemoteControlReceiver:1");

    // Wait for the scan duration
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  } catch {
    // SSDP failure — return empty array
    return [];
  } finally {
    if (client) {
      client.stop();
    }
  }

  // Probe each discovered IP via HTTP
  const results: TvDeviceInfo[] = [];

  const probePromises = Array.from(discoveredIPs).map(async (ip) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`http://${ip}:8001/api/v2/`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await response.json();
      const device = data?.device;

      if (!device) return null;

      // Check for Frame TV support
      const isFrame =
        device.FrameTVSupport === "true" ||
        (typeof device.modelName === "string" &&
          device.modelName.includes("LS03"));

      if (!isFrame) return null;

      const tvInfo: TvDeviceInfo = {
        name: device.name || device.modelName || "Samsung Frame TV",
        model: device.modelName || "Unknown",
        isFrameTV: true,
        isArtMode:
          device.isArtMode !== undefined ? Boolean(device.isArtMode) : true,
        ...(device.firmwareVersion
          ? { firmwareVersion: device.firmwareVersion }
          : {}),
      };

      return tvInfo;
    } catch {
      // HTTP probe failed — skip this IP
      return null;
    }
  });

  const probeResults = await Promise.all(probePromises);

  for (const result of probeResults) {
    if (result) {
      results.push(result);
    }
  }

  return results;
}
