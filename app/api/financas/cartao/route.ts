// Cartão de crédito (OFX do Nubank) — aba Cartão da página Finanças.
//
//  GET   → transações acumuladas (aba cartao_transacoes) com categoria efetiva
//          (regra manual > automática), + assinaturas e parcelamentos DETECTADOS.
//  POST  → importa um OFX (body { ofx }): parseia, deduplica por fitid+valor
//          contra a planilha e faz append só dos novos. Idempotente.
//  PATCH → recategoriza um estabelecimento (body { estabelecimento, categoria }):
//          vira regra na aba cartao_categorias (append, leitura last-wins) e
//          vale para TODO o histórico e importações futuras daquele lugar.
//
// A planilha é a golden source: cada importação soma ao histórico (o OFX do
// Nubank cobre ~30 dias; importando de vez em quando, a base vira anos).

import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth-server";
import { fetchTab, ensureTab, appendRowsTyped } from "@/lib/gsheets";
import { lerEscopo, gravarEscopo } from "@/lib/app-config";
import { parseOfx, pareceOfx, type TransacaoCartao } from "@/lib/financas/ofx";
import {
  CATEGORIAS, categoriaEfetiva, normalizarEstabelecimento,
  detectarAssinaturas, detectarParcelamentos,
} from "@/lib/financas/categorias";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

const TAB_TRANS = "cartao_transacoes";
const COLS_TRANS = ["chave", "fitid", "data", "descricao", "valor", "tipo", "parcela"];
const TAB_REGRAS = "cartao_categorias";
const COLS_REGRAS = ["estabelecimento", "categoria"];

async function lerTransacoes(): Promise<TransacaoCartao[]> {
  const out: TransacaoCartao[] = [];
  try {
    for (const row of await fetchTab(TAB_TRANS)) {
      const chave = String(row["chave"] ?? "").trim();
      const data = String(row["data"] ?? "").trim();
      const valor = Number(row["valor"]);
      if (!chave || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(valor)) continue;
      const parcelaRaw = String(row["parcela"] ?? "").trim();
      const mP = parcelaRaw.match(/^(\d+)\/(\d+)$/);
      out.push({
        chave,
        fitid: String(row["fitid"] ?? ""),
        data,
        valor,
        descricao: String(row["descricao"] ?? ""),
        tipo: valor >= 0 ? "CREDIT" : "DEBIT",
        parcela: mP ? { n: Number(mP[1]), total: Number(mP[2]) } : null,
      });
    }
  } catch { /* aba ainda não existe */ }
  out.sort((a, b) => b.data.localeCompare(a.data));
  return out;
}

async function lerRegras(): Promise<Map<string, string>> {
  const regras = new Map<string, string>(); // last-wins (append é o update)
  try {
    for (const row of await fetchTab(TAB_REGRAS)) {
      const est = String(row["estabelecimento"] ?? "").trim().toLowerCase();
      const cat = String(row["categoria"] ?? "").trim();
      if (est && cat) regras.set(est, cat);
    }
  } catch { /* aba ainda não existe */ }
  return regras;
}

export async function GET() {
  try {
    const [transacoes, regras, cfg] = await Promise.all([
      lerTransacoes(),
      lerRegras(),
      lerEscopo("cartao").catch(() => new Map<string, string>()),
    ]);
    // Dia de fechamento da fatura — aprendido do DTEND do próprio OFX no
    // import. Permite a visão "por fatura" (o ciclo do Nubank cruza a virada
    // do mês; agrupar só por mês calendário nunca bate com o app do banco).
    const fechamentoDia = Number(cfg.get("fechamento_dia")) || null;
    const datas = transacoes.map((t) => t.data);
    return NextResponse.json({
      transacoes: transacoes.map((t) => ({
        ...t,
        estabelecimento: normalizarEstabelecimento(t.descricao),
        categoria: categoriaEfetiva(t.descricao, regras),
      })),
      regras: Object.fromEntries(regras),
      categorias: CATEGORIAS,
      assinaturas: detectarAssinaturas(transacoes),
      parcelamentos: detectarParcelamentos(transacoes),
      fechamentoDia,
      cobertura: datas.length ? { de: datas[datas.length - 1], ate: datas[0] } : null,
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
    const ofx = String(body?.ofx ?? "");
    if (!ofx || !pareceOfx(ofx)) {
      return NextResponse.json({ error: "arquivo não parece um OFX" }, { status: 400 });
    }

    const { transacoes, periodo } = parseOfx(ofx);
    if (transacoes.length === 0) {
      return NextResponse.json({ error: "OFX sem lançamentos" }, { status: 400 });
    }

    const existentes = new Set((await lerTransacoes()).map((t) => t.chave));
    const novas = transacoes.filter((t) => !existentes.has(t.chave));

    if (novas.length > 0) {
      await ensureTab(TAB_TRANS, COLS_TRANS);
      await appendRowsTyped(
        TAB_TRANS,
        novas.map((t) => [
          t.chave, t.fitid, t.data, t.descricao, t.valor, t.tipo,
          t.parcela ? `${t.parcela.n}/${t.parcela.total}` : "",
        ]),
      );
    }

    // Aprende o dia de fechamento da fatura pelo DTEND do arquivo (best-effort).
    const diaFechamento = Number(periodo?.fim?.slice(8, 10));
    if (Number.isFinite(diaFechamento) && diaFechamento >= 1) {
      try { await gravarEscopo("cartao", [["fechamento_dia", String(diaFechamento)]]); } catch { /* demo/sem SA */ }
    }

    return NextResponse.json({
      ok: true,
      novos: novas.length,
      duplicados: transacoes.length - novas.length,
      periodo,
      totalNaBase: existentes.size + novas.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const est = String(body?.estabelecimento ?? "").trim().toLowerCase();
    const cat = String(body?.categoria ?? "").trim();
    if (!est || !(CATEGORIAS as readonly string[]).includes(cat)) {
      return NextResponse.json({ error: "estabelecimento/categoria inválidos" }, { status: 400 });
    }
    await ensureTab(TAB_REGRAS, COLS_REGRAS);
    await appendRowsTyped(TAB_REGRAS, [[est, cat]]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
