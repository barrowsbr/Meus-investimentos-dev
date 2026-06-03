// ─────────────────────────────────────────────────────────────────────────────
// Renda Fixa — apuração de rendimento e IRRF pela TABELA REGRESSIVA.
//
// A RF é tributada EXCLUSIVAMENTE NA FONTE (o investidor não recolhe DARF): o
// banco retém o IR sobre o RENDIMENTO no resgate, conforme o prazo da aplicação
// (22,5% até 180d … 15% acima de 720d). Aqui é uma ESTIMATIVA de apoio e para a
// declaração (rendimentos tributados exclusivamente na fonte + bens e direitos).
//
// Limitação do modelo de dados: a aba renda_fixa tem só "valor" por lançamento
// (sem qtd/preço). Tratamos por ticker: investido = Σ compras; resgatado = Σ
// resgates/vencimentos; rendimento = resgatado − investido (parcela fechada).
// ─────────────────────────────────────────────────────────────────────────────

import { toNumber } from "../format";
import { rfAliquotaRegressiva } from "./rules";

type Row = Record<string, unknown>;
const CASH = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

function parseDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : s.slice(0, 10);
}
const diasCorridos = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000));

interface RfTx { date: string; ticker: string; tipo: "compra" | "resgate"; valor: number; moeda: string; }

function parseRf(rows: Row[]): RfTx[] {
  const out: RfTx[] = [];
  for (const r of rows) {
    const ticker = String(r["ticker"] ?? r["ativo"] ?? r["papel"] ?? "").trim();
    if (!ticker || CASH.has(ticker.toUpperCase())) continue;
    const tipoRaw = String(r["tipo"] ?? r["movimentacao"] ?? "").toLowerCase();
    let tipo: RfTx["tipo"] | null = null;
    if (tipoRaw.includes("compra") || tipoRaw.includes("aplica") || tipoRaw.includes("aporte")) tipo = "compra";
    else if (tipoRaw.includes("venda") || tipoRaw.includes("resgate") || tipoRaw.includes("vencimento")) tipo = "resgate";
    if (!tipo) continue;
    const valor = Math.abs(toNumber(r["valor"]) ?? 0);
    if (valor < 0.01) continue;
    out.push({ date: parseDate(r["compra"] ?? r["data"] ?? r["date"]), ticker, tipo, valor, moeda: String(r["moeda"] ?? "BRL").toUpperCase().trim() || "BRL" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface RfRendimento {
  ticker: string; ano: string; investido: number; resgatado: number;
  rendimento: number; diasCorridos: number; aliquota: number; irRetido: number; moeda: string;
}

/** Rendimentos de RF realizados (posições com resgate), por ticker. */
export function apurarRf(rows: Row[]): RfRendimento[] {
  const txs = parseRf(rows);
  const byTicker = new Map<string, RfTx[]>();
  for (const t of txs) { if (!byTicker.has(t.ticker)) byTicker.set(t.ticker, []); byTicker.get(t.ticker)!.push(t); }

  const out: RfRendimento[] = [];
  for (const [ticker, list] of byTicker) {
    const compras = list.filter(t => t.tipo === "compra");
    const resgates = list.filter(t => t.tipo === "resgate");
    if (resgates.length === 0) continue; // posição em aberto → sem rendimento realizado
    const investido = compras.reduce((s, t) => s + t.valor, 0);
    const resgatado = resgates.reduce((s, t) => s + t.valor, 0);
    const rendimento = resgatado - investido;
    const dias = compras.length > 0 ? diasCorridos(compras[0].date, resgates[resgates.length - 1].date) : 0;
    const aliquota = rfAliquotaRegressiva(dias);
    out.push({
      ticker, ano: resgates[resgates.length - 1].date.slice(0, 4),
      investido, resgatado, rendimento, diasCorridos: dias, aliquota,
      irRetido: Math.max(0, rendimento) * aliquota,
      moeda: list[0].moeda,
    });
  }
  return out.sort((a, b) => a.ano.localeCompare(b.ano) || a.ticker.localeCompare(b.ticker));
}

/** Posições de RF em aberto (a custo investido), para Bens e Direitos. */
export function rfPosicoesAbertas(rfRows: Row[], fixaAberta: Row[]): { ticker: string; investido: number; atual: number; moeda: string }[] {
  const txs = parseRf(rfRows);
  const investidoPorTicker = new Map<string, { v: number; moeda: string }>();
  for (const t of txs) {
    const cur = investidoPorTicker.get(t.ticker) ?? { v: 0, moeda: t.moeda };
    cur.v += t.tipo === "compra" ? t.valor : -t.valor;
    investidoPorTicker.set(t.ticker, cur);
  }
  const out: { ticker: string; investido: number; atual: number; moeda: string }[] = [];
  for (const row of fixaAberta) {
    const ticker = String(row["ticker"] ?? row["ativo"] ?? "").trim();
    if (!ticker || CASH.has(ticker.toUpperCase())) continue;
    const atual = toNumber(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"]) ?? 0;
    if (atual <= 0) continue;
    const inv = investidoPorTicker.get(ticker);
    out.push({ ticker, investido: inv ? Math.max(0, inv.v) : atual, atual, moeda: String(row["moeda"] ?? "BRL").toUpperCase() || "BRL" });
  }
  return out.sort((a, b) => a.ticker.localeCompare(b.ticker));
}
