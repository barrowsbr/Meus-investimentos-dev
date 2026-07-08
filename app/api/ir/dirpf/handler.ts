import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchFixaAbertaComIbkr } from "@/lib/ibkr-cash";
import { toNumber } from "@/lib/format";
import type { RawTx, CorpEvent } from "@/lib/tax/engine";
import { bensDireitosRV, classificarRendimentos } from "@/lib/tax/dirpf";
import { apurarRf, rfPosicoesAbertas } from "@/lib/tax/rf";
import { buildMultiCurrencyPtaxDetalhado } from "@/lib/ptax";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Row = Record<string, unknown>;

function parseDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : s.slice(0, 10);
}
const num = (v: unknown) => toNumber(v) ?? 0;

function detectCurrencies(rows: Row[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const m = String(r["moeda"] ?? "BRL").toUpperCase().trim();
    if (m && m !== "BRL") s.add(m);
  }
  if (s.size === 0) s.add("USD");
  return [...s];
}

function parseTransacoes(rows: Row[]): RawTx[] {
  const out: RawTx[] = [];
  for (const r of rows) {
    const tipo = String(r["tipo de transação"] ?? r["tipo"] ?? "").trim();
    const ticker = String(r["símbolo"] ?? r["simbolo"] ?? r["ticker"] ?? "").trim();
    if (!tipo || !ticker) continue;
    out.push({
      date: parseDate(r["data"] ?? r["date"]), tipo, ticker,
      quantidade: Math.abs(num(r["quantidade"] ?? r["qtd"])),
      preco: num(r["preço"] ?? r["preco"] ?? r["price"]),
      taxas: Math.abs(num(r["taxa de corretagem"] ?? r["taxas"])),
      moeda: String(r["moeda"] ?? "BRL").toUpperCase().trim() || "BRL",
      corretora: String(r["corretora"] ?? "").trim(),
    });
  }
  return out;
}

function parseEventos(rows: Row[]): CorpEvent[] {
  const out: CorpEvent[] = [];
  for (const r of rows) {
    const ticker = String(r["ticker"] ?? r["ativo"] ?? "").trim();
    const tipoRaw = String(r["tipo"] ?? r["evento"] ?? "").toLowerCase();
    if (!ticker || !tipoRaw) continue;
    let tipo: CorpEvent["tipo"] | null = null;
    if (tipoRaw.includes("desdobr") || tipoRaw.includes("split")) tipo = "desdobramento";
    else if (tipoRaw.includes("grupa") || tipoRaw.includes("reverse")) tipo = "grupamento";
    else if (tipoRaw.includes("bonif")) tipo = "bonificacao";
    else if (tipoRaw.includes("subscri")) tipo = "subscricao";
    if (!tipo) continue;
    out.push({
      date: parseDate(r["data"] ?? r["date"]), ticker, tipo,
      fator: toNumber(r["fator"] ?? r["proporcao"]) ?? undefined,
      quantidade: toNumber(r["quantidade"]) ?? undefined,
      custoUnitario: toNumber(r["custo_unitario"] ?? r["preco"]) ?? undefined,
    });
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear() - 1), 10);

  try {
    const store = getDataStore();
    const [ativos, ptaxRows, eventosRows, proventos, rfRows, fixaAberta] = await Promise.all([
      store.fetchTab("meus_ativos"),
      store.fetchTab("p_tax").catch(() => []),
      store.fetchTab("eventos_corp").catch(() => []),
      store.fetchTab("meus_proventos").catch(() => []),
      store.fetchTab("renda_fixa").catch(() => []),
      fetchFixaAbertaComIbkr(store).catch(() => []),
    ]);

    const txs = parseTransacoes(ativos);
    const currencies = detectCurrencies(ativos);
    const { ptax, avisos: ptaxAvisos } = await buildMultiCurrencyPtaxDetalhado(ptaxRows, currencies);
    const eventos = parseEventos(eventosRows);
    const fxHoje = ptax("USD", new Date().toISOString().slice(0, 10));

    const bens = bensDireitosRV(txs, eventos, ptax, year);
    const rendimentos = classificarRendimentos(proventos, fxHoje).filter(r => r.ano === String(year));
    const rfRend = apurarRf(rfRows).filter(r => r.ano === String(year));
    const rfAbertas = rfPosicoesAbertas(rfRows, fixaAberta);

    return NextResponse.json({
      year,
      bensDireitos: bens,
      rendimentos: rendimentos[0] ?? null,
      rfRendimentos: rfRend,
      rfPosicoes: rfAbertas,
      totais: {
        bensDireitosCusto: bens.reduce((s, b) => s + b.custoAno, 0),
        rfIrRetido: rfRend.reduce((s, r) => s + r.irRetido, 0),
      },
      ptaxAvisos,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
