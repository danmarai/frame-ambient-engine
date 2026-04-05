import type {
  SystemHealth,
  SystemStatus,
  SubsystemHealth,
  ProviderHealth,
} from "@frame/core";

/**
 * Computes overall system health from subsystem health.
 * Health is modeled explicitly — not improvised from logs.
 */
export function computeSystemHealth(
  subsystems: SubsystemHealth[],
  providerHealth: ProviderHealth[],
  lastSuccessfulGeneration?: string,
  lastSuccessfulPublish?: string,
  staleThresholdMinutes = 30,
): SystemHealth {
  const now = new Date();
  let status: SystemStatus = "healthy";

  // Check for failures
  const hasFailedSubsystem = subsystems.some((s) => s.status === "failed");
  const hasDegradedSubsystem = subsystems.some((s) => s.status === "degraded");

  if (hasFailedSubsystem) {
    status = "failed";
  } else if (hasDegradedSubsystem) {
    status = "degraded";
  }

  // Check for staleness
  if (lastSuccessfulGeneration) {
    const genAge = now.getTime() - new Date(lastSuccessfulGeneration).getTime();
    if (genAge > staleThresholdMinutes * 60 * 1000) {
      status = status === "failed" ? "failed" : "stale";
    }
  }

  return {
    status,
    subsystems,
    providerHealth,
    lastSuccessfulGeneration,
    lastSuccessfulPublish,
    checkedAt: now.toISOString(),
  };
}
