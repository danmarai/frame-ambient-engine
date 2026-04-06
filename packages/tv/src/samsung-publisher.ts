/// <reference path="./samsung-frame-connect.d.ts" />
import type {
  TvPublisher,
  TvDeviceInfo,
  TvPublishResult,
  ProviderHealth,
} from "@frame/core";
import { SamsungFrameClient } from "samsung-frame-connect";

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
      const client = new SamsungFrameClient({ host: ip });
      await client.connect();

      try {
        const contentId = await client.upload(imageData, { fileType: "JPEG" });
        return {
          success: true,
          contentId,
          durationMs: Date.now() - start,
        };
      } finally {
        await client.close();
      }
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
      const client = new SamsungFrameClient({ host: ip });
      await client.connect();

      try {
        await client.setCurrentArt({ id: contentId });
        return true;
      } finally {
        await client.close();
      }
    } catch {
      return false;
    }
  }

  async getArtModeStatus(ip: string, _token?: string): Promise<boolean> {
    try {
      const client = new SamsungFrameClient({ host: ip });
      await client.connect();

      try {
        return await client.inArtMode();
      } finally {
        await client.close();
      }
    } catch {
      return false;
    }
  }

  async setArtMode(
    _ip: string,
    _enabled: boolean,
    _token?: string,
  ): Promise<boolean> {
    console.warn(
      "SamsungFramePublisher: setArtMode is not supported by samsung-frame-connect",
    );
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
