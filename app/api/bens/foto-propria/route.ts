// Foto PRÓPRIA de um bem — enviada pelo dono na página Bens e guardada na
// planilha (aba bens_fotos, base64 fatiado; ver lib/bens-store.ts).
//
//  GET ?id=&v=  → serve o JPEG. Com `v` (timestamp da foto) o cache CDN é
//                 longo — trocar a foto muda o v e fura o cache sozinho.
//  POST { id, dataUrl } → grava (o cliente já redimensionou p/ ~1600px JPEG).
//  DELETE { id }        → volta para a foto padrão (local/Wikimedia).

import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth-server";
import { acharBem, lerFotoPropria, gravarFotoPropria, removerFotoPropria } from "@/lib/bens-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

// ~2,6 MB de base64 (≈2 MB de JPEG) — folga sobre o redimensionamento do
// cliente sem deixar a aba da planilha explodir.
const MAX_B64 = 2_600_000;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const foto = await lerFotoPropria(id);
  if (!foto || foto.buf.length === 0) {
    return NextResponse.json({ error: "sem foto própria" }, { status: 404 });
  }
  const versionada = !!req.nextUrl.searchParams.get("v");
  return new Response(new Uint8Array(foto.buf), {
    headers: {
      "Content-Type": foto.mime,
      "Cache-Control": versionada
        ? "public, s-maxage=31536000, immutable"
        : "public, s-maxage=300",
    },
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    const dataUrl = String(body?.dataUrl ?? "");
    if (!(await acharBem(id))) return NextResponse.json({ error: "bem desconhecido" }, { status: 400 });
    const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return NextResponse.json({ error: "imagem inválida (esperado data:image/... base64)" }, { status: 400 });
    if (m[2].length > MAX_B64) {
      return NextResponse.json({ error: "imagem grande demais — tente de novo (o app redimensiona sozinho)" }, { status: 413 });
    }
    await gravarFotoPropria(id, m[1], m[2]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    await removerFotoPropria(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
