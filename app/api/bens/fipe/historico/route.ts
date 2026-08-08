// Histórico FIPE de um veículo (últimos meses de referência) — para o popup de
// detalhes da página Bens. Usa a API v2 do parallelum: /references lista os
// meses da tabela; o valor é consultado mês a mês por CÓDIGO FIPE (imune a
// grafia de nome). Cache CDN 1 dia. ⚠️ Rede aberta só em produção.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const BASE_V2 = "https://parallelum.com.br/fipe/api/v2";
// Até 13 pontos (12 variações mensais) — o card usa 12; o popup fatia 6/12.
const MESES_DEFAULT = 12;
const MESES_MAX = 13;

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

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const codigo = sp.get("codigo") ?? "";
  const ano = Number(sp.get("ano")) || 0;
  const meses = Math.min(MESES_MAX, Math.max(2, Number(sp.get("meses")) || MESES_DEFAULT));
  if (!/^\d{6}-\d$/.test(codigo) || !ano) {
    return NextResponse.json({ error: "codigo/ano inválidos" }, { status: 400 });
  }

  const refs = await j<Array<{ code: string; month: string }>>(`${BASE_V2}/references`);
  if (!refs?.length) {
    return NextResponse.json({ pontos: [], ok: false }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  }

  // Descobre o sufixo de combustível que funciona no mês mais recente e o
  // reusa nos demais (economiza chamadas).
  let sufixo: string | null = null;
  const pontos: Array<{ mes: string; valor: string; valorNum: number }> = [];
  for (const ref of refs.slice(0, meses)) {
    const sufixos: string[] = sufixo ? [sufixo] : ["1", "3"];
    for (const suf of sufixos) {
      const val = await j<{ price?: string; referenceMonth?: string }>(
        `${BASE_V2}/cars/${encodeURIComponent(codigo)}/years/${ano}-${suf}?reference=${ref.code}`,
      );
      const num = parseValor(val?.price);
      if (val && num != null) {
        sufixo = suf;
        pontos.push({ mes: ref.month, valor: val.price!, valorNum: num });
        break;
      }
    }
  }

  pontos.reverse();   // cronológico (antigo → recente) para o gráfico
  return NextResponse.json(
    { pontos, ok: pontos.length > 0 },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" } },
  );
}
