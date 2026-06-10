// ─────────────────────────────────────────────────────────────────────────────
// Completion não-streaming com cascata de modelos — mesma estratégia do
// /api/chat (Gemini → OpenAI-compat), para uso por agentes server-side
// (ex.: agente tributarista em /api/ir/agente).
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenerativeAI } from "@google/generative-ai";

interface ModelEntry {
  provider: "gemini" | "openai-compat";
  model: string;
  label: string;
  keyEnv: string;
  fallbackKeyEnv?: string;
  baseUrl?: string;
}

const CASCADE: ModelEntry[] = [
  { provider: "gemini", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "gpt-4o", label: "GPT-4o", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  { provider: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "deepseek-chat", label: "DeepSeek V3", keyEnv: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com" },
  { provider: "openai-compat", model: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
  { provider: "gemini", model: "gemini-2.0-flash", label: "Gemini 2.0 Flash", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
];

function key(e: ModelEntry): string | undefined {
  return process.env[e.keyEnv] || (e.fallbackKeyEnv ? process.env[e.fallbackKeyEnv] : undefined);
}

/**
 * Executa um completion tentando os modelos em ordem; retorna a primeira
 * resposta bem-sucedida e o rótulo do modelo usado.
 */
export async function llmComplete(
  systemPrompt: string,
  message: string,
): Promise<{ text: string; model: string }> {
  let lastError: unknown = null;
  for (const entry of CASCADE) {
    const apiKey = key(entry);
    if (!apiKey) continue;
    try {
      if (entry.provider === "gemini") {
        const genAI = new GoogleGenerativeAI(apiKey);
        const m = genAI.getGenerativeModel({ model: entry.model, systemInstruction: systemPrompt });
        const result = await m.generateContent(message);
        const text = result.response.text();
        if (text) return { text, model: entry.label };
      } else {
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
        const text = data.choices?.[0]?.message?.content;
        if (text) return { text, model: entry.label };
      }
    } catch (e) {
      lastError = e;
      continue;
    }
  }
  throw new Error(
    lastError instanceof Error
      ? `Nenhum modelo disponível: ${lastError.message}`
      : "Nenhum modelo de IA configurado (GEMINI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY ou DEEPSEEK_API_KEY).",
  );
}
