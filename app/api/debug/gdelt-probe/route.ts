import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Sonda de diagnóstico das fontes do globo (GDELT GEO + EONET + USGS).
// O sandbox de desenvolvimento não alcança esses hosts, então esta rota testa
// as variantes de URL A PARTIR DO SERVIDOR (Vercel) e devolve o status cru de
// cada uma — isola se o problema é: OR sem parênteses, maxpoints, timespan,
// o endpoint em si, ou as fontes de desastres.
// As chamadas ao GDELT respeitam o limite de 1 req/5s (gap serializado).
// ─────────────────────────────────────────────────────────────────────────────

const GEO_HTTPS = "https://api.gdeltproject.org/api/v2/geo/geo";
const GEO_HTTP = "http://api.gdeltproject.org/api/v2/geo/geo";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface Probe { name: string; url: string; gdelt?: boolean; ua?: string }

// Rodada 1 provou: TODAS as URLs https com nossos params dão 404 (até a mínima),
// mas EONET/USGS funcionam. Rodada 2 isola: protocolo (http×https), formato do
// timespan (minutos — GEO cobre no máx. 24h, não aceita "7d"), o exemplo exato
// indexado pelo Google (mode=country&format=html) e bloqueio por User-Agent.
const PROBES: Probe[] = [
  // 1. Exemplo indexado pelo Google — se ESTE 404ar, o problema é IP/UA, não params
  { name: "geo-1-exemplo-indexado", url: `${GEO_HTTPS}?query=theme:env_nuclearpower&mode=country&format=html`, gdelt: true },
  // 2. Mínima + timespan em MINUTOS (1440 = 24h, formato correto do GEO)
  { name: "geo-2-minutos-https", url: `${GEO_HTTPS}?query=airstrike&format=GeoJSON&mode=PointData&timespan=1440`, gdelt: true },
  // 3. Igual à 2, via HTTP puro — isola o vhost https
  { name: "geo-3-minutos-http", url: `${GEO_HTTP}?query=airstrike&format=GeoJSON&mode=PointData&timespan=1440`, gdelt: true },
  // 4. Igual à 2, com User-Agent de navegador — isola bloqueio por UA
  { name: "geo-4-ua-navegador", url: `${GEO_HTTPS}?query=airstrike&format=GeoJSON&mode=PointData&timespan=1440`, gdelt: true, ua: BROWSER_UA },
  // 5. Query real de protestos no formato candidato (parênteses + minutos)
  { name: "geo-5-protestos-candidata", url: `${GEO_HTTPS}?query=${encodeURIComponent("(protest OR riot OR unrest)")}&format=GeoJSON&mode=PointData&timespan=1440&maxpoints=250`, gdelt: true },
];

interface ProbeResult {
  name: string;
  status: number | string;
  ok: boolean;
  isJson: boolean;
  features?: number;
  events?: number;
  snippet: string;
  url: string;
}

export async function GET() {
  const results: ProbeResult[] = [];

  for (const p of PROBES) {
    if (p.gdelt && results.some((r) => r.name.startsWith("geo"))) {
      await sleep(5200); // 1 req/5s do GDELT
    }
    try {
      const res = await fetch(p.url, {
        headers: { "User-Agent": p.ua ?? "meus-investimentos (diagnostico)" },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const text = await res.text();
      let isJson = false;
      let features: number | undefined;
      let events: number | undefined;
      try {
        const j = JSON.parse(text);
        isJson = true;
        if (Array.isArray(j?.features)) features = j.features.length;
        if (Array.isArray(j?.events)) events = j.events.length;
      } catch { /* não é JSON — snippet mostra o que veio */ }
      results.push({
        name: p.name,
        status: res.status,
        ok: res.ok,
        isJson,
        features,
        events,
        snippet: text.slice(0, 180).replace(/\s+/g, " "),
        url: p.url,
      });
    } catch (e) {
      results.push({
        name: p.name,
        status: "erro",
        ok: false,
        isJson: false,
        snippet: e instanceof Error ? e.message : "erro",
        url: p.url,
      });
    }
  }

  return NextResponse.json(
    {
      leitura: "geo-2 ok = timespan em minutos resolve · geo-3 ok e geo-2 falha = GEO é http-only · geo-4 ok e geo-2 falha = bloqueio por User-Agent · geo-1 falha também = bloqueio de IP/algo além de params · tudo falha = GEO aposentado (pivotar fonte)",
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
