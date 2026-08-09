// Lista dinâmica de bens (página Bens) — semente estática + aba bens_lista.
//
//  GET    → bens ativos, com specs e a URL de foto já resolvida (própria >
//           local > proxy Wikimedia). É a carga leve da página (a FIPE, mais
//           lenta, vem por /api/bens/fipe).
//  POST   → adiciona um bem { nome, anoModelo, detalhe?, cor?, codigoFipe?,
//           marcaBusca?, modeloBusca? } (append na planilha).
//  DELETE → remove (desativa) um bem { id } — vale também para os da semente.

import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth-server";
import { listarBens, adicionarBem, removerBem, listarFotosMeta, fotoUrl } from "@/lib/bens-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const [bens, fotos] = await Promise.all([listarBens(), listarFotosMeta()]);
    return NextResponse.json({
      bens: bens.map((b) => ({
        id: b.id,
        nome: b.nome,
        detalhe: b.detalhe,
        cor: b.cor,
        anoModelo: b.anoModelo,
        codigoFipe: b.codigoFipe ?? null,
        specs: b.specs,
        custom: b.custom,
        foto: fotoUrl(b, fotos.get(b.id)),
        fotoPropria: fotos.has(b.id),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const nome = String(body?.nome ?? "").trim();
    const anoModelo = Number(body?.anoModelo);
    if (nome.length < 3) return NextResponse.json({ error: "nome muito curto" }, { status: 400 });
    if (!Number.isFinite(anoModelo) || anoModelo < 1950 || anoModelo > 2100) {
      return NextResponse.json({ error: "ano-modelo inválido" }, { status: 400 });
    }
    const codigoFipe = String(body?.codigoFipe ?? "").trim();
    if (codigoFipe && !/^\d{6}-\d$/.test(codigoFipe)) {
      return NextResponse.json({ error: "código FIPE inválido (formato 000000-0)" }, { status: 400 });
    }
    const id = await adicionarBem({
      nome,
      anoModelo,
      detalhe: String(body?.detalhe ?? "").trim() || undefined,
      cor: String(body?.cor ?? "").trim() || undefined,
      codigoFipe: codigoFipe || undefined,
      marcaBusca: String(body?.marcaBusca ?? "").trim() || undefined,
      modeloBusca: String(body?.modeloBusca ?? "").trim() || undefined,
    });
    return NextResponse.json({ ok: true, id });
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
    const bem = (await listarBens()).find((b) => b.id === id);
    if (!bem) return NextResponse.json({ error: "bem desconhecido" }, { status: 400 });
    await removerBem(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
