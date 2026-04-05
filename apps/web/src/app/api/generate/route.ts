export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getDb, settings, scenes, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import type { AppSettings, ImageProviderName, Scene } from "@frame/core";
import { ensureSchema } from "@/lib/db-bootstrap";
import {
  getWeatherProvider,
  getMarketProvider,
  getQuoteProvider,
  getImageProvider,
} from "@/lib/providers";
import { generateScene } from "@frame/rendering";

export async function POST(request: Request) {
  try {
    ensureSchema();
    const db = getDb();

    // Parse optional overrides from request body
    let overrideTheme: string | undefined;
    let overrideProvider: ImageProviderName | undefined;
    try {
      const body = await request.json();
      overrideTheme = body.theme;
      overrideProvider = body.provider;
    } catch {
      // Empty body is fine
    }

    // Load current settings
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"));
    const appSettings: AppSettings =
      rows.length > 0 ? JSON.parse(rows[0]!.data) : DEFAULT_SETTINGS;

    // Create scene record
    const sceneId = randomUUID();
    const now = new Date().toISOString();

    await db.insert(scenes).values({
      id: sceneId,
      status: "generating",
      createdAt: now,
    });

    // Resolve the actual provider to use
    const resolvedProvider = overrideProvider ?? appSettings.imageProvider;

    // Apply default lat/lon from env if not in settings
    if (appSettings.location.lat == null && process.env.DEFAULT_LATITUDE) {
      appSettings.location.lat = parseFloat(process.env.DEFAULT_LATITUDE);
      appSettings.location.lon = parseFloat(
        process.env.DEFAULT_LONGITUDE ?? "0",
      );
    }

    // Build provider set
    const deps = {
      weather: getWeatherProvider(),
      market: getMarketProvider(),
      quote: getQuoteProvider(),
      image: getImageProvider(resolvedProvider),
    };

    // Run the generation
    const { scene, imageData } = await generateScene(deps, appSettings, {
      theme: overrideTheme as AppSettings["theme"] | undefined,
    });

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
        imageProvider: resolvedProvider,
        imagePath: `${sceneId}.png`,
        completedAt: scene.completedAt,
        durationMs: scene.durationMs,
      })
      .where(eq(scenes.id, sceneId));

    const result: Scene = {
      id: sceneId,
      status: "complete",
      context: scene.context,
      prompt: scene.prompt,
      imageProvider: resolvedProvider,
      imagePath: `${sceneId}.png`,
      createdAt: scene.createdAt,
      completedAt: scene.completedAt,
      durationMs: scene.durationMs,
      error: null,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Generation failed:", error);

    return NextResponse.json(
      {
        error: "Generation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
