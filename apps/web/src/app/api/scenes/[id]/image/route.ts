export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getDb, scenes, eq } from "@frame/db";
import { ensureSchema } from "@/lib/db-bootstrap";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureSchema();
    const { id } = await params;
    const db = getDb();
    const rows = await db.select().from(scenes).where(eq(scenes.id, id));

    if (rows.length === 0 || !rows[0]!.imagePath) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const dataDir = path.resolve(process.cwd(), "../../data/images");
    const imagePath = path.join(dataDir, rows[0]!.imagePath);
    const imageData = await readFile(imagePath);

    const ext = rows[0]!.imagePath.endsWith(".jpg") ? "jpeg" : "png";
    return new NextResponse(imageData, {
      headers: {
        "Content-Type": `image/${ext}`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to serve image:", error);
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}
