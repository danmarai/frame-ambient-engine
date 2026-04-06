export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb, scenes, eq } from "@frame/db";
import { saveRating } from "@frame/rendering";
import type { SceneContext } from "@frame/core";
import { ensureSchema } from "@/lib/db-bootstrap";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureSchema();
    const { id } = await params;

    // Parse and validate body
    const body = await request.json();
    const { rating } = body;

    if (rating !== "up" && rating !== "down") {
      return NextResponse.json(
        { error: 'Invalid rating. Must be "up" or "down".' },
        { status: 400 },
      );
    }

    const db = getDb();
    const rows = await db.select().from(scenes).where(eq(scenes.id, id));

    if (rows.length === 0) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const scene = rows[0]!;

    // Parse context from the scene's contextJson field
    let context: SceneContext | null = null;
    if (scene.contextJson) {
      try {
        context = JSON.parse(scene.contextJson) as SceneContext;
      } catch {
        // If context is malformed, proceed without it
        context = null;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saveRating(db as any, id, rating, context!);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save rating:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
