// Histórico FIPE de um veículo — ATÉ O LIMITE DOS DADOS (desde que o
// ano-modelo entrou na tabela), para o card e o popup da página Bens.
// Usa a API v2 do parallelum: /references lista TODAS as tabelas mensais
// (desde 2001); o valor é consultado por CÓDIGO FIPE (imune a grafia).
//
// Estratégia para não fazer ~300 chamadas: a presença do ano-modelo na tabela
// é MONOTÔNICA (entra num mês e nunca mais sai) — busca binária acha a
// referência mais antiga com dado em ~9 consultas; o miolo vem em lotes
// paralelos de 6. Cada consulta individual tem cache de dados de 12h, então
// re-execuções são quase gratuitas. Cache CDN 1 dia. ⚠️ Rede aberta só em prod.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_V2 = "https://parallelum.com.br/fipe/api/v2";
const LOTE = 6; // consultas simultâneas no preenchimento do miolo

async function j<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 43200 } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

const parseValor = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

interface Ref { code: string; month: string }
interface Ponto { mes: string; valor: string; valorNum: number }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const codigo = sp.get("codigo") ?? "";
  const ano = Number(sp.get("ano")) || 0;
  // ?meses=N limita a janela; ausente/0 = tudo que a FIPE tiver.
  const meses = Math.max(0, Number(sp.get("meses")) || 0);
  if (!/^\d{6}-\d$/.test(codigo) || !ano) {
    return NextResponse.json({ error: "codigo/ano inválidos" }, { status: 400 });
  }

  const refs = await j<Ref[]>(`${BASE_V2}/references`); // mais recente primeiro
  if (!refs?.length) {
    return NextResponse.json({ pontos: [], ok: false }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  }
  const universo = meses > 0 ? refs.slice(0, meses) : refs;

  // Sufixo de combustível descoberto na referência mais recente e reusado.
  let sufixo: string | null = null;
  const cachePonto = new Map<string, Ponto | null>();
  async function consultar(ref: Ref): Promise<Ponto | null> {
    if (cachePonto.has(ref.code)) return cachePonto.get(ref.code)!;
    const sufixos: string[] = sufixo ? [sufixo] : ["1", "3"];
    let ponto: Ponto | null = null;
    for (const suf of sufixos) {
      const val = await j<{ price?: string }>(
        `${BASE_V2}/cars/${encodeURIComponent(codigo)}/years/${ano}-${suf}?reference=${ref.code}`,
      );
      const num = parseValor(val?.price);
      if (val && num != null) {
        sufixo = suf;
        ponto = { mes: ref.month, valor: val.price!, valorNum: num };
        break;
      }
    }
    cachePonto.set(ref.code, ponto);
    return ponto;
  }

  // Sem dado na referência mais recente → nada a mostrar.
  if (!(await consultar(universo[0]))) {
    return NextResponse.json({ pontos: [], ok: false }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  }

  // Busca binária pelo ÍNDICE MAIS ANTIGO com dado (monotônico: o ano-modelo
  // entra na tabela num mês e permanece). lo sempre TEM dado; hi+1 não teria.
  let lo = 0;
  let hi = universo.length - 1;
  if (await consultar(universo[hi])) {
    lo = hi; // já tinha dado na referência mais antiga do universo
  } else {
    // invariante: universo[lo] tem dado, universo[hi] não tem
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (await consultar(universo[mid])) lo = mid;
      else hi = mid;
    }
  }

  // Preenche o miolo [0..lo] em lotes paralelos (respeita a API gratuita).
  const alvos = universo.slice(0, lo + 1);
  for (let i = 0; i < alvos.length; i += LOTE) {
    await Promise.all(alvos.slice(i, i + LOTE).map((r) => consultar(r)));
  }

  const pontos = alvos
    .map((r) => cachePonto.get(r.code))
    .filter((p): p is Ponto => p != null)
    .reverse(); // cronológico (antigo → recente) para o gráfico

  return NextResponse.json(
    { pontos, ok: pontos.length > 0 },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" } },
  );
}
