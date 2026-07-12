// Fallback CIRÚRGICO de cotação via Alpha Vantage (GLOBAL_QUOTE) — usado só
// quando brapi E Yahoo (yf2 + v8) falharam para um ticker específico.
//
// Segurança (o free tier é 25 req/DIA, 5/min — jamais pode virar primário):
//   • no máx. 2 tickers por chamada de fetchCotacoes;
//   • teto de 6 requests por processo (lambda) — worst case fica longe dos 25/dia;
//   • cache de 10 min por ticker (inclusive resultado negativo — não martela);
//   • resposta com "Note"/"Information" (rate limit) desliga a fonte por 1h;
//   • índices (^...), FX (=X) e cripto (-USD) nunca vão pra AV (não cobre bem).
// Gated em ALPHAVANTAGE_API_KEY: sem chave → no-op.

import type { Quote } from "./cotacoes";

const MAX_POR_CHAMADA = 2;
const MAX_POR_PROCESSO = 6;
const CACHE_TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 60 * 1000;

let usados = 0;
let cooldownAte = 0;
const cache = new Map<string, { q: Quote | null; ts: number }>();

// Grafia Yahoo → sufixo de bolsa da Alpha Vantage.
function toAvSymbol(t: string): string | null {
  const up = t.toUpperCase().trim();
  if (up.startsWith("^") || up.endsWith("=X") || up.endsWith("-USD")) return null;
  if (up.endsWith(".SA")) return `${up.slice(0, -3)}.SAO`;
  if (up.endsWith(".TO")) return `${up.slice(0, -3)}.TRT`;
  if (up.endsWith(".DE")) return `${up.slice(0, -3)}.DEX`;
  if (up.endsWith(".L")) return `${up.slice(0, -2)}.LON`;
  if (up.includes(".")) return null; // sufixo que não sabemos mapear — não arrisca
  return up; // EUA sem sufixo
}

function moedaDe(t: string): string {
  const up = t.toUpperCase();
  if (up.endsWith(".SA")) return "BRL";
  if (up.endsWith(".TO")) return "CAD";
  if (up.endsWith(".DE")) return "EUR";
  if (up.endsWith(".L")) return "GBP";
  return "USD";
}

async function fetchUm(ticker: string, key: string): Promise<Quote | null> {
  const sym = toAvSymbol(ticker);
  if (!sym) return null;
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&apikey=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.Note || json?.Information) {
    // Rate limit / cota do dia — desliga a fonte por 1h neste processo.
    cooldownAte = Date.now() + COOLDOWN_MS;
    return null;
  }
  const g = json?.["Global Quote"];
  const price = parseFloat(g?.["05. price"] ?? "");
  if (!Number.isFinite(price) || price <= 0) return null;
  const change = parseFloat(g?.["09. change"] ?? "0") || 0;
  const changePercent = parseFloat(String(g?.["10. change percent"] ?? "0").replace("%", "")) || 0;
  return { price, change, changePercent, currency: moedaDe(ticker), name: ticker };
}

/** Cotações AV para tickers que TODAS as fontes primárias perderam. */
export async function fetchQuotesAlphaVantage(tickers: string[]): Promise<Record<string, Quote>> {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  const out: Record<string, Quote> = {};
  if (!key || tickers.length === 0) return out;

  const agora = Date.now();
  const pendentes: string[] = [];
  for (const t of tickers) {
    const hit = cache.get(t);
    if (hit && agora - hit.ts < CACHE_TTL_MS) {
      if (hit.q) out[t] = hit.q;
      continue;
    }
    pendentes.push(t);
  }
  if (agora < cooldownAte || usados >= MAX_POR_PROCESSO) return out;

  const lote = pendentes.filter((t) => toAvSymbol(t) !== null).slice(0, Math.min(MAX_POR_CHAMADA, MAX_POR_PROCESSO - usados));
  if (lote.length === 0) return out;
  usados += lote.length;

  const results = await Promise.allSettled(lote.map(async (t) => ({ t, q: await fetchUm(t, key) })));
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    cache.set(r.value.t, { q: r.value.q, ts: agora }); // negativo também entra no cache
    if (r.value.q) out[r.value.t] = r.value.q;
  }
  return out;
}
