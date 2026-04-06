/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * Initializes the auto-generation scheduler if enabled in settings.
 * Only runs in Node.js runtime (not edge/build).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Delay initialization to avoid blocking server startup
  // and to ensure all modules are available
  setTimeout(async () => {
    try {
      const { getDb, settings, eq } = await import("@frame/db");
      const { DEFAULT_SETTINGS } = await import("@frame/core");
      const { ensureSchema } = await import("./lib/db-bootstrap");
      const { startScheduler } = await import("./lib/scheduler");

      ensureSchema();
      const db = getDb();

      const rows = await db
        .select()
        .from(settings)
        .where(eq(settings.id, "default"));

      const appSettings =
        rows.length > 0 ? JSON.parse(rows[0]!.data) : DEFAULT_SETTINGS;

      if (appSettings.scheduler?.enabled) {
        const interval = appSettings.scheduler.intervalMinutes ?? 15;
        console.log(
          `[instrumentation] Starting scheduler with ${interval}m interval`,
        );
        startScheduler(interval);
      } else {
        console.log("[instrumentation] Scheduler disabled in settings");
      }
    } catch (error) {
      console.error("[instrumentation] Failed to initialize scheduler:", error);
    }
  }, 2000);
}
