export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb, scenes, eq } from "@frame/db";
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
    const newFavorite = scene.favorite === 1 ? 0 : 1;

    await db
      .update(scenes)
      .set({ favorite: newFavorite })
      .where(eq(scenes.id, id));

    return NextResponse.json({ favorite: newFavorite === 1 });
  } catch (error) {
    console.error("Failed to toggle favorite:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
