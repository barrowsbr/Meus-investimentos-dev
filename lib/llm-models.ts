// FONTE ÚNICA da cascata de modelos (regra dura do projeto: um lugar só).
//
// Antes existiam DUAS listas — uma em lib/llm.ts (Telegram, notícias, IR,
// temas, radar) e outra em app/api/chat (Agente IA da página) — que já haviam
// divergido. Atualizar o modelo num lugar não valia no outro. Agora as duas
// importam daqui: mexeu aqui, mudou em todo lugar.
//
// O COMPORTAMENTO continua onde estava: /api/chat faz streaming e cooldown;
// lib/llm faz completion simples com retry. Só a LISTA é compartilhada.

export interface ModelEntry {
  provider: "gemini" | "openai-compat";
  model: string;
  label: string;
  keyEnv: string;
  fallbackKeyEnv?: string;
  baseUrl?: string;
}

/** Ordem = preferência. Modelo sem chave é PULADO, então dá para deixar
 *  provedores que o dono ainda não assinou — eles entram sozinhos no dia em
 *  que a chave existir. */
export const MODEL_CASCADE: ModelEntry[] = [
  // Tier 1 — melhor qualidade, cota limitada
  { provider: "gemini", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "gpt-4o", label: "GPT-4o", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  // xAI é OpenAI-compatível. Fica alto de propósito: hoje o dono tem Gemini e
  // Grok ativos, então este é o PRIMEIRO fallback real quando o Gemini satura.
  // ⚠️ Grok (xAI) ≠ Groq (Llama, mais abaixo) — empresas diferentes.
  { provider: "openai-compat", model: process.env.GROK_MODEL || "grok-2-latest", label: "Grok (xAI)", keyEnv: "XAI_API_KEY", fallbackKeyEnv: "GROK_API_KEY", baseUrl: "https://api.x.ai/v1" },

  // Tier 2 — boa qualidade, cota generosa
  { provider: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "deepseek-chat", label: "DeepSeek V3", keyEnv: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com" },

  // Tier 3 — rápidos, tier gratuito
  { provider: "gemini", model: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
  { provider: "gemini", model: "gemini-2.0-flash", label: "Gemini 2.0 Flash", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },

  // Tier 4 — últimos recursos
  { provider: "openai-compat", model: "gpt-4o-mini", label: "GPT-4o Mini", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  { provider: "gemini", model: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
];

/** Chave efetiva do modelo (env principal ou alternativa). */
export function chaveDoModelo(entry: ModelEntry): string | undefined {
  return process.env[entry.keyEnv] || (entry.fallbackKeyEnv ? process.env[entry.fallbackKeyEnv] : undefined);
}
