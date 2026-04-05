/**
 * Health and observability types.
 *
 * The system classifies itself as healthy, degraded, failed, or stale.
 * Health is modeled explicitly — not improvised from logs.
 */

import type { ProviderHealth, ProviderStatus } from "./providers";

export type SystemStatus = "healthy" | "degraded" | "failed" | "stale";

export interface SubsystemHealth {
  name: string;
  status: ProviderStatus;
  lastChecked: string;
  latencyMs?: number;
  message?: string;
}

export interface SystemHealth {
  status: SystemStatus;
  subsystems: SubsystemHealth[];
  lastSuccessfulGeneration?: string;
  lastSuccessfulPublish?: string;
  providerHealth: ProviderHealth[];
  checkedAt: string;
}

export interface JobRun {
  id: string;
  type: "generation" | "publish" | "preview";
  status: "pending" | "running" | "success" | "failed" | "retry";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}
