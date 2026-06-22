import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  try {
    const h = new URL(url).hostname.toLowerCase();
    // Defesa em profundidade: nunca servir imagem hospedada pelo Google
    // (logos do Google News / páginas de consentimento). Pior caso: o front
    // mostra o ícone de jornal, nunca o "G".
    const isGoogle =
      /(^|\.)google\.[a-z.]+$/.test(h) ||
      h.endsWith("gstatic.com") ||
      h.endsWith("googleusercontent.com") ||
      h.endsWith("ggpht.com") ||
      h.includes("google");
    if (isGoogle) return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });

    if (!res.ok) return new NextResponse(null, { status: 502 });

    const ct = res.headers.get("content-type") ?? "image/jpeg";
    const buf = await res.arrayBuffer();

    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
