import type {
  MarketProvider,
  SemanticMarket,
  ProviderHealth,
} from "@frame/core";

export class MockMarketProvider implements MarketProvider {
  name = "mock";

  async fetch(symbol: string, timeframe: string): Promise<SemanticMarket> {
    await new Promise((r) => setTimeout(r, 150));

    const directions = ["up", "down", "flat"] as const;
    const strengths = ["strong", "moderate", "weak"] as const;
    const volatilities = ["low", "medium", "high"] as const;

    const direction =
      directions[Math.floor(Math.random() * directions.length)]!;
    const changePercent =
      direction === "up"
        ? Math.random() * 5
        : direction === "down"
          ? -Math.random() * 5
          : (Math.random() - 0.5) * 0.5;

    return {
      symbol,
      direction,
      strength: strengths[Math.floor(Math.random() * strengths.length)]!,
      volatility:
        volatilities[Math.floor(Math.random() * volatilities.length)]!,
      changePercent: Math.round(changePercent * 100) / 100,
      price:
        symbol === "BTC"
          ? 67000 + Math.random() * 5000
          : 450 + Math.random() * 20,
      timeframe,
      fetchedAt: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "healthy",
      lastChecked: new Date().toISOString(),
      latencyMs: 5,
      message: "Mock provider always healthy",
    };
  }
}
