import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { toNumber } from "@/lib/format";
import type { RawTx, CorpEvent, PtaxLookup } from "@/lib/tax/engine";
import { bensDireitosRV, classificarRendimentos } from "@/lib/tax/dirpf";
import { apurarRf, rfPosicoesAbertas } from "@/lib/tax/rf";

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

function buildPtaxLookup(ptaxRows: Row[]): PtaxLookup {
  const map = new Map<string, number>();
  for (const row of ptaxRows) {
    const data = parseDate(row["data"] ?? row["date"]);
    const venda = num(row["taxa"] ?? row["venda"] ?? row["ptax_venda"] ?? row["cotação"] ?? row["cotacao"] ?? row["valor"]);
    if (!data || venda <= 0) continue;
    map.set(data, venda);
  }
  const datas = [...map.keys()].sort();
  return (moeda, dateISO) => {
    if ((moeda || "BRL").toUpperCase() === "BRL") return 1;
    if (datas.length === 0) return 5.0;
    let escolhido = datas[0];
    for (const d of datas) { if (d <= dateISO) escolhido = d; else break; }
    return map.get(escolhido) ?? 5.0;
  };
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
    const [ativos, ptaxRows, eventosRows, proventos, rfRows, fixaAberta] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("p_tax").catch(() => []),
      fetchTab("eventos_corp").catch(() => []),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("renda_fixa").catch(() => []),
      fetchTab("fixa_aberta").catch(() => []),
    ]);

    const ptax = buildPtaxLookup(ptaxRows);
    const txs = parseTransacoes(ativos);
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
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
