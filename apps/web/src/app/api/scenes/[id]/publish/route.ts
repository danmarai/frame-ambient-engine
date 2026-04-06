export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { getDb, scenes, publishHistory, settings, eq } from "@frame/db";
import { DEFAULT_SETTINGS } from "@frame/core";
import type { AppSettings } from "@frame/core";
import { prepareForTV } from "@frame/rendering";
import { ensureSchema } from "@/lib/db-bootstrap";
import { getTvPublisher } from "@/lib/providers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureSchema();
    const { id } = await params;
    const db = getDb();

    // 1. Load scene from DB
    const rows = await db.select().from(scenes).where(eq(scenes.id, id));

    if (rows.length === 0) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const scene = rows[0]!;

    // 2. Verify scene is complete and has an image
    if (scene.status !== "complete" || !scene.imagePath) {
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
      return NextResponse.json({ error: "TV not configured" }, { status: 400 });
    }

    // 4. Read image from filesystem
    const dataDir = path.resolve(process.cwd(), "../../data/images");
    const imagePath = path.join(dataDir, scene.imagePath);
    const imageData = await readFile(imagePath);

    // 5. Prepare image for TV (upscale to 4K JPEG)
    const preparedImage = await prepareForTV(imageData);

    // 6. Upload to TV
    const tvPublisher = getTvPublisher();
    const tvToken = appSettings.tv?.token;
    const startTime = Date.now();
    const result = await tvPublisher.upload(tvIp, preparedImage, tvToken);
    const durationMs = Date.now() - startTime;

    const publishId = randomUUID();
    const now = new Date().toISOString();

    if (!result.success) {
      // Update scene publish status
      await db
        .update(scenes)
        .set({ publishStatus: "failed" })
        .where(eq(scenes.id, id));

      // Record in publish history
      await db.insert(publishHistory).values({
        id: publishId,
        sceneId: id,
        status: "failed",
        publishedAt: now,
        durationMs,
        error: result.error ?? "Upload failed",
      });

      return NextResponse.json(
        { error: result.error ?? "Upload failed" },
        { status: 500 },
      );
    }

    // 7. Set as active art on the TV
    if (result.contentId) {
      await tvPublisher.setActive(tvIp, result.contentId, tvToken);
    }

    // 8. Update scene publish status
    await db
      .update(scenes)
      .set({ publishStatus: "published" })
      .where(eq(scenes.id, id));

    // 9. Record in publish history
    await db.insert(publishHistory).values({
      id: publishId,
      sceneId: id,
      status: "success",
      publishedAt: now,
      durationMs,
      contentId: result.contentId,
    });

    return NextResponse.json({
      success: true,
      contentId: result.contentId,
      durationMs,
    });
  } catch (error) {
    console.error("Publish failed:", error);

    return NextResponse.json(
      {
        error: "Publish failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
