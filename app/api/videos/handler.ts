import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const dir = path.join(process.cwd(), "public", "midias");
  try {
    const files = fs.readdirSync(dir);
    const videos = files
      .filter((f) => /\.(mp4|webm|mov)$/i.test(f))
      .map((f) => `/midias/${f}`);
    return NextResponse.json({ videos });
  } catch {
    return NextResponse.json({ videos: [] });
  }
}
