export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { getDb, scenes, ratings, eq } from "@frame/db";
import { ensureSchema } from "@/lib/db-bootstrap";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureSchema();
    const { id } = await params;
    const db = getDb();

    const rows = await db.select().from(scenes).where(eq(scenes.id, id));
    if (rows.length === 0) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const scene = rows[0]!;

    // Delete image file if it exists
    if (scene.imagePath) {
      const dataDir = path.resolve(process.cwd(), "../../data/images");
      const imagePath = path.join(dataDir, scene.imagePath);
      try {
        await unlink(imagePath);
      } catch {
        // File may already be deleted
      }
    }

    // Delete ratings for this scene
    await db.delete(ratings).where(eq(ratings.sceneId, id));

    // Delete the scene
    await db.delete(scenes).where(eq(scenes.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete failed:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
