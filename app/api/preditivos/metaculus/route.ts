import { NextResponse } from "next/server";
import { fetchMetaculus } from "@/lib/metaculus";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  try {
    const data = await fetchMetaculus();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[API] Metaculus error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
