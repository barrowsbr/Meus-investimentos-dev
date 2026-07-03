// ─────────────────────────────────────────────────────────────────────────────
// GDELT Events 2.0 — fonte VIVA de eventos geolocalizados (conflitos/protestos).
//
// A API GEO 2.0 (api.gdeltproject.org/api/v2/geo/geo) foi aposentada: devolve
// 404 para QUALQUER query — inclusive o exemplo indexado pelo Google, via http
// e com User-Agent de navegador (provado pela sonda /api/debug/gdelt-probe).
//
// O pivô: o GDELT publica a cada 15 minutos um CSV bruto de eventos num CDN
// estático (data.gdeltproject.org) — sem API, sem rate-limit, sem key. Cada
// linha tem código CAMEO, coordenadas do local da ação e nº de menções:
//   EventRootCode 14       → protestos
//   EventRootCode 18/19/20 → agressão / combate / violência em massa
// Baixamos os últimos 4 arquivos (janela de ~1h), extraímos o CSV do zip
// (parser de zip de entrada única — sem dependência nova) e agregamos.
// ─────────────────────────────────────────────────────────────────────────────

import { inflateRawSync } from "zlib";

const LASTUPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";

// Colunas do CSV de eventos (GDELT 2.0, 61 colunas, TSV, sem cabeçalho).
const COL_ROOTCODE = 28;   // EventRootCode ("14", "18", ...)
const COL_MENTIONS = 31;   // NumMentions
const COL_GEO_NAME = 52;   // ActionGeo_FullName ("Cidade, Região, País")
const COL_LAT = 56;        // ActionGeo_Lat
const COL_LNG = 57;        // ActionGeo_Long

// Códigos que interessam às camadas do globo (parse único, filtro por tema).
const KEEP_CODES = new Set(["14", "18", "19", "20"]);

export interface GdeltEventPoint {
  code: string;      // EventRootCode
  fullName: string;  // ActionGeo_FullName
  lat: number;
  lng: number;
  mentions: number;
}

const CACHE_MS = 14 * 60_000; // novo arquivo a cada 15 min
let cache: { ts: number; events: GdeltEventPoint[] } | null = null;
let inflight: Promise<GdeltEventPoint[]> | null = null;

// Zip de entrada única (os exports do GDELT têm 1 CSV): localiza o End of
// Central Directory, lê o registro central e infla o payload (deflate raw).
function unzipSingle(buf: Buffer): Buffer {
  let i = buf.length - 22;
  const min = Math.max(0, buf.length - 22 - 65_536);
  while (i >= min && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < min || i < 0) throw new Error("zip: EOCD não encontrado");
  const cdOffset = buf.readUInt32LE(i + 16);
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error("zip: central directory inválido");
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const lfh = buf.readUInt32LE(cdOffset + 42);
  if (buf.readUInt32LE(lfh) !== 0x04034b50) throw new Error("zip: local header inválido");
  const nameLen = buf.readUInt16LE(lfh + 26);
  const extraLen = buf.readUInt16LE(lfh + 28);
  const start = lfh + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compSize);
  return method === 0 ? Buffer.from(data) : inflateRawSync(data);
}

// lastupdate.txt aponta o export mais recente; derivamos os 3 anteriores pelo
// timestamp do nome (arquivos de 15 em 15 min) → janela de ~1 hora.
async function exportUrls(): Promise<string[]> {
  const res = await fetch(LASTUPDATE_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`lastupdate HTTP ${res.status}`);
  const m = (await res.text()).match(/https?:\/\/\S+\.export\.CSV\.zip/);
  if (!m) throw new Error("lastupdate sem URL de export");
  const latest = m[0];
  const urls = [latest];
  const tm = latest.match(/(\d{14})\.export\.CSV\.zip$/);
  if (tm) {
    const t = tm[1];
    const base = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12), +t.slice(12, 14));
    const pad = (n: number) => String(n).padStart(2, "0");
    for (let k = 1; k <= 3; k++) {
      const d = new Date(base - k * 15 * 60_000);
      const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
      urls.push(latest.replace(/\d{14}\.export\.CSV\.zip$/, `${stamp}.export.CSV.zip`));
    }
  }
  return urls;
}

function parseCsv(csv: string, out: GdeltEventPoint[]): void {
  for (const line of csv.split("\n")) {
    const c = line.split("\t");
    if (c.length < 61) continue;
    const code = c[COL_ROOTCODE];
    if (!KEEP_CODES.has(code)) continue;
    const lat = parseFloat(c[COL_LAT]);
    const lng = parseFloat(c[COL_LNG]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const fullName = (c[COL_GEO_NAME] ?? "").trim();
    if (!fullName) continue;
    out.push({ code, fullName, lat, lng, mentions: Number(c[COL_MENTIONS]) || 1 });
  }
}

async function loadAll(): Promise<GdeltEventPoint[]> {
  const urls = await exportUrls();
  const events: GdeltEventPoint[] = [];
  // Sequencial de propósito: CDN estático rápido, e evita pico de memória.
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue; // arquivo do slot pode não existir (feriado do feed)
      const zip = Buffer.from(await res.arrayBuffer());
      parseCsv(unzipSingle(zip).toString("utf8"), events);
    } catch {
      // um arquivo ruim não derruba a janela
    }
  }
  return events;
}

/** Eventos da última ~1h com os EventRootCodes pedidos (cache 14 min). */
export async function fetchGdeltEventPoints(rootCodes: string[]): Promise<GdeltEventPoint[]> {
  if (!cache || Date.now() - cache.ts > CACHE_MS) {
    if (!inflight) {
      inflight = loadAll()
        .then(events => {
          cache = { ts: Date.now(), events };
          return events;
        })
        .finally(() => { inflight = null; });
    }
    await inflight;
  }
  const want = new Set(rootCodes);
  return (cache?.events ?? []).filter(e => want.has(e.code));
}
