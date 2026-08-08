// Histórico FIPE de um veículo — ATÉ O LIMITE DOS DADOS (desde que o
// ano-modelo entrou na tabela), para o card e o popup da página Bens.
// Usa a API v2 do parallelum: /references lista TODAS as tabelas mensais
// (desde 2001); o valor é consultado por CÓDIGO FIPE (imune a grafia).
//
// Estratégia para não fazer ~300 chamadas: a presença do ano-modelo na tabela
// é MONOTÔNICA (entra num mês e nunca mais sai) — busca binária acha a
// referência mais antiga com dado em ~9 consultas; o miolo vem em lotes.
//
// ⚠️ Lições da 1ª versão (o gráfico "não carregava"):
//   • A parallelum gratuita TEM rate limit — 429 tratado como "sem dado"
//     quebrava a monotonicidade e zerava a resposta. Agora 404 = sem dado
//     (definitivo); 429/5xx/rede = TRANSITÓRIO (retry com backoff; persistindo,
//     falha explícita — nunca vira "o modelo não existia nesse mês").
//   • Resposta vazia era cacheada 1h no CDN → parecia quebrado para sempre.
//     Agora corrida com falha usa cache CURTO (5 min); só sucesso limpo ganha
//     cache de 1 dia.
//   • Lotes de 6 sem pausa = rajada. Agora lote 3 com 150 ms entre lotes, e
//     um ORÇAMENTO de tempo (40 s) devolve PARCIAL em vez de estourar os 60 s.
// Cache de dados de 12h por consulta individual — re-execuções custam ~zero.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_V2 = "https://parallelum.com.br/fipe/api/v2";
const LOTE = 3;               // consultas simultâneas no preenchimento
const PAUSA_LOTE_MS = 150;    // respiro entre lotes (rate limit da API grátis)
const ORCAMENTO_MS = 40_000;  // acima disso devolve parcial (função tem 60s)

type Busca<T> = { status: "ok"; data: T } | { status: "ausente" } | { status: "falha" };

async function buscar<T>(url: string): Promise<Busca<T>> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000), next: { revalidate: 43200 } });
      if (r.ok) return { status: "ok", data: (await r.json()) as T };
      // 404/400 = o ano-modelo não existe nessa referência (definitivo).
      if (r.status === 404 || r.status === 400) return { status: "ausente" };
      // 429/5xx = transitório → backoff e tenta de novo.
    } catch { /* rede/timeout → transitório */ }
    await new Promise((res) => setTimeout(res, 350 * (tentativa + 1)));
  }
  return { status: "falha" };
}

const parseValor = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

interface Ref { code: string; month: string }
interface Ponto { mes: string; valor: string; valorNum: number }

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const semTempo = () => Date.now() - t0 > ORCAMENTO_MS;

  const sp = req.nextUrl.searchParams;
  const codigo = sp.get("codigo") ?? "";
  const ano = Number(sp.get("ano")) || 0;
  // ?meses=N limita a janela; ausente/0 = tudo que a FIPE tiver.
  const meses = Math.max(0, Number(sp.get("meses")) || 0);
  if (!/^\d{6}-\d$/.test(codigo) || !ano) {
    return NextResponse.json({ error: "codigo/ano inválidos" }, { status: 400 });
  }

  const cacheCurto = { "Cache-Control": "public, s-maxage=300" };            // teve falha → tenta de novo logo
  const cacheLongo = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" };

  const refsBusca = await buscar<Ref[]>(`${BASE_V2}/references`);
  if (refsBusca.status !== "ok" || refsBusca.data.length === 0) {
    return NextResponse.json({ pontos: [], ok: false }, { headers: cacheCurto });
  }
  const refs = refsBusca.data; // mais recente primeiro
  const universo = meses > 0 ? refs.slice(0, meses) : refs;

  // Sufixo de combustível descoberto na referência mais recente e reusado.
  let sufixo: string | null = null;
  let houveFalha = false;
  const cachePonto = new Map<string, Ponto | null>();
  async function consultar(ref: Ref): Promise<Ponto | null> {
    if (cachePonto.has(ref.code)) return cachePonto.get(ref.code)!;
    const sufixos: string[] = sufixo ? [sufixo] : ["1", "3"];
    let ponto: Ponto | null = null;
    for (const suf of sufixos) {
      const b = await buscar<{ price?: string }>(
        `${BASE_V2}/cars/${encodeURIComponent(codigo)}/years/${ano}-${suf}?reference=${ref.code}`,
      );
      if (b.status === "falha") { houveFalha = true; continue; }
      if (b.status === "ausente") continue;
      const num = parseValor(b.data.price);
      if (num != null) {
        sufixo = suf;
        ponto = { mes: ref.month, valor: b.data.price!, valorNum: num };
        break;
      }
    }
    cachePonto.set(ref.code, ponto);
    return ponto;
  }

  // Sem dado na referência mais recente → nada a mostrar (ou falha → retry já).
  if (!(await consultar(universo[0]))) {
    return NextResponse.json({ pontos: [], ok: false }, { headers: houveFalha ? cacheCurto : { "Cache-Control": "public, s-maxage=3600" } });
  }

  // Busca binária pelo ÍNDICE MAIS ANTIGO com dado. lo sempre TEM dado.
  // Falha transitória no meio interrompe a busca de forma CONSERVADORA
  // (fica com o lo já confirmado — devolve menos história, nunca errada).
  let lo = 0;
  let hi = universo.length - 1;
  if (await consultar(universo[hi])) {
    lo = hi;
  } else if (!houveFalha) {
    while (hi - lo > 1 && !semTempo()) {
      const mid = (lo + hi) >> 1;
      if (await consultar(universo[mid])) lo = mid;
      else { if (houveFalha) break; hi = mid; }
    }
  }

  // Preenche o miolo [0..lo] em lotes pequenos com pausa (rate limit) e
  // orçamento de tempo — melhor histórico parcial que 504.
  const alvos = universo.slice(0, lo + 1);
  for (let i = 0; i < alvos.length && !semTempo(); i += LOTE) {
    await Promise.all(alvos.slice(i, i + LOTE).map((r) => consultar(r)));
    if (i + LOTE < alvos.length) await new Promise((res) => setTimeout(res, PAUSA_LOTE_MS));
  }

  const pontos = alvos
    .map((r) => cachePonto.get(r.code))
    .filter((p): p is Ponto => p != null)
    .reverse(); // cronológico (antigo → recente) para o gráfico

  const completo = !houveFalha && !semTempo();
  return NextResponse.json(
    { pontos, ok: pontos.length > 0, completo },
    { headers: completo ? cacheLongo : cacheCurto },
  );
}
