// ─────────────────────────────────────────────────────────────────────────────
// Completion não-streaming com cascata de modelos — mesma estratégia do
// /api/chat (Gemini → OpenAI-compat), para uso por agentes server-side
// (ex.: agente tributarista em /api/ir/agente).
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenerativeAI } from "@google/generative-ai";
// Lista de modelos: FONTE ÚNICA em lib/llm-models.ts (compartilhada com /api/chat).
import { MODEL_CASCADE as CASCADE, chaveDoModelo, type ModelEntry } from "./llm-models";


// Erros de cota por MINUTO vêm com retryDelay (ex.: "retry in 22s") — vale
// esperar e tentar o mesmo modelo de novo. Cota por DIA não adianta retry.
function parseRetrySeconds(err: unknown): number | null {
  const s = String(err);
  const m = s.match(/retry in ([\d.]+)\s*s/i) ?? s.match(/"retryDelay":"([\d.]+)s"/);
  if (!m) return null;
  const sec = parseFloat(m[1]);
  return isFinite(sec) && sec > 0 && sec <= 35 ? Math.ceil(sec) : null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const key = chaveDoModelo;

/**
 * Executa um completion tentando os modelos em ordem; retorna a primeira
 * resposta bem-sucedida e o rótulo do modelo usado.
 */
export async function llmComplete(
  systemPrompt: string,
  message: string,
): Promise<{ text: string; model: string }> {
  let lastError: unknown = null;
  let retriedOnce = false;

  async function tryModel(entry: ModelEntry, apiKey: string): Promise<string | null> {
    if (entry.provider === "gemini") {
      const genAI = new GoogleGenerativeAI(apiKey);
      const m = genAI.getGenerativeModel({ model: entry.model, systemInstruction: systemPrompt });
      const result = await m.generateContent(message);
      return result.response.text() || null;
    }
    const res = await fetch(`${entry.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: entry.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 4096,
      }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  }

  for (const entry of CASCADE) {
    const apiKey = key(entry);
    if (!apiKey) continue;
    try {
      const text = await tryModel(entry, apiKey);
      if (text) return { text, model: entry.label };
    } catch (e) {
      lastError = e;
      // Limite por minuto: espera o retryDelay sugerido e tenta o mesmo modelo
      // uma única vez em toda a cascata (para caber no maxDuration da função).
      const waitSec = parseRetrySeconds(e);
      if (waitSec && !retriedOnce) {
        retriedOnce = true;
        await sleep((waitSec + 1) * 1000);
        try {
          const text = await tryModel(entry, apiKey);
          if (text) return { text, model: entry.label };
        } catch (e2) { lastError = e2; }
      }
      continue;
    }
  }

  const raw = lastError instanceof Error ? lastError.message : "";
  if (/429|quota|rate|exhausted/i.test(raw)) {
    throw new Error(
      "Cota gratuita dos modelos de IA esgotada no momento. Tente novamente em ~1 minuto. " +
      "Para nunca mais ver este erro, configure uma chave extra de fallback na Vercel: " +
      "GROQ_API_KEY (grátis em console.groq.com) ou OPENAI_API_KEY / DEEPSEEK_API_KEY.",
    );
  }
  throw new Error(
    raw
      ? `Nenhum modelo disponível: ${raw}`
      : "Nenhum modelo de IA configurado (GEMINI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY ou DEEPSEEK_API_KEY).",
  );
}
