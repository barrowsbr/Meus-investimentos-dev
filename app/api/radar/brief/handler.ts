import { NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";
import { cacheGet, cacheSet } from "@/lib/radar/disk-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// ─────────────────────────────────────────────────────────────────────────────
// AI Brief — leitura geoeconômica de um país via Gemini/LLM.
// Gera um parágrafo contextualizado (3-4 frases) com tom analítico,
// citando fontes quando possível. Cacheado 12h em disco.
// ─────────────────────────────────────────────────────────────────────────────

interface BriefResult {
  country: string;
  brief: string;
  model: string;
  cachedAt: string;
}

const CACHE_TTL = 12 * 60 * 60 * 1000;

const SYSTEM = `Você é um analista geoeconômico sênior. Seu papel é produzir uma leitura concisa do cenário atual de um país, cobrindo:
- Situação econômica/fiscal (inflação, juros, crescimento)
- Clima político e riscos geopolíticos
- Força da moeda e posição comercial
- Fatores externos relevantes (commodities, relações bilaterais)

Regras:
- Máximo 4 frases, tom analítico e direto
- Use dados quantitativos quando possível (ex: "inflação acima de 6%")
- Cite fontes implícitas (ex: "segundo o FMI", "dados do Banco Central")
- Responda em português do Brasil
- Não use introduções ("O cenário de X é...") — comece direto com a análise
- Se não tiver informações suficientes, diga "Dados insuficientes para leitura." e pare`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? "";

  if (!country) {
    return NextResponse.json({ error: "country param required" }, { status: 400 });
  }

  const cacheKey = `brief_${country}`;
  const cached = cacheGet<BriefResult>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT" },
    });
  }

  try {
    const prompt = `Faça a leitura geoeconômica atual do país: ${country}. Considere o contexto de junho de 2026.`;
    const result = await llmComplete(SYSTEM, prompt);

    const brief: BriefResult = {
      country,
      brief: result.text.trim(),
      model: result.model,
      cachedAt: new Date().toISOString(),
    };

    cacheSet(cacheKey, brief, CACHE_TTL);

    return NextResponse.json(brief, {
      headers: { "X-Cache": "MISS", "Cache-Control": "s-maxage=43200, stale-while-revalidate=3600" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ country, brief: null, error: msg }, { status: 500 });
  }
}
