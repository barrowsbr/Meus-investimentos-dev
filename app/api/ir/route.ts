import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { toNumber } from "@/lib/format";
import { processarVendas, type RawTx, type CorpEvent, type PtaxLookup } from "@/lib/tax/engine";
import { apurar } from "@/lib/tax/apurador";
import { regra } from "@/lib/tax/rules";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Row = Record<string, unknown>;

function parseDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return s.slice(0, 10);
}
function num(v: unknown): number {
  return toNumber(v) ?? 0;
}

// PtaxLookup com forward-fill a partir da aba p_tax (date → USDBRL venda).
function buildPtaxLookup(ptaxRows: Row[]): PtaxLookup {
  const map = new Map<string, number>();
  for (const row of ptaxRows) {
    const data = parseDate(row["data"] ?? row["date"] ?? row["data cotação"] ?? row["data cotacao"]);
    const moeda = String(row["moeda"] ?? row["currency"] ?? "USD").toUpperCase();
    if (moeda.includes("EUR")) continue; // p_tax pode misturar; priorizamos USD
    const venda = num(row["taxa"] ?? row["venda"] ?? row["ptax_venda"] ?? row["cotação"] ?? row["cotacao"] ?? row["valor"] ?? row["ptax"]);
    if (!data || venda <= 0) continue;
    map.set(data, venda);
  }
  const datas = [...map.keys()].sort();
  return (moeda, dateISO) => {
    if ((moeda || "BRL").toUpperCase() === "BRL") return 1;
    if (datas.length === 0) return 5.0; // fallback defensivo
    // último PTAX com data <= dateISO; se nenhum, o primeiro disponível
    let escolhido = datas[0];
    for (const d of datas) { if (d <= dateISO) escolhido = d; else break; }
    return map.get(escolhido) ?? 5.0;
  };
}

function parseTransacoes(rows: Row[]): RawTx[] {
  const out: RawTx[] = [];
  for (const r of rows) {
    const tipo = String(r["tipo de transação"] ?? r["tipo"] ?? "").trim();
    if (!tipo) continue;
    const ticker = String(r["símbolo"] ?? r["simbolo"] ?? r["ticker"] ?? r["symbol"] ?? "").trim();
    if (!ticker) continue;
    out.push({
      date: parseDate(r["data"] ?? r["date"]),
      tipo,
      ticker,
      quantidade: Math.abs(num(r["quantidade"] ?? r["qtd"] ?? r["quantity"])),
      preco: num(r["preço"] ?? r["preco"] ?? r["price"]),
      taxas: Math.abs(num(r["taxa de corretagem"] ?? r["taxas"] ?? r["corretagem"])),
      moeda: String(r["moeda"] ?? "BRL").toUpperCase().trim() || "BRL",
      corretora: String(r["corretora"] ?? "").trim(),
    });
  }
  return out;
}

function parseEventos(rows: Row[]): CorpEvent[] {
  const out: CorpEvent[] = [];
  for (const r of rows) {
    const ticker = String(r["ticker"] ?? r["símbolo"] ?? r["simbolo"] ?? r["ativo"] ?? "").trim();
    const tipoRaw = String(r["tipo"] ?? r["evento"] ?? "").toLowerCase().trim();
    if (!ticker || !tipoRaw) continue;
    let tipo: CorpEvent["tipo"] | null = null;
    if (tipoRaw.includes("desdobr") || tipoRaw.includes("split")) tipo = "desdobramento";
    else if (tipoRaw.includes("grupa") || tipoRaw.includes("inplit") || tipoRaw.includes("reverse")) tipo = "grupamento";
    else if (tipoRaw.includes("bonif")) tipo = "bonificacao";
    else if (tipoRaw.includes("subscri")) tipo = "subscricao";
    if (!tipo) continue;
    out.push({
      date: parseDate(r["data"] ?? r["date"]),
      ticker,
      tipo,
      fator: toNumber(r["fator"] ?? r["proporcao"] ?? r["proporção"]) ?? undefined,
      quantidade: toNumber(r["quantidade"] ?? r["qtd"]) ?? undefined,
      custoUnitario: toNumber(r["custo_unitario"] ?? r["custo unitário"] ?? r["preco"] ?? r["preço"]) ?? undefined,
    });
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;

  try {
    const [ativos, ptaxRows, eventosRows] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("p_tax").catch(() => []),
      fetchTab("eventos_corp").catch(() => []), // aba opcional
    ]);

    const ptax = buildPtaxLookup(ptaxRows);
    const txs = parseTransacoes(ativos);
    const eventos = parseEventos(eventosRows);

    // Apura SEMPRE com o histórico completo (preço médio depende de todas as
    // compras anteriores); o filtro por ano é aplicado depois, sobre os eventos.
    const { eventos: realizados, posicoes } = processarVendas(txs, eventos, ptax);
    const apuracao = apurar(realizados);

    // Enriquece posições com bucket/alíquota/isenção (para o simulador).
    const hoje = new Date().toISOString().slice(0, 10);
    const mesAtual = hoje.slice(0, 7);
    const fxHoje = ptax("USD", hoje);
    const posicoesEnriquecidas = posicoes.map(p => {
      const r = regra(p.modalidade, hoje);
      return {
        ...p,
        bucket: r.offsetBucket,
        aliquota: r.aliquota,
        isentavel: r.isentavel ?? false,
        valorAtualBRL: p.moeda === "BRL" ? p.qty * p.pmBRL : p.qty * p.pmNative * fxHoje,
      };
    });
    // Vendas de ações já realizadas no mês corrente (contam para o limite de R$20k).
    const acoesVendasMesAtual = realizados
      .filter(e => e.modalidade === "acoes_swing" && e.month === mesAtual)
      .reduce((s, e) => s + e.proceedsBRL, 0);

    const extras = {
      posicoes: posicoesEnriquecidas,
      fxHoje,
      mesAtual,
      acoesVendasMesAtual,
      limiteIsencaoAcoes: regra("acoes_swing", hoje).isencaoMensalVendas ?? 20000,
    };

    if (year) {
      const ys = String(year);
      return NextResponse.json({
        year,
        meses: apuracao.meses.filter(m => m.mes.startsWith(ys)),
        exterior: apuracao.exterior.filter(a => a.ano === ys),
        prejuizoFinal: apuracao.prejuizoFinal,
        irTotalMensal: apuracao.meses.filter(m => m.mes.startsWith(ys)).reduce((s, m) => s + m.irTotal, 0),
        irTotalExterior: apuracao.exterior.filter(a => a.ano === ys).reduce((s, a) => s + a.irDevido, 0),
        eventosRealizados: realizados.filter(e => e.year === ys),
        ...extras,
      });
    }

    return NextResponse.json({
      year: null,
      ...apuracao,
      eventosRealizados: realizados,
      ...extras,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
