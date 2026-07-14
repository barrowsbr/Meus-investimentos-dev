// Dossiê estendido de UMA moeda da coleção — dois complementos:
// 1. Numista (api.numista.com, NUMISTA_API_KEY opcional): dados duros de
//    catálogo — tiragem, diâmetro/peso/espessura, descrições de anverso/
//    reverso, gravador e link da ficha. Sem a chave, o bloco simplesmente
//    não aparece na UI.
// 2. História por IA (cascata lib/llm, chaves já existentes): parágrafo curto
//    de contexto histórico em PT — instruída a NÃO inventar números.
// Cache: memória do lambda + CDN 7 dias (moeda é dado parado).

import { NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const NUMISTA_BASE = "https://api.numista.com/api/v3";

// Nome PT (coleção) → inglês (busca do Numista funciona melhor em EN).
const PAIS_EN: Record<string, string> = {
  "Brasil": "Brazil", "Alemanha": "Germany", "Hungria": "Hungary", "Rússia": "Russia",
  "Cuba": "Cuba", "Japão": "Japan", "Suíça": "Switzerland", "Canadá": "Canada",
  "Colômbia": "Colombia", "França": "France", "Islândia": "Iceland", "EUA": "United States",
  "Reino Unido": "United Kingdom", "Portugal": "Portugal", "Espanha": "Spain",
  "Itália": "Italy", "Argentina": "Argentina", "México": "Mexico", "China": "China",
};

interface NumistaInfo {
  titulo: string;
  emissor: string | null;
  anos: string | null;
  composicao: string | null;
  pesoG: number | null;
  diametroMm: number | null;
  espessuraMm: number | null;
  anverso: string | null;
  reverso: string | null;
  gravadores: string | null;
  tiragem: number | null;
  url: string | null;
}

interface InfoPayload {
  historia: string | null;
  numista: NumistaInfo | null;
  numistaAtivo: boolean; // chave configurada?
}

// Cache em memória do lambda (o CDN segura o resto via s-maxage).
const cache = new Map<string, { t: number; data: InfoPayload }>();
const TTL = 7 * 24 * 60 * 60 * 1000;

async function numistaGet(path: string, key: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${NUMISTA_BASE}${path}`, {
      headers: { "Numista-API-Key": key },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch { return null; }
}

async function buscarNumista(p: { krause: string; pais: string; ano: string; denominacao: string }): Promise<NumistaInfo | null> {
  const key = process.env.NUMISTA_API_KEY;
  if (!key) return null;

  // Busca: KM# é o identificador mais forte; sem ele, denominação + país + ano.
  const paisEn = PAIS_EN[p.pais] ?? p.pais;
  const q = p.krause
    ? `${p.krause.replace(/\s+/g, "")} ${paisEn}`
    : `${p.denominacao} ${paisEn} ${p.ano}`.trim();
  const busca = await numistaGet(`/types?q=${encodeURIComponent(q)}&count=3&lang=pt&category=coin`, key);
  const tipos = (busca?.["types"] ?? []) as Array<{ id?: number }>;
  const id = tipos[0]?.id;
  if (!id) return null;

  const [det, issues] = await Promise.all([
    numistaGet(`/types/${id}?lang=pt`, key),
    numistaGet(`/types/${id}/issues?lang=pt`, key),
  ]);
  if (!det) return null;

  // Tiragem do ANO da moeda (as "issues" são por ano/variedade).
  let tiragem: number | null = null;
  if (Array.isArray(issues)) {
    const doAno = (issues as Array<{ year?: number; mintage?: number }>).filter(
      (i) => String(i.year ?? "") === p.ano.slice(0, 4) && typeof i.mintage === "number",
    );
    if (doAno.length) tiragem = doAno.reduce((s, i) => s + (i.mintage ?? 0), 0);
  }

  const g = (o: unknown, campo: string): string | null => {
    const v = (o as Record<string, unknown> | null | undefined)?.[campo];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const num = (campo: string): number | null => {
    const v = det[campo];
    return typeof v === "number" && v > 0 ? v : null;
  };
  const engravers = [
    ...(((det["obverse"] as Record<string, unknown>)?.["engravers"] as string[] | undefined) ?? []),
    ...(((det["reverse"] as Record<string, unknown>)?.["engravers"] as string[] | undefined) ?? []),
  ];

  return {
    titulo: g(det, "title") ?? p.denominacao,
    emissor: g(det["issuer"], "name"),
    anos: det["min_year"] ? `${det["min_year"]}${det["max_year"] && det["max_year"] !== det["min_year"] ? `–${det["max_year"]}` : ""}` : null,
    composicao: g(det["composition"], "text"),
    pesoG: num("weight"),
    diametroMm: num("size"),
    espessuraMm: num("thickness"),
    anverso: g(det["obverse"], "description"),
    reverso: g(det["reverse"], "description"),
    gravadores: engravers.length ? [...new Set(engravers)].join(", ") : null,
    tiragem,
    url: typeof det["url"] === "string" ? (det["url"] as string) : `https://pt.numista.com/catalogue/pieces${id}.html`,
  };
}

async function gerarHistoria(p: { pais: string; ano: string; denominacao: string; assunto: string; composicao: string }): Promise<string | null> {
  try {
    const system =
      "Você é um numismata brasileiro experiente. Escreva um parágrafo CURTO (2 a 4 frases, PT-BR) " +
      "de contexto histórico sobre a moeda descrita: o momento do país, o que a série/comemoração representa " +
      "e alguma curiosidade relevante. NÃO invente números precisos (tiragem, valores, dimensões) nem " +
      "afirme raridade — se não tiver certeza de um detalhe, omita. Sem markdown, só o parágrafo.";
    const msg = `Moeda: ${p.denominacao} — ${p.pais}, ${p.ano}.` +
      (p.assunto && p.assunto !== "Séries comuns" ? ` Emissão comemorativa: ${p.assunto}.` : " Série comum de circulação.") +
      (p.composicao ? ` Composição: ${p.composicao}.` : "");
    const { text } = await llmComplete(system, msg);
    const t = text.trim();
    return t.length > 20 ? t : null;
  } catch { return null; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const p = {
    krause: searchParams.get("krause") ?? "",
    pais: searchParams.get("pais") ?? "",
    ano: searchParams.get("ano") ?? "",
    denominacao: searchParams.get("denominacao") ?? "",
    assunto: searchParams.get("assunto") ?? "",
    composicao: searchParams.get("composicao") ?? "",
  };
  if (!p.denominacao || !p.pais) {
    return NextResponse.json({ error: "denominacao e pais obrigatórios" }, { status: 400 });
  }

  const cacheKey = JSON.stringify(p);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < TTL) {
    return NextResponse.json(hit.data, { headers: { "Cache-Control": "s-maxage=604800, stale-while-revalidate=86400" } });
  }

  const [numista, historia] = await Promise.all([buscarNumista(p), gerarHistoria(p)]);
  const payload: InfoPayload = { historia, numista, numistaAtivo: !!process.env.NUMISTA_API_KEY };
  // Só cacheia se algo veio — falha total re-tenta na próxima.
  if (historia || numista) cache.set(cacheKey, { t: Date.now(), data: payload });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "s-maxage=604800, stale-while-revalidate=86400" },
  });
}
