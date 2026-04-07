"use client";

import { useState, useEffect } from "react";

interface ProviderStatus {
  name: string;
  status: "healthy" | "degraded" | "error" | "unknown";
  latencyMs?: number;
  message?: string;
  lastChecked: string;
}

interface TvStatus {
  connected: boolean;
  device?: { name: string; model: string };
  reason?: string;
}

export default function HealthPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [tvStatus, setTvStatus] = useState<TvStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  async function loadHealth() {
    setLoading(true);
    try {
      // Check TV status
      const tvRes = await fetch("/api/tv/status");
      if (tvRes.ok) setTvStatus(await tvRes.json());

      // Build provider status from available endpoints
      const checks: ProviderStatus[] = [];

      // Weather provider
      try {
        const start = Date.now();
        const res = await fetch("/api/scenes?limit=1");
        checks.push({
          name: "Scene API",
          status: res.ok ? "healthy" : "degraded",
          latencyMs: Date.now() - start,
          lastChecked: new Date().toISOString(),
        });
      } catch {
        checks.push({
          name: "Scene API",
          status: "error",
          message: "Unreachable",
          lastChecked: new Date().toISOString(),
        });
      }

      // Settings API
      try {
        const start = Date.now();
        const res = await fetch("/api/settings");
        const data = await res.json();
        checks.push({
          name: "Settings / Database",
          status: res.ok ? "healthy" : "error",
          latencyMs: Date.now() - start,
          message: data.imageProvider
            ? `Provider: ${data.imageProvider}`
            : undefined,
          lastChecked: new Date().toISOString(),
        });
      } catch {
        checks.push({
          name: "Settings / Database",
          status: "error",
          message: "Database unreachable",
          lastChecked: new Date().toISOString(),
        });
      }

      // TV
      checks.push({
        name: "Samsung Frame TV",
        status: tvStatus?.connected
          ? "healthy"
          : tvStatus
            ? "degraded"
            : "unknown",
        message: tvStatus?.connected
          ? `${tvStatus.device?.name ?? "Connected"}`
          : (tvStatus?.reason ?? "Not checked"),
        lastChecked: new Date().toISOString(),
      });

      setProviders(checks);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusColors: Record<string, string> = {
    healthy: "bg-green-500",
    degraded: "bg-yellow-500",
    error: "bg-red-500",
    unknown: "bg-gray-400",
  };

  const statusLabels: Record<string, string> = {
    healthy: "Healthy",
    degraded: "Degraded",
    error: "Error",
    unknown: "Unknown",
  };

  const overallStatus = providers.some((p) => p.status === "error")
    ? "error"
    : providers.some((p) => p.status === "degraded")
      ? "degraded"
      : providers.length > 0
        ? "healthy"
        : "unknown";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">System Health</h1>
        <button
          onClick={loadHealth}
          disabled={loading}
          className="rounded border border-frame-border px-3 py-1.5 text-sm text-frame-muted hover:text-frame-text disabled:opacity-50"
        >
          {loading ? "Checking..." : "Refresh"}
        </button>
      </div>

      {/* Overall status */}
      <div
        className={`rounded-lg border p-4 ${
          overallStatus === "healthy"
            ? "border-green-500/30 bg-green-500/5"
            : overallStatus === "error"
              ? "border-red-500/30 bg-red-500/5"
              : "border-yellow-500/30 bg-yellow-500/5"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-3 w-3 rounded-full ${statusColors[overallStatus]}`}
          />
          <span className="font-medium text-frame-text">
            System {statusLabels[overallStatus]}
          </span>
        </div>
        {lastRefresh && (
          <p className="mt-1 text-xs text-frame-muted">
            Last checked: {lastRefresh}
          </p>
        )}
      </div>

      {/* Provider cards */}
      <div className="space-y-3">
        {providers.map((provider) => (
          <div
            key={provider.name}
            className="flex items-center justify-between rounded-lg border border-frame-border bg-frame-surface p-4"
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${statusColors[provider.status]}`}
              />
              <div>
                <p className="text-sm font-medium text-frame-text">
                  {provider.name}
                </p>
                {provider.message && (
                  <p className="text-xs text-frame-muted">{provider.message}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-frame-muted">
                {statusLabels[provider.status]}
              </p>
              {provider.latencyMs !== undefined && (
                <p className="text-xs text-frame-muted">
                  {provider.latencyMs}ms
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* System info */}
      <div className="rounded-lg border border-frame-border bg-frame-surface p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-frame-muted">
          System Info
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-frame-muted">Version</span>
            <span className="text-frame-text">v0.3.0 — Milestone 2</span>
          </div>
          <div className="flex justify-between">
            <span className="text-frame-muted">Runtime</span>
            <span className="text-frame-text">Next.js 15 + Turbopack</span>
          </div>
          <div className="flex justify-between">
            <span className="text-frame-muted">TV Publisher</span>
            <span className="text-frame-text">DLNA AVTransport</span>
          </div>
        </div>
      </div>
    </div>
  );
}
