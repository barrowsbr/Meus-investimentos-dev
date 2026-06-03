// ─────────────────────────────────────────────────────────────────────────────
// Insumos para a DECLARAÇÃO ANUAL (DIRPF):
//  • Bens e Direitos: posição a CUSTO em 31/12 do ano e do ano anterior.
//  • Rendimentos: isentos (dividendos BR, rend. de FII) vs tributação exclusiva
//    na fonte (JCP) vs tributáveis (dividendos do exterior), + IRRF retido.
//
// Os códigos de Bens e Direitos são uma ORIENTAÇÃO (o leiaute muda por ano-base;
// confirme no programa da Receita). O valor a custo é o dado principal.
// ─────────────────────────────────────────────────────────────────────────────

import { processarVendas, type RawTx, type CorpEvent, type PtaxLookup, type Posicao } from "./engine";
import { toNumber } from "../format";

type Row = Record<string, unknown>;

/** Posições em aberto a CUSTO ao fim de `dataCorte` (YYYY-MM-DD). */
export function posicoesEmData(
  txs: RawTx[], corp: CorpEvent[], ptax: PtaxLookup, dataCorte: string,
): Posicao[] {
  const t = txs.filter(x => x.date <= dataCorte);
  const c = corp.filter(x => x.date <= dataCorte);
  return processarVendas(t, c, ptax).posicoes;
}

export interface BemDireito {
  ticker: string;
  assetClass: string;
  grupo: string;
  codigo: string;
  descricao: string;
  localizacao: "Brasil" | "Exterior";
  qty: number;
  custoAno: number;       // custo em 31/12 do ano (BRL)
  custoAnoAnterior: number;
  moeda: string;
}

// Orientação de grupo/código (leiaute DIRPF 2024+).
function grupoCodigo(assetClass: string): { grupo: string; codigo: string; descricao: string; loc: "Brasil" | "Exterior" } {
  switch (assetClass) {
    case "acoes": return { grupo: "03", codigo: "01", descricao: "Ações (inclusive units)", loc: "Brasil" };
    case "etf_acoes": return { grupo: "07", codigo: "09", descricao: "Fundo de Índice (ETF) de ações", loc: "Brasil" };
    case "fii": return { grupo: "07", codigo: "03", descricao: "Fundo de Investimento Imobiliário (FII)", loc: "Brasil" };
    case "bdr": return { grupo: "04", codigo: "04", descricao: "BDR — Brazilian Depositary Receipt", loc: "Brasil" };
    case "exterior": return { grupo: "03", codigo: "01", descricao: "Aplicação financeira no exterior (Lei 14.754/23)", loc: "Exterior" };
    case "rf": return { grupo: "04", codigo: "02", descricao: "Aplicação de renda fixa (CDB/Tesouro/etc.)", loc: "Brasil" };
    default: return { grupo: "99", codigo: "99", descricao: "Outros", loc: "Brasil" };
  }
}

/** Monta Bens e Direitos (RV) comparando 31/12 do ano e do ano anterior. */
export function bensDireitosRV(
  txs: RawTx[], corp: CorpEvent[], ptax: PtaxLookup, ano: number,
): BemDireito[] {
  const fimAno = `${ano}-12-31`;
  const fimAnoAnterior = `${ano - 1}-12-31`;
  const atual = posicoesEmData(txs, corp, ptax, fimAno);
  const anterior = posicoesEmData(txs, corp, ptax, fimAnoAnterior);
  const mapAnterior = new Map(anterior.map(p => [p.ticker, p]));

  const tickers = new Set([...atual.map(p => p.ticker), ...anterior.map(p => p.ticker)]);
  const out: BemDireito[] = [];
  for (const ticker of tickers) {
    const a = atual.find(p => p.ticker === ticker);
    const b = mapAnterior.get(ticker);
    const ref = a ?? b!;
    const gc = grupoCodigo(ref.assetClass);
    const custoAno = a ? a.qty * a.pmBRL : 0;
    const custoAnt = b ? b.qty * b.pmBRL : 0;
    if (custoAno < 0.01 && custoAnt < 0.01) continue;
    out.push({
      ticker, assetClass: ref.assetClass, grupo: gc.grupo, codigo: gc.codigo,
      descricao: gc.descricao, localizacao: gc.loc, qty: a?.qty ?? 0,
      custoAno, custoAnoAnterior: custoAnt, moeda: ref.moeda,
    });
  }
  return out.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.ticker.localeCompare(b.ticker));
}

// ─── Rendimentos (proventos) ──────────────────────────────────────────────────

export interface RendimentosAno {
  ano: string;
  isentosDividendosBR: number;      // ações BR — isento
  isentosRendimentoFII: number;     // FII — isento (PF)
  exclusivaJCP: number;             // JCP — tributação exclusiva na fonte (15%)
  tributavelExterior: number;       // dividendos do exterior — tributável
  irrfRetido: number;               // IR retido (fonte / imposto estrangeiro)
}

function pdate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : s.slice(0, 10);
}

/** Classifica os proventos por ano. `fxUSD` converte dividendos em USD para BRL. */
export function classificarRendimentos(proventos: Row[], fxUSD: number): RendimentosAno[] {
  const byAno = new Map<string, RendimentosAno>();
  const get = (ano: string) => {
    if (!byAno.has(ano)) byAno.set(ano, { ano, isentosDividendosBR: 0, isentosRendimentoFII: 0, exclusivaJCP: 0, tributavelExterior: 0, irrfRetido: 0 });
    return byAno.get(ano)!;
  };

  for (const row of proventos) {
    const ano = pdate(row["data"] ?? row["date"]).slice(0, 4);
    if (!ano || ano.length !== 4) continue;
    const lanc = String(row["lancamento"] ?? row["decisao"] ?? "").toLowerCase();
    const cat = String(row["categoria"] ?? "").toLowerCase();
    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim();
    const valorRaw = toNumber(row["valor"] ?? row["value"] ?? row["liquido"]) ?? 0;
    const valorBRL = moeda === "USD" ? valorRaw * fxUSD : valorRaw;
    const r = get(ano);

    if (lanc.includes("imposto")) { r.irrfRetido += Math.abs(valorBRL); continue; }
    if (valorBRL <= 0) continue;
    if (lanc.includes("jcp") || lanc.includes("juros")) { r.exclusivaJCP += valorBRL; continue; }
    const ehExterior = moeda === "USD" || cat.includes("internacional") || cat.includes("exterior");
    if (ehExterior) { r.tributavelExterior += valorBRL; continue; }
    if (cat.includes("fii") || lanc.includes("rend")) { r.isentosRendimentoFII += valorBRL; continue; }
    r.isentosDividendosBR += valorBRL; // dividendo de ação BR — isento
  }
  return [...byAno.values()].sort((a, b) => a.ano.localeCompare(b.ano));
}
