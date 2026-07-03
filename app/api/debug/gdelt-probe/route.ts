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

const GEO = "https://api.gdeltproject.org/api/v2/geo/geo";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Probe { name: string; url: string; gdelt?: boolean }

const PROBES: Probe[] = [
  // 1. O endpoint GEO está vivo? (query mínima, um termo, sem extras)
  { name: "geo-1-minimo", url: `${GEO}?query=airstrike&format=GeoJSON`, gdelt: true },
  // 2. Forma ANTIGA (OR sem parênteses) — esperamos falha; confirma o bug original
  { name: "geo-2-or-sem-parenteses", url: `${GEO}?query=${encodeURIComponent("protest OR riot")}&format=GeoJSON&mode=PointData&timespan=7d`, gdelt: true },
  // 3. Forma ATUAL de produção (parênteses + mode + timespan + maxpoints)
  { name: "geo-3-atual-producao", url: `${GEO}?query=${encodeURIComponent("(protest OR demonstration OR riot OR unrest OR uprising OR crackdown OR protesters)")}&format=GeoJSON&mode=PointData&timespan=7d&maxpoints=500`, gdelt: true },
  // 4. Atual SEM maxpoints — isola se o maxpoints é o vilão
  { name: "geo-4-sem-maxpoints", url: `${GEO}?query=${encodeURIComponent("(protest OR riot)")}&format=GeoJSON&mode=PointData&timespan=7d`, gdelt: true },
  // 5/6. Fontes de desastres (sem rate-limit)
  { name: "eonet", url: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20&limit=3" },
  { name: "usgs", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson" },
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
        headers: { "User-Agent": "meus-investimentos (diagnostico)" },
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
      leitura: "geo-1 ok + geo-2 falha = parênteses eram o bug; geo-3 falha + geo-4 ok = maxpoints é o vilão; tudo geo falha = endpoint/params errados; eonet/usgs falham = problema nos desastres",
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
