export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { discoverFrameTVs } from "@frame/tv";

export async function POST() {
  try {
    const devices = await discoverFrameTVs();
    return NextResponse.json(devices);
  } catch (error) {
    console.error("TV discovery failed:", error);
    return NextResponse.json({ error: "TV discovery failed" }, { status: 500 });
  }
}
