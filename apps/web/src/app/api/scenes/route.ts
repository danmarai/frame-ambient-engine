export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDb, scenes, desc, asc, sql, count } from "@frame/db";
import { ensureSchema } from "@/lib/db-bootstrap";
import type { Scene } from "@frame/core";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function GET(request: NextRequest) {
  try {
    ensureSchema();
    const db = getDb();

    const { searchParams } = new URL(request.url);

    // Parse query parameters with defaults
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") || "1", 10) || 1,
    );
    const limit = clamp(
      parseInt(searchParams.get("limit") || "20", 10) || 20,
      1,
      100,
    );
    const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
    const ratingFilter = searchParams.get("rating") as
      | "up"
      | "down"
      | "all"
      | null;
    const favoriteParam = searchParams.get("favorite");

    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: ReturnType<typeof sql>[] = [];

    // Favorite filter — requires a 'favorite' column on scenes table.
    // When the column exists, uncomment and use:
    if (favoriteParam === "true") {
      conditions.push(
        sql`${scenes.id} IN (SELECT id FROM scenes WHERE favorite = 1)`,
      );
    } else if (favoriteParam === "false") {
      conditions.push(
        sql`${scenes.id} IN (SELECT id FROM scenes WHERE favorite = 0 OR favorite IS NULL)`,
      );
    }

    // Rating filter — requires a 'ratings' table.
    // When the table exists, uncomment and use:
    if (ratingFilter === "up" || ratingFilter === "down") {
      conditions.push(
        sql`${scenes.id} IN (SELECT scene_id FROM ratings WHERE value = ${ratingFilter})`,
      );
    }

    const whereClause =
      conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

    const orderBy =
      sort === "oldest" ? asc(scenes.createdAt) : desc(scenes.createdAt);

    // Get total count (with filters applied)
    const countQuery = whereClause
      ? db.select({ value: count() }).from(scenes).where(whereClause)
      : db.select({ value: count() }).from(scenes);

    const [{ value: total }] = await countQuery;

    // Get paginated rows
    const rowsQuery = whereClause
      ? db
          .select()
          .from(scenes)
          .where(whereClause)
          .orderBy(orderBy)
          .limit(limit)
          .offset(offset)
      : db.select().from(scenes).orderBy(orderBy).limit(limit).offset(offset);

    const rows = await rowsQuery;

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

    return NextResponse.json({
      scenes: result,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Failed to load scenes:", error);
    return NextResponse.json(
      { scenes: [], total: 0, page: 1, limit: 20 },
      { status: 500 },
    );
  }
}
