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
  // ⚠️ IDs verificados contra os CATÁLOGOS VIVOS em 31/08/2026 (sonda
  // /api/diag/llm, workflow telegram-diag): Google e Groq APOSENTAM modelos e
  // o id morto responde 404. gemini-2.5-pro ("not available to new users"),
  // gemini-2.0-flash(-lite) e TODOS os Llama do Groq já caíram. Se a sonda
  // acusar 404 de novo, atualizar AQUI olhando o catálogo que ela imprime.

  // Tier 1 — melhor qualidade, cota limitada
  { provider: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "gpt-4o", label: "GPT-4o", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  // xAI é OpenAI-compatível. Sem XAI_API_KEY a entrada é pulada (custo zero);
  // está aqui porque /api/hoje/comentario já fala com o xAI e para entrar
  // sozinha no dia em que a chave existir.
  // ⚠️ Grok (xAI, api.x.ai) ≠ Groq (api.groq.com) — empresas com nomes quase
  // idênticos. O fallback com chave HOJE é o Groq, mais abaixo.
  { provider: "openai-compat", model: process.env.GROK_MODEL || "grok-2-latest", label: "Grok (xAI)", keyEnv: "XAI_API_KEY", fallbackKeyEnv: "GROK_API_KEY", baseUrl: "https://api.x.ai/v1" },

  // Tier 2 — boa qualidade, cota generosa
  { provider: "openai-compat", model: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
  { provider: "openai-compat", model: "deepseek-chat", label: "DeepSeek V3", keyEnv: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com" },

  // Tier 3 — rápidos, tier gratuito
  { provider: "gemini", model: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },

  // Tier 4 — últimos recursos
  { provider: "openai-compat", model: "gpt-4o-mini", label: "GPT-4o Mini", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  { provider: "openai-compat", model: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
];

/** Chave efetiva do modelo (env principal ou alternativa). */
export function chaveDoModelo(entry: ModelEntry): string | undefined {
  return process.env[entry.keyEnv] || (entry.fallbackKeyEnv ? process.env[entry.fallbackKeyEnv] : undefined);
}
