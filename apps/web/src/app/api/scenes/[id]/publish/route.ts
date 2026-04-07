export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { getDb, scenes, publishHistory, settings, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import type { AppSettings } from "@frame/core";
import { prepareForTV, applyOverlays } from "@frame/rendering";
import { ensureSchema } from "@/lib/db-bootstrap";
import { getTvPublisher } from "@/lib/providers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const publishId = randomUUID();
  const logPrefix = `[publish:${publishId.slice(0, 8)}]`;

  try {
    ensureSchema();
    const { id } = await params;
    const db = getDb();
    console.log(`${logPrefix} Starting publish for scene ${id}`);

    // 1. Load scene from DB
    const rows = await db.select().from(scenes).where(eq(scenes.id, id));
    if (rows.length === 0) {
      console.log(`${logPrefix} Scene not found`);
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const scene = rows[0]!;

    // 2. Verify scene is complete and has an image
    if (scene.status !== "complete" || !scene.imagePath) {
      console.log(
        `${logPrefix} Scene not complete: status=${scene.status}, imagePath=${scene.imagePath}`,
      );
      return NextResponse.json(
        { error: "Scene is not complete" },
        { status: 400 },
      );
    }

    // 3. Load settings to get TV IP
    const settingsRows = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"));
    const appSettings: AppSettings =
      settingsRows.length > 0
        ? JSON.parse(settingsRows[0]!.data)
        : DEFAULT_SETTINGS;

    const tvIp = appSettings.tv?.ip;
    if (!tvIp) {
      console.log(`${logPrefix} No TV IP configured`);
      return NextResponse.json(
        { error: "TV not configured. Go to Settings and pair your TV first." },
        { status: 400 },
      );
    }

    // 4. Read image from filesystem
    console.log(`${logPrefix} Reading image: ${scene.imagePath}`);
    const dataDir = path.resolve(process.cwd(), "../../data/images");
    const imagePath = path.join(dataDir, scene.imagePath);
    const imageData = await readFile(imagePath);
    console.log(
      `${logPrefix} Image loaded: ${(imageData.length / 1024).toFixed(0)}KB`,
    );

    // 5. Prepare image for TV (upscale to 4K JPEG)
    console.log(`${logPrefix} Upscaling to 4K...`);
    let preparedImage = await prepareForTV(imageData);
    console.log(
      `${logPrefix} Upscaled: ${(preparedImage.length / 1024).toFixed(0)}KB`,
    );

    // 5b. Apply overlays if enabled
    const overlay = appSettings.overlay ?? {
      showQuote: false,
      showWeather: false,
      showMarket: false,
      temperatureUnit: "celsius" as const,
    };
    if (overlay.showQuote || overlay.showWeather || overlay.showMarket) {
      const context = scene.contextJson ? JSON.parse(scene.contextJson) : null;
      if (context) {
        console.log(
          `${logPrefix} Applying overlays (quote=${overlay.showQuote}, weather=${overlay.showWeather}, market=${overlay.showMarket})`,
        );
        preparedImage = await applyOverlays(preparedImage, context, overlay);
        console.log(
          `${logPrefix} Overlays applied: ${(preparedImage.length / 1024).toFixed(0)}KB`,
        );
      }
    }

    // 6. Update status to pending
    await db
      .update(scenes)
      .set({ publishStatus: "pending" })
      .where(eq(scenes.id, id));

    // 7. Upload to TV
    console.log(`${logPrefix} Uploading to TV at ${tvIp}...`);
    const tvPublisher = getTvPublisher(tvIp);
    const tvToken = appSettings.tv?.token;
    const startTime = Date.now();
    const result = await tvPublisher.upload(tvIp, preparedImage, tvToken);
    const durationMs = Date.now() - startTime;
    console.log(
      `${logPrefix} Upload result: success=${result.success}, contentId=${result.contentId}, duration=${durationMs}ms, error=${result.error}`,
    );

    const now = new Date().toISOString();

    if (!result.success) {
      await db
        .update(scenes)
        .set({ publishStatus: "failed" })
        .where(eq(scenes.id, id));

      await db.insert(publishHistory).values({
        id: publishId,
        sceneId: id,
        status: "failed",
        publishedAt: now,
        durationMs,
        error: result.error ?? "Upload failed",
      });

      return NextResponse.json(
        {
          error: result.error ?? "Upload failed",
          step: "upload",
          durationMs,
        },
        { status: 500 },
      );
    }

    // 8. Set as active art on the TV
    if (result.contentId) {
      console.log(`${logPrefix} Setting active art: ${result.contentId}`);
      const setActiveOk = await tvPublisher.setActive(
        tvIp,
        result.contentId,
        tvToken,
      );
      console.log(`${logPrefix} Set active result: ${setActiveOk}`);
    }

    // 9. Update scene publish status
    await db
      .update(scenes)
      .set({ publishStatus: "published" })
      .where(eq(scenes.id, id));

    // 10. Record in publish history
    await db.insert(publishHistory).values({
      id: publishId,
      sceneId: id,
      status: "success",
      publishedAt: now,
      durationMs,
      contentId: result.contentId,
    });

    console.log(`${logPrefix} Published successfully in ${durationMs}ms`);

    return NextResponse.json({
      success: true,
      contentId: result.contentId,
      durationMs,
    });
  } catch (error) {
    console.error(`${logPrefix} Publish failed:`, error);

    return NextResponse.json(
      {
        error: "Publish failed",
        message: error instanceof Error ? error.message : "Unknown error",
        step: "unknown",
      },
      { status: 500 },
    );
  }
}
