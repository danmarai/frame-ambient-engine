import type {
  TvPublisher,
  TvDeviceInfo,
  TvPublishResult,
  ProviderHealth,
} from "@frame/core";

/**
 * Mock TV publisher for development.
 * Simulates the Samsung Frame TV WebSocket API with realistic delays.
 * Real implementation will use samsung-frame-connect npm package.
 */
export class MockTvPublisher implements TvPublisher {
  name = "mock";

  async testConnectivity(ip: string): Promise<TvDeviceInfo | null> {
    await new Promise((r) => setTimeout(r, 300));

    if (!ip) return null;

    // Simulate the GET http://<IP>:8001/api/v2/ response
    return {
      name: "Samsung Frame TV (Mock)",
      model: "GW43T",
      isFrameTV: true,
      isArtMode: true,
      firmwareVersion: "T-KTMDEUC-1420.0",
    };
  }

  async upload(
    ip: string,
    _imageData: Buffer,
    _token?: string,
  ): Promise<TvPublishResult> {
    await new Promise((r) => setTimeout(r, 2000));

    if (!ip) {
      return { success: false, error: "No TV IP configured", durationMs: 0 };
    }

    const contentId = `MY-F${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

    return {
      success: true,
      contentId,
      durationMs: 2000,
    };
  }

  async setActive(
    ip: string,
    contentId: string,
    _token?: string,
  ): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 500));
    return !!ip && !!contentId;
  }

  async getArtModeStatus(_ip: string, _token?: string): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 200));
    return true;
  }

  async setArtMode(
    _ip: string,
    _enabled: boolean,
    _token?: string,
  ): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 300));
    return true;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "healthy",
      lastChecked: new Date().toISOString(),
      latencyMs: 5,
      message: "Mock TV publisher always healthy",
    };
  }
}
