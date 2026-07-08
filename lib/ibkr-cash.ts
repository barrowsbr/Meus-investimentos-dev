/**
 * Caixa automático da IBKR — FONTE ÚNICA para o motor canônico considerar o
 * saldo em conta (dólar/euro parado após venda, dividendo ainda não
 * reinvestido, etc.), sem depender do usuário abrir a página Caixa & Margem
 * primeiro (aquela página só sincroniza a linha na planilha quando é aberta —
 * o canônico não pode ficar refém disso).
 *
 * Usado por TODA rota que hoje faz `store.fetchTab("fixa_aberta")` antes de
 * calcularSnapshot/calcularRendaFixaPosicoes — trocar pela função abaixo
 * (fetchFixaAbertaComIbkr) garante que patrimônio total, exposição cambial,
 * setores, TWR, DIRPF, digest etc. batam com o mesmo caixa que a Home mostra.
 */

import type { Row, DataStore } from "./data-store";
import { getFlexXmlCached, parseFlexXml } from "./ibkr-flex";
import { activeUserKey } from "./user-sheet";

export interface IbkrCashByCurrency { moeda: string; saldo: number }

/** Saldo em caixa por moeda, direto do extrato Flex (cache de 30min via getFlexXmlCached).
 *  Best-effort: IBKR fora do ar ou não configurada NUNCA derruba o canônico. */
export async function loadIbkrCashBalances(): Promise<IbkrCashByCurrency[]> {
  // Conta extra (esposa) tem planilha própria — o token Flex é do dono, então
  // o caixa da IBKR não pode vazar para o canônico de outra conta.
  if (activeUserKey()) return [];

  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) return [];

  try {
    const xml = await getFlexXmlCached(token, queryId);
    const { cashBalances } = parseFlexXml(xml);
    const map = new Map<string, number>();
    for (const c of cashBalances) map.set(c.moeda, (map.get(c.moeda) ?? 0) + c.saldo);
    return [...map.entries()].map(([moeda, saldo]) => ({ moeda, saldo }));
  } catch {
    return [];
  }
}

const CASH_TICKER_RE = /^(CAIXA|SALDO|CASH|RESERVA|DISPONIVEL)/;

/**
 * Mescla o caixa automático da IBKR nas linhas de fixa_aberta — PURA, sem I/O.
 * Mesma regra de /api/renda-fixa/caixa (que já mantém essas linhas em sync
 * sempre que a página é aberta): uma linha de caixa existente para a mesma
 * moeda tem o valor SOBRESCRITO pelo saldo ao vivo; sem linha existente, cria
 * uma sintética só em memória (nunca escreve na planilha) — assim o canônico
 * não fica refém do usuário ter aberto a página Caixa & Margem antes.
 */
export function mergeIbkrCashIntoFixaAberta(fixaAberta: Row[], ibkrCash: IbkrCashByCurrency[]): Row[] {
  if (ibkrCash.length === 0) return fixaAberta;
  const merged = fixaAberta.map((r) => ({ ...r }));
  for (const { moeda, saldo } of ibkrCash) {
    if (saldo <= 0) continue;
    const moedaUp = moeda.toUpperCase().trim();
    const idx = merged.findIndex((r) => {
      const ticker = String(r["ticker"] ?? r["ativo"] ?? "").toUpperCase().trim();
      const rowMoeda = String(r["moeda"] ?? "BRL").toUpperCase().trim();
      return CASH_TICKER_RE.test(ticker) && rowMoeda === moedaUp;
    });
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], atual: saldo };
    } else {
      merged.push({ ticker: `Caixa ${moedaUp} (IBKR)`, atual: saldo, moeda: moedaUp, tipo: "Caixa", corretora: "IBKR" });
    }
  }
  return merged;
}

/** Substituto canônico de `store.fetchTab("fixa_aberta")` — mesmas linhas + caixa IBKR mesclado. */
export async function fetchFixaAbertaComIbkr(store: DataStore): Promise<Row[]> {
  const [rows, ibkrCash] = await Promise.all([
    store.fetchTab("fixa_aberta"),
    loadIbkrCashBalances(),
  ]);
  return mergeIbkrCashIntoFixaAberta(rows, ibkrCash);
}
