// ─────────────────────────────────────────────────────────────────────────────
// Monta a apuração de IR (mensal B3 + anual exterior) a partir da planilha.
// Extraído de app/api/ir/handler.ts para ser reusado também pelo cron de
// alertas (DARF a vencer/vencido) — fonte única, sem recálculo duplicado.
// ─────────────────────────────────────────────────────────────────────────────

import { getDataStore } from "@/lib/data-store";
import { toNumber } from "@/lib/format";
import { processarVendas, type RawTx, type CorpEvent, type Posicao, type PtaxLookup } from "./engine";
import { apurar, type Apuracao } from "./apurador";
import { buildMultiCurrencyPtax } from "@/lib/ptax";

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

// Detecta moedas usadas nas transações para buscar PTAX de cada uma.
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

export interface ApuracaoBuild {
  apuracao: Apuracao;
  posicoes: Posicao[];
  realizados: ReturnType<typeof processarVendas>["eventos"];
  ptax: PtaxLookup;
}

/** Apura SEMPRE com o histórico completo (preço médio depende de todas as
 *  compras anteriores) — filtros por ano/período são responsabilidade do chamador. */
export async function buildApuracao(): Promise<ApuracaoBuild> {
  const store = getDataStore();
  const [ativos, ptaxRows, eventosRows] = await Promise.all([
    store.fetchTab("meus_ativos"),
    store.fetchTab("p_tax").catch(() => []),
    store.fetchTab("eventos_corp").catch(() => []), // aba opcional
  ]);

  const txs = parseTransacoes(ativos);
  const currencies = detectCurrencies(ativos);
  const ptax = await buildMultiCurrencyPtax(ptaxRows, currencies);
  const eventos = parseEventos(eventosRows);

  const { eventos: realizados, posicoes } = processarVendas(txs, eventos, ptax);
  const apuracao = apurar(realizados);

  return { apuracao, posicoes, realizados, ptax };
}
