// Importação de histórico FIPE para a aba `fipe_historico` — alimentada pelo
// script de backfill rodado NO NAVEGADOR DO DONO (scripts/fipe-backfill-console.js).
//
// Por quê assim: o site oficial da FIPE (veiculos.fipe.org.br) libera QUALQUER
// tabela de referência de graça, mas bloqueia IP de datacenter (403 no runner
// do GitHub e na Vercel — diagnóstico ago/2026). De IP residencial funciona.
// O script roda no console do PRÓPRIO site da FIPE (mesma origem), varre os
// meses e POSTa aqui — por isso o CORS libera aquela origem específica.
//
// Segurança (rota aberta, escrita estreita): só aceita códigos FIPE dos
// veículos cadastrados em lib/bens.ts, mês no formato yyyy-mm e ≤ mês atual,
// valor numérico plausível, e NUNCA sobrescreve mês já gravado (append-only
// dos faltantes). O pior abuso possível é gravar o valor público da FIPE.

import { NextRequest, NextResponse } from "next/server";
import { fetchTab, ensureTab, appendRowsTyped } from "@/lib/gsheets";
import { VEICULOS } from "@/lib/bens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const TAB = "fipe_historico";
const TAB_COLS = ["mes", "codigo", "mes_ref", "valor"];

const CORS = {
  "Access-Control-Allow-Origin": "https://veiculos.fipe.org.br",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface PontoIn { mes?: unknown; mesRef?: unknown; valor?: unknown }

export async function POST(req: NextRequest) {
  let body: { codigo?: unknown; pontos?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: CORS });
  }

  const codigo = String(body.codigo ?? "").trim();
  const codigosValidos = new Set(VEICULOS.map((v) => v.codigoFipe).filter(Boolean));
  if (!codigosValidos.has(codigo)) {
    return NextResponse.json({ error: "código FIPE não cadastrado" }, { status: 400, headers: CORS });
  }
  if (!Array.isArray(body.pontos) || body.pontos.length > 400) {
    return NextResponse.json({ error: "pontos ausentes ou demais" }, { status: 400, headers: CORS });
  }

  const mesAtual = new Date().toISOString().slice(0, 7);
  const limpos: Array<{ mes: string; mesRef: string; valor: number }> = [];
  for (const p of body.pontos as PontoIn[]) {
    const mes = String(p.mes ?? "").trim();
    const mesRef = String(p.mesRef ?? mes).trim().slice(0, 40);
    const valor = Number(p.valor);
    if (!/^\d{4}-\d{2}$/.test(mes) || mes > mesAtual) continue;
    if (!Number.isFinite(valor) || valor < 1000 || valor > 10_000_000) continue;
    limpos.push({ mes, mesRef, valor: Math.round(valor * 100) / 100 });
  }
  if (limpos.length === 0) {
    return NextResponse.json({ gravados: 0, jaExistiam: 0, recebidos: (body.pontos as unknown[]).length }, { headers: CORS });
  }

  // Dedup contra a planilha — importação NUNCA sobrescreve mês existente.
  const existentes = new Set<string>();
  try {
    for (const row of await fetchTab(TAB)) {
      if (String(row["codigo"] ?? "").trim() === codigo) existentes.add(String(row["mes"] ?? "").trim());
    }
  } catch { /* aba ainda não existe */ }

  const vistos = new Set<string>();
  const novos = limpos.filter((p) => {
    if (existentes.has(p.mes) || vistos.has(p.mes)) return false;
    vistos.add(p.mes);
    return true;
  });

  if (novos.length > 0) {
    await ensureTab(TAB, TAB_COLS);
    await appendRowsTyped(TAB, novos.map((p) => [p.mes, codigo, p.mesRef, p.valor]));
  }

  return NextResponse.json(
    { gravados: novos.length, jaExistiam: limpos.length - novos.length },
    { headers: CORS },
  );
}
