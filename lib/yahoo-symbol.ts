/**
 * Conversão canônica: ticker interno → símbolo Yahoo Finance.
 *
 * Extraído de cotacoes.ts para ser client-safe: depende apenas de sectors.ts e
 * asset-meta-cache.ts (ambos sem imports server-only), evitando puxar o
 * `yahoo-finance2` (que não bundla no browser) para componentes client.
 * cotacoes.ts re-exporta `yahooTicker` daqui — continua a FONTE ÚNICA.
 */

import { identificarSetor } from "./sectors";
import { getAssetMeta } from "./asset-meta-cache";

const INTL_SUFFIX_MAP: Record<string, string> = {
  VWRA: "VWRA.L",
  VWCE: "VWCE.DE",
  DPM: "DPM.TO",
  CSPX: "CSPX.L",
  EIMI: "EIMI.L",
  IWDA: "IWDA.L",
  ASML: "ASML.AS",
};

export function yahooTicker(ticker: string, _moeda: string, _corretora: string): string {
  const t = ticker.toUpperCase().trim();
  // Metadata cache (populated from ativos_meta sheet) is the primary source —
  // one Yahoo lookup at import time replaces all hardcoded maps.
  const meta = getAssetMeta(t);
  if (meta?.yahooSymbol) return meta.yahooSymbol;
  if (t.includes(".")) return t;
  const tClean = t.replace(".SA", "").replace(".L", "").replace(".AS", "").replace(".DE", "").replace(".TO", "");
  if (INTL_SUFFIX_MAP[tClean]) return INTL_SUFFIX_MAP[tClean];
  const setor = identificarSetor(t);
  if (setor === "Cripto") {
    if (t.endsWith("-USD")) return t;
    return `${t}-USD`;
  }
  if (["Ações Brasil", "ETF", "FIIs", "BDRs"].includes(setor)) return `${t}.SA`;
  return t;
}
