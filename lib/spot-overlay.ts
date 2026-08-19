// Overlay do spot de HOJE sobre o grid histórico de preços (decisão do dono
// 19/08: TWR/MWR dinâmicos ao longo do dia). O spot entra como a ÚLTIMA PERNA
// PROVISÓRIA do grid — nada é gravado na golden source (db_cotacoes): o dia só
// vira definitivo quando o cron das 23h UTC grava o fechamento. No dia
// seguinte a perna provisória simplesmente é recalculada a partir do golden.
// Módulo PURO (sem deps server-only) — testado em lib/__tests__.

import type { FxRates } from "./cotacoes";

export interface SpotOverlayArgs {
  /** Grid de datas (mutado in-place se a linha de hoje precisar nascer). */
  dates: string[];
  /** Matriz de preços por ticker ORIGINAL, alinhada a `dates` (mutada). */
  prices: Record<string, (number | null)[]>;
  /** FX por data (mutado — a linha de hoje herda a última e recebe o spot). */
  fxHistory: Record<string, FxRates>;
  /** Séries extras alinhadas a `dates`, chaveadas pelo ticker YAHOO
   *  (índices/benchmarks: ^BVSP, ^GSPC, ^SP500TR, ^NDX, …). Mutadas. */
  extras: Record<string, (number | null)[]>;
  /** YYYY-MM-DD de hoje no fuso de referência (America/Sao_Paulo). */
  hoje: string;
  /** Spot por ticker YAHOO (regularMarketPrice > 0). */
  spots: Record<string, number>;
  /** Mapa ticker Yahoo → ticker original (coluna de `prices`). */
  yahooToOrig: Record<string, string>;
}

export interface SpotOverlayResult {
  aplicado: boolean;   // algum preço/FX de hoje foi sobreposto
  novaLinha: boolean;  // a linha de hoje não existia e foi criada
  precosAplicados: number;
}

const FX_SPOT_KEYS: Array<[string, keyof FxRates]> = [
  ["BRL=X", "USDBRL"], ["EURBRL=X", "EURBRL"], ["CADBRL=X", "CADBRL"], ["GBPBRL=X", "GBPBRL"],
];

const ehFimDeSemana = (ymd: string): boolean => {
  const dow = new Date(ymd + "T12:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
};

export function aplicarSpotHoje(args: SpotOverlayArgs): SpotOverlayResult {
  const { dates, prices, fxHistory, extras, hoje, spots, yahooToOrig } = args;
  const nada: SpotOverlayResult = { aplicado: false, novaLinha: false, precosAplicados: 0 };

  // Fim de semana não cria linha — o grid é de dias úteis.
  if (dates.length === 0 || ehFimDeSemana(hoje)) return nada;
  const ultima = dates[dates.length - 1];
  if (ultima > hoje) return nada; // grid já vai além (não deveria acontecer)

  let novaLinha = false;
  if (ultima < hoje) {
    // A linha de hoje ainda não existe (golden parou em D-1 e nenhuma fonte
    // criou a data) — nasce herdando null nos preços e o FX de ontem.
    dates.push(hoje);
    for (const arr of Object.values(prices)) arr.push(null);
    for (const arr of Object.values(extras)) arr.push(null);
    fxHistory[hoje] = { ...fxHistory[ultima] };
    novaLinha = true;
  }

  const idx = dates.length - 1;
  let precosAplicados = 0;

  for (const [yahoo, spot] of Object.entries(spots)) {
    if (!(spot > 0)) continue;
    // Um ticker pode ser posição E benchmark ao mesmo tempo (ex.: BTC-USD).
    const orig = yahooToOrig[yahoo];
    let usado = false;
    if (orig && prices[orig]) { prices[orig][idx] = spot; usado = true; }
    if (extras[yahoo]) { extras[yahoo][idx] = spot; usado = true; }
    if (usado) precosAplicados++;
  }

  let fxAplicado = false;
  for (const [yahoo, key] of FX_SPOT_KEYS) {
    const spot = spots[yahoo];
    if (spot > 0 && fxHistory[hoje]) { fxHistory[hoje][key] = spot; fxAplicado = true; }
  }

  const aplicado = precosAplicados > 0 || fxAplicado;
  // Linha criada só para nada (sem nenhum spot) seria um dia fantasma de
  // retorno zero — remove para deixar o grid como estava.
  if (novaLinha && !aplicado) {
    dates.pop();
    for (const arr of Object.values(prices)) arr.pop();
    for (const arr of Object.values(extras)) arr.pop();
    delete fxHistory[hoje];
    return nada;
  }

  return { aplicado, novaLinha: novaLinha && aplicado, precosAplicados };
}

/** YYYY-MM-DD de "agora" no fuso de São Paulo (dia de pregão de referência). */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}
