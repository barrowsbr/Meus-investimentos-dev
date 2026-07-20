// Proxy de download de uma ROM do Drive (?id=<fileId>). Mantém o modo jogo
// same-origin (o player busca daqui, não do googleapis) e esconde a API key.
// Só serve arquivos que estão no catálogo do Drive do dono.

import { NextRequest, NextResponse } from "next/server";
import { driveMediaUrl, lerCatalogoDrive } from "@/lib/gameboy-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[a-zA-Z0-9_-]{10,}$/.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  // Só IDs presentes no catálogo (o app não vira proxy aberto do Drive).
  try {
    const consoles = await lerCatalogoDrive();
    const ok = consoles.some((c) => c.jogos.some((j) => j.id === id));
    if (!ok) return NextResponse.json({ error: "não está no catálogo" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "catálogo indisponível" }, { status: 502 });
  }

  const r = await fetch(driveMediaUrl(id));
  if (!r.ok) return NextResponse.json({ error: `Drive ${r.status}` }, { status: 502 });
  const buf = await r.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
