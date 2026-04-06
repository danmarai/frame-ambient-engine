/**
 * Scheduler module — auto-generates and publishes images on a cron interval.
 *
 * Uses node-cron to schedule periodic generation + publish cycles.
 * Includes overlap prevention and dev-mode singleton guard.
 */

import * as cron from "node-cron";
import type { ScheduledTask } from "node-cron";

/** Singleton guard for dev mode hot reload */
declare global {
  // eslint-disable-next-line no-var
  var __frameScheduler:
    | {
        task: ScheduledTask | null;
        isRunning: boolean;
      }
    | undefined;
}

function getState() {
  if (!globalThis.__frameScheduler) {
    globalThis.__frameScheduler = {
      task: null,
      isRunning: false,
    };
  }
  return globalThis.__frameScheduler;
}

/**
 * Execute one generation + publish cycle.
 * Calls the generate API, then publishes the resulting scene to the TV.
 */
async function runCycle(): Promise<void> {
  const state = getState();

  // Overlap prevention: skip if previous job is still running
  if (state.isRunning) {
    console.log("[scheduler] Previous cycle still running, skipping");
    return;
  }

  state.isRunning = true;
  const startTime = Date.now();

  try {
    console.log("[scheduler] Starting generation cycle");

    // Import dependencies dynamically to avoid circular imports
    const { getDb, settings, scenes, eq } = await import("@frame/db");
    const { DEFAULT_SETTINGS } = await import("@frame/core");
    const { ensureSchema } = await import("@/lib/db-bootstrap");
    const { generateScene } = await import("@frame/rendering");
    const {
      getWeatherProvider,
      getMarketProvider,
      getQuoteProvider,
      getImageProvider,
    } = await import("@/lib/providers");
    const { MockTvPublisher } = await import("@frame/tv");
    const { randomUUID } = await import("crypto");
    const { writeFile, mkdir } = await import("fs/promises");
    const path = await import("path");

    ensureSchema();
    const db = getDb();

    // Load current settings
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"));
    const appSettings =
      rows.length > 0 ? JSON.parse(rows[0]!.data) : DEFAULT_SETTINGS;

    // Apply default lat/lon from env if not in settings
    if (appSettings.location.lat == null && process.env.DEFAULT_LATITUDE) {
      appSettings.location.lat = parseFloat(process.env.DEFAULT_LATITUDE);
      appSettings.location.lon = parseFloat(
        process.env.DEFAULT_LONGITUDE ?? "0",
      );
    }

    // Create scene record
    const sceneId = randomUUID();
    const now = new Date().toISOString();

    await db.insert(scenes).values({
      id: sceneId,
      status: "generating",
      createdAt: now,
    });

    // Build provider set
    const deps = {
      weather: getWeatherProvider(),
      market: getMarketProvider(),
      quote: getQuoteProvider(),
      image: getImageProvider(appSettings.imageProvider),
    };

    // Run the generation
    const { scene, imageData } = await generateScene(deps, appSettings);

    // Save image to filesystem
    const dataDir = path.resolve(process.cwd(), "../../data/images");
    await mkdir(dataDir, { recursive: true });
    const imagePath = path.join(dataDir, `${sceneId}.png`);
    await writeFile(imagePath, imageData);

    // Update scene record
    await db
      .update(scenes)
      .set({
        status: "complete",
        contextJson: JSON.stringify(scene.context),
        prompt: scene.prompt,
        imageProvider: appSettings.imageProvider,
        imagePath: `${sceneId}.png`,
        completedAt: scene.completedAt,
        durationMs: scene.durationMs,
      })
      .where(eq(scenes.id, sceneId));

    console.log(
      `[scheduler] Generation complete: ${sceneId} (${Date.now() - startTime}ms)`,
    );

    // Publish to TV if configured
    if (appSettings.tv?.ip) {
      try {
        const publisher = new MockTvPublisher();
        const result = await publisher.upload(
          appSettings.tv.ip,
          imageData,
          appSettings.tv.token,
        );

        if (result.success && result.contentId) {
          await publisher.setActive(
            appSettings.tv.ip,
            result.contentId,
            appSettings.tv.token,
          );
          console.log(`[scheduler] Published to TV: ${result.contentId}`);
        } else {
          console.warn(
            `[scheduler] TV publish failed: ${result.error ?? "unknown"}`,
          );
        }
      } catch (tvError) {
        console.error("[scheduler] TV publish error:", tvError);
      }
    }
  } catch (error) {
    console.error("[scheduler] Cycle failed:", error);
  } finally {
    state.isRunning = false;
  }
}

/**
 * Build a cron expression for the given interval in minutes.
 * e.g. 15 produces a "every 15 minutes" expression
 */
function buildCronExpression(intervalMinutes: number): string {
  return `*/${intervalMinutes} * * * *`;
}

/**
 * Start the scheduler with the given interval in minutes.
 * If already running, stops the current job first.
 */
export function startScheduler(intervalMinutes: number): void {
  const state = getState();

  // Stop existing job if any
  if (state.task) {
    state.task.stop();
    state.task = null;
  }

  const expression = buildCronExpression(intervalMinutes);
  console.log(
    `[scheduler] Starting with interval: ${intervalMinutes}m (${expression})`,
  );

  state.task = cron.schedule(expression, () => {
    void runCycle();
  });
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): void {
  const state = getState();

  if (state.task) {
    state.task.stop();
    state.task = null;
    console.log("[scheduler] Stopped");
  }
}

/**
 * Update the scheduler interval. Stops the current job and starts a new one.
 */
export function updateInterval(intervalMinutes: number): void {
  console.log(`[scheduler] Updating interval to ${intervalMinutes}m`);
  stopScheduler();
  startScheduler(intervalMinutes);
}

/**
 * Check whether the scheduler is currently running.
 */
export function isSchedulerRunning(): boolean {
  const state = getState();
  return state.task !== null;
}
