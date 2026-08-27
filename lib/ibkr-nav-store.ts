// Persistência e montagem do TWR oficial IBKR (NAV diário) — SERVER-ONLY.
// A aba `ibkr_nav` acumula o NAV além da janela de 365 dias do Flex: o Flex é
// autoritativo na SUA janela; datas anteriores vêm da planilha (gravadas em
// rodadas passadas). Escrita é append-only com dedup por data (best-effort:
// sem service account ou em modo demo, simplesmente não grava).

import { getDataStore } from "./data-store";
import { ensureTab, appendRowsTyped } from "./gsheets";
import { toNumber } from "./format";
import { mesclarNav, anexarFluxos, calcularTwrNav, type NavPonto, type TwrNavResult } from "./ibkr-nav";
import type { FlexParsed } from "./ibkr-flex";

const TAB = "ibkr_nav";
const HEADERS = ["data", "nav_usd", "fluxo_usd"];

export async function lerNavPlanilha(): Promise<NavPonto[]> {
  try {
    const rows = await getDataStore().fetchTab(TAB);
    return rows
      .map((r) => ({
        date: String(r["data"] ?? "").slice(0, 10),
        nav: toNumber(r["nav_usd"]) ?? 0,
        fluxo: toNumber(r["fluxo_usd"]) ?? 0,
      }))
      .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.nav > 0);
  } catch {
    return []; // aba ainda não existe
  }
}

/** Grava na aba os pontos do Flex que ainda não estão lá (dedup por data). */
export async function persistirNavIbkr(flexPontos: NavPonto[]): Promise<number> {
  if (flexPontos.length === 0) return 0;
  const existentes = new Set((await lerNavPlanilha()).map((p) => p.date));
  const novos = flexPontos.filter((p) => !existentes.has(p.date));
  if (novos.length === 0) return 0;
  await ensureTab(TAB, HEADERS);
  await appendRowsTyped(TAB, novos.map((p) => [p.date, p.nav, p.fluxo]));
  return novos.length;
}

export interface TwrIbkrMontado extends TwrNavResult {
  fontes: { planilha: number; flex: number };
  /** TWR oficial do PERÍODO da query, direto da seção Change in NAV (quando
   *  o campo está habilitado) — o número exato que a IBKR mostra. */
  oficialPeriodo: number | null;
  semSecaoNav: boolean;
}

/** Monta a série completa: planilha (passado) + Flex (janela atual, vence). */
export function montarTwrIbkr(parsed: Pick<FlexParsed, "navDiario" | "fluxosExternos" | "changeInNav">, planilha: NavPonto[]): TwrIbkrMontado {
  const flexPontos = anexarFluxos(parsed.navDiario, parsed.fluxosExternos);
  const janelaIni = flexPontos[0]?.date ?? "";
  // Fora da janela do Flex, a planilha manda (inclui o fluxo gravado na época).
  const antigos = janelaIni ? planilha.filter((p) => p.date < janelaIni) : planilha;
  const pontos = mesclarNav(antigos, flexPontos);
  const r = calcularTwrNav(pontos);
  return {
    ...r,
    fontes: { planilha: antigos.length, flex: flexPontos.length },
    oficialPeriodo: parsed.changeInNav?.twr != null ? parsed.changeInNav.twr / 100 : null,
    semSecaoNav: parsed.navDiario.length === 0,
  };
}
