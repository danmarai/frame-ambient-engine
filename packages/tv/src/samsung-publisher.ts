/// <reference path="./samsung-frame-connect.d.ts" />
import type {
  TvPublisher,
  TvDeviceInfo,
  TvPublishResult,
  ProviderHealth,
} from "@frame/core";
import { SamsungFrameClient } from "samsung-frame-connect";

/**
 * Wrap an async operation with a timeout.
 * Returns the result or throws on timeout.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

/**
 * Create a client, connect, run an operation, and close.
 * Handles connection timeout and always cleans up.
 */
async function withClient<T>(
  ip: string,
  fn: (client: SamsungFrameClient) => Promise<T>,
  connectTimeoutMs = 15000,
): Promise<T> {
  const client = new SamsungFrameClient({
    host: ip,
    name: "FrameEngine",
    verbosity: 0,
  });

  await withTimeout(client.connect(), connectTimeoutMs, "TV connect");

  try {
    return await fn(client);
  } finally {
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Real Samsung Frame TV publisher.
 * Wraps the samsung-frame-connect npm package for WebSocket communication
 * and uses HTTP probe on port 8001 for connectivity testing.
 */
export class SamsungFramePublisher implements TvPublisher {
  name = "samsung-frame";

  async testConnectivity(ip: string): Promise<TvDeviceInfo | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${ip}:8001/api/v2/`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await response.json();
      const device = data?.device;
      if (!device) return null;

      return {
        name: device.name || device.DeviceName || "Samsung TV",
        model: device.modelName || device.ModelName || "Unknown",
        isFrameTV: !!(
          device.FrameTVSupport === "true" || device.FrameTVSupport === true
        ),
        isArtMode: false, // HTTP probe cannot determine art mode status
        firmwareVersion: device.firmwareVersion || device.FirmwareVersion,
      };
    } catch {
      return null;
    }
  }

  async upload(
    ip: string,
    imageData: Buffer,
    _token?: string,
  ): Promise<TvPublishResult> {
    const start = Date.now();
    try {
      const contentId = await withClient(
        ip,
        async (client) => {
          return await client.upload(imageData, { fileType: "JPEG" });
        },
        20000,
      );

      return {
        success: true,
        contentId,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown upload error";
      return {
        success: false,
        error: message,
        durationMs: Date.now() - start,
      };
    }
  }

  async setActive(
    ip: string,
    contentId: string,
    _token?: string,
  ): Promise<boolean> {
    try {
      await withClient(ip, async (client) => {
        await client.setCurrentArt({ id: contentId });
      });
      return true;
    } catch {
      return false;
    }
  }

  async getArtModeStatus(ip: string, _token?: string): Promise<boolean> {
    try {
      return await withClient(ip, async (client) => {
        return await withTimeout(client.inArtMode(), 5000, "Art mode check");
      });
    } catch {
      // Art mode commands time out when TV is in regular TV mode — this is normal
      return false;
    }
  }

  async setArtMode(
    _ip: string,
    _enabled: boolean,
    _token?: string,
  ): Promise<boolean> {
    return false;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "unknown",
      lastChecked: new Date().toISOString(),
      message:
        "Samsung Frame publisher requires a TV IP for health checks; use testConnectivity() instead",
    };
  }
}
