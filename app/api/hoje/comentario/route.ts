import { NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM = `Você é o comentarista de um jornal diário de investimentos pessoais.
Escreva UM parágrafo curto (1 a 2 frases, no máximo ~45 palavras), em português do Brasil,
com tom editorial sóbrio, comentando o RESULTADO DO DIA da carteira como uma manchete/leitura.

REGRAS RÍGIDAS:
- Use SOMENTE os números e ativos fornecidos no JSON. NUNCA invente valores, ativos, datas ou fatos.
- Pode contextualizar de forma genérica (ex.: "puxado pela alta de NVDA", "com o dólar em queda"),
  mas sem citar notícias específicas que não estejam nos dados.
- Não use markdown, aspas, emojis, listas ou cabeçalhos. Apenas o texto corrido.
- Não comece com "Hoje". Seja específico, direto e elegante.`;

/** Grok (xAI) — preferencial, se houver chave. API compatível com OpenAI. */
async function callGrok(user: string): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.GROK_MODEL || "grok-2-latest",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      max_tokens: 220,
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`xAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

function clean(s: string): string {
  return s.replace(/^["'`*\s]+|["'`*\s]+$/g, "").trim();
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* corpo vazio */
  }
  const user = `Dados do dia (JSON):\n${JSON.stringify(body)}`;

  try {
    let comment: string | null = null;
    let model = "Grok (xAI)";

    // 1) Grok preferencial
    try {
      comment = await callGrok(user);
    } catch {
      comment = null;
    }

    // 2) Fallback: cascata de modelos do projeto (Gemini/OpenAI/Groq/…)
    if (!comment) {
      try {
        const r = await llmComplete(SYSTEM, user);
        comment = r.text ? clean(r.text) : null;
        model = r.model;
      } catch {
        comment = null;
      }
    } else {
      comment = clean(comment);
    }

    return NextResponse.json({ comment: comment || null, model });
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro";
    // 200 de propósito: o cliente cai no texto templado sem ruído de erro.
    return NextResponse.json({ comment: null, error: message });
  }
}
