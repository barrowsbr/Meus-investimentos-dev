// Foto real do veículo — proxy server-side do Wikimedia Commons (imagens com
// licença livre). Busca pelos termos configurados em lib/bens.ts, filtra
// ângulos/partes ruins (interior, traseira, motor...) e devolve o JPEG com
// cache CDN de 30 dias. Fallback: silhueta SVG elegante. ⚠️ Em dev a network
// policy bloqueia o host — funciona em produção.

import { NextRequest } from "next/server";
import { acharBem } from "@/lib/bens-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const RUIM = ["interior", "innenraum", "rear", "heck", "back", "engine", "motor", "dashboard", "cockpit", "trunk", "kofferraum", "wheel", "seat", "logo", "badge", "emblem", "detail"];

interface Pagina { title?: string; imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string }> }

// Título sem espaços/hífens/acentos: "T-Cross"≈"T Cross"≈"TCross".
const strip = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

// Busca um termo e devolve o MELHOR candidato: o título PRECISA conter todos os
// `requer` (senão era isso que trazia carro errado) e ganha pontos por `bonus`.
async function buscarFoto(termo: string, requer: string[], bonus: string[]): Promise<string | null> {
  const url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    `&generator=search&gsrsearch=${encodeURIComponent(termo)}&gsrlimit=30&gsrnamespace=6` +
    "&prop=imageinfo&iiprop=url|mime&iiurlwidth=1100";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { "User-Agent": "meus-investimentos/1.0 (pessoal)" } });
    if (!r.ok) return null;
    const data = (await r.json()) as { query?: { pages?: Record<string, Pagina> } };
    const paginas = Object.values(data.query?.pages ?? {});
    const boas = paginas
      .filter((p) => {
        const t = (p.title ?? "").toLowerCase();
        const ts = strip(t);
        const info = p.imageinfo?.[0];
        if (!info?.thumburl) return false;
        if (!/^image\/(jpeg|png)$/.test(info.mime ?? "")) return false;
        if (RUIM.some((w) => t.includes(w))) return false;
        return requer.every((req) => ts.includes(strip(req)));
      })
      .map((p) => {
        const ts = strip(p.title ?? "");
        return { p, score: bonus.filter((b) => ts.includes(strip(b))).length };
      })
      .sort((a, b) => b.score - a.score);
    return boas[0]?.p.imageinfo?.[0]?.thumburl ?? null;
  } catch { return null; }
}

const FALLBACK_SVG = (nome: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 250">
  <rect width="440" height="250" fill="#0d1114"/>
  <g stroke="#3d464d" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M70 165 h18 c8-26 26-42 54-46 l36-5 c30-3 52 8 74 24 l30 22 h48 c14 0 22 6 22 18 v12 h-26"/>
    <path d="M70 165 v-14 c0-10 6-16 16-16 h10"/>
    <circle cx="150" cy="182" r="24"/><circle cx="150" cy="182" r="9"/>
    <circle cx="316" cy="182" r="24"/><circle cx="316" cy="182" r="9"/>
    <path d="M174 182 h118"/><path d="M186 138 l60-18 44 32"/>
  </g>
  <text x="220" y="228" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="13" fill="#5c6870">${nome}</text>
</svg>`;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const bem = await acharBem(id).catch(() => undefined);
  const fallback = () => new Response(FALLBACK_SVG(bem?.nome ?? "veículo"), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, s-maxage=3600" },
  });
  if (!bem) return fallback();

  for (const termo of bem.fotoBusca) {
    const foto = await buscarFoto(termo, bem.fotoRequer, bem.fotoBonus);
    if (!foto) continue;
    try {
      const r = await fetch(foto, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "meus-investimentos/1.0 (pessoal)" } });
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      return new Response(buf, {
        headers: {
          "Content-Type": r.headers.get("content-type") ?? "image/jpeg",
          "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=2592000",
        },
      });
    } catch { /* tenta o próximo termo */ }
  }
  return fallback();
}
