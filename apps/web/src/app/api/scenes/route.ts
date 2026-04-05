export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb, scenes, desc } from "@frame/db";
import { ensureSchema } from "@/lib/db-bootstrap";
import type { Scene } from "@frame/core";

export async function GET() {
  try {
    ensureSchema();
    const db = getDb();
    const rows = await db
      .select()
      .from(scenes)
      .orderBy(desc(scenes.createdAt))
      .limit(50);

    const result: Scene[] = rows.map((r) => ({
      id: r.id,
      status: r.status as Scene["status"],
      context: r.contextJson ? JSON.parse(r.contextJson) : null,
      prompt: r.prompt,
      imageProvider: r.imageProvider as Scene["imageProvider"],
      imagePath: r.imagePath,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      durationMs: r.durationMs,
      error: r.error,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load scenes:", error);
    return NextResponse.json([], { status: 500 });
  }
}
