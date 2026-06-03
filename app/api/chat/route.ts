import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NextRequest } from "next/server";
import { buildAgentContext } from "@/lib/agent-context";

export const maxDuration = 120;

const SYSTEM_PROMPT_BASE = `Você é um consultor financeiro pessoal de alto nível, integrado a um dashboard de investimentos real. Você tem acesso ao portfólio completo do investidor com dados em tempo real.

## Missão

Analise dados financeiros com profundidade, identifique padrões e ofereça insights acionáveis. Não seja genérico — use os DADOS REAIS do portfólio fornecidos no contexto.

## Como responder

1. **Sempre baseie-se nos dados concretos do portfólio** — cite tickers, valores, percentuais reais.
2. **Seja analítico e preciso** — calcule métricas quando relevante (yield on cost, concentração, Sharpe implícito, correlações setoriais).
3. **Use markdown rico** — títulos, tabelas, bold, listas. Formate números com R$ e %.
4. **Dê contexto macro quando pertinente** — Selic, IPCA, FED, cenário de mercado atual.
5. **Identifique riscos e oportunidades** sem ser alarmista. Sempre inclua ressalvas em recomendações.
6. **Responda em português do Brasil.**

## Áreas de expertise

- Mercado brasileiro: B3, Tesouro Direto, FIIs, ETFs, BDRs, ações
- Tributação: DARF, come-cotas, isenção de R$20k/mês, ganho de capital
- Câmbio e investimentos internacionais (ETFs US/UCITS, ADRs)
- Renda fixa: CDBs, LCIs, LCAs, debêntures, Tesouro (Selic, IPCA+, Prefixado)
- Alocação de ativos, diversificação, rebalanceamento
- Análise fundamentalista e quantitativa básica
- Criptoativos e commodities
- Planejamento financeiro e previdenciário

## Proibido

- Inventar dados que não estejam no contexto fornecido
- Dar ordens de compra/venda como certeza — sempre use linguagem como "vale considerar", "uma opção seria"
- Ignorar o contexto real do portfólio quando disponível`;

// ── Context cache ──────────────────────────────────────────────────────────────

let cachedContext: { text: string; timestamp: number } | null = null;
const CONTEXT_TTL_MS = 120_000;

async function getPortfolioContext(): Promise<string> {
  const now = Date.now();
  if (cachedContext && now - cachedContext.timestamp < CONTEXT_TTL_MS) {
    return cachedContext.text;
  }
  try {
    const ctx = await buildAgentContext();
    cachedContext = { text: ctx, timestamp: now };
    return ctx;
  } catch (e) {
    console.error("[Chat] Failed to build portfolio context:", e);
    return "";
  }
}

// ── Model cascade ──────────────────────────────────────────────────────────────

interface ModelEntry {
  provider: "gemini" | "openai-compat";
  model: string;
  label: string;
  keyEnv: string;
  fallbackKeyEnv?: string;
  baseUrl?: string;
}

const MODEL_CASCADE: ModelEntry[] = [
  // Tier 1 — Best quality, limited quotas
  { provider: "gemini", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "gpt-4o", label: "GPT-4o", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },

  // Tier 2 — Good quality, generous quotas
  { provider: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "deepseek-chat", label: "DeepSeek V3", keyEnv: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com" },

  // Tier 3 — Fast, free tiers
  { provider: "openai-compat", model: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
  { provider: "gemini", model: "gemini-2.0-flash", label: "Gemini 2.0 Flash", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },

  // Tier 4 — Ultimate fallbacks
  { provider: "openai-compat", model: "gpt-4o-mini", label: "GPT-4o Mini", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  { provider: "openai-compat", model: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
];

// Cooldown: don't retry a model for 60s after a quota error
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 60_000;

function getApiKey(entry: ModelEntry): string | undefined {
  return process.env[entry.keyEnv] || (entry.fallbackKeyEnv ? process.env[entry.fallbackKeyEnv] : undefined);
}

function getAvailableModels(): ModelEntry[] {
  const now = Date.now();
  return MODEL_CASCADE.filter((entry) => {
    if (!getApiKey(entry)) return false;
    const cd = cooldowns.get(entry.model);
    return !(cd && now < cd);
  });
}

function markCooldown(model: string) {
  cooldowns.set(model, Date.now() + COOLDOWN_MS);
}

function isQuotaError(err: unknown): boolean {
  const s = String(err).toLowerCase();
  return (
    s.includes("429") ||
    s.includes("quota") ||
    s.includes("rate") ||
    s.includes("resource_exhausted") ||
    s.includes("too many requests") ||
    s.includes("503") ||
    s.includes("overloaded")
  );
}

// ── History types ──────────────────────────────────────────────────────────────

interface HistoryPart {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// ── Gemini provider ────────────────────────────────────────────────────────────

async function geminiStream(
  model: string, apiKey: string,
  systemPrompt: string, history: HistoryPart[], message: string,
): Promise<ReadableStream> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
  const chat = m.startChat({ history });
  const streamResult = await chat.sendMessageStream(message);

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamResult.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}

async function geminiComplete(
  model: string, apiKey: string,
  systemPrompt: string, history: HistoryPart[], message: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
  const chat = m.startChat({ history });
  const result = await chat.sendMessage(message);
  return result.response.text();
}

// ── OpenAI-compatible provider (GPT, DeepSeek, Groq — via fetch) ───────────

function toOpenAIMessages(systemPrompt: string, history: HistoryPart[], message: string) {
  return [
    { role: "system" as const, content: systemPrompt },
    ...history.map((h) => ({
      role: (h.role === "model" ? "assistant" : "user") as "assistant" | "user",
      content: h.parts.map((p) => p.text).join(""),
    })),
    { role: "user" as const, content: message },
  ];
}

async function openaiStream(
  model: string, apiKey: string, baseUrl: string,
  systemPrompt: string, history: HistoryPart[], message: string,
): Promise<ReadableStream> {
  const messages = toOpenAIMessages(systemPrompt, history, message);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 4096 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
              }
            } catch { /* skip malformed chunk */ }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}

async function openaiComplete(
  model: string, apiKey: string, baseUrl: string,
  systemPrompt: string, history: HistoryPart[], message: string,
): Promise<string> {
  const messages = toOpenAIMessages(systemPrompt, history, message);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 4096 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const available = getAvailableModels();
  if (available.length === 0) {
    return Response.json(
      {
        error: "Nenhum modelo disponível. Configure pelo menos uma API key: GEMINI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY ou DEEPSEEK_API_KEY.",
        availableKeys: MODEL_CASCADE.map((m) => m.keyEnv).filter((v, i, a) => a.indexOf(v) === i),
      },
      { status: 500 },
    );
  }

  try {
    const {
      message,
      history = [],
      stream: wantStream = false,
    }: {
      message: string;
      history: HistoryPart[];
      stream?: boolean;
    } = await req.json();

    if (!message?.trim()) {
      return Response.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const portfolioContext = await getPortfolioContext();
    const systemPrompt = portfolioContext
      ? `${SYSTEM_PROMPT_BASE}\n\n---\n\n${portfolioContext}`
      : SYSTEM_PROMPT_BASE;

    let lastError: unknown = null;

    for (const entry of available) {
      const apiKey = getApiKey(entry)!;

      try {
        if (wantStream) {
          let stream: ReadableStream;

          if (entry.provider === "gemini") {
            stream = await geminiStream(entry.model, apiKey, systemPrompt, history, message);
          } else {
            stream = await openaiStream(entry.model, apiKey, entry.baseUrl!, systemPrompt, history, message);
          }

          const encoder = new TextEncoder();
          const modelHeader = encoder.encode(
            `data: ${JSON.stringify({ model: entry.label })}\n\n`,
          );
          const prefixed = new ReadableStream({
            async start(controller) {
              controller.enqueue(modelHeader);
              const reader = stream.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
              controller.close();
            },
          });

          return new Response(prefixed, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }

        let responseText: string;
        if (entry.provider === "gemini") {
          responseText = await geminiComplete(entry.model, apiKey, systemPrompt, history, message);
        } else {
          responseText = await openaiComplete(entry.model, apiKey, entry.baseUrl!, systemPrompt, history, message);
        }
        return Response.json({ response: responseText, model: entry.label });
      } catch (err) {
        lastError = err;
        if (isQuotaError(err)) {
          markCooldown(entry.model);
          console.warn(`[Chat] ${entry.label} → quota/rate limit, trying next... (cooldown 60s)`);
          continue;
        }
        console.error(`[Chat] ${entry.label} → error:`, err);
        continue;
      }
    }

    const msg = lastError instanceof Error ? lastError.message : "Todos os modelos atingiram o limite";
    return Response.json({ error: `⚠️ ${msg}` }, { status: 429 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[Chat]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ── Status endpoint (GET) — shows available models ─────────────────────────

export async function GET() {
  const available = getAvailableModels();
  const all = MODEL_CASCADE.map((entry) => ({
    model: entry.model,
    label: entry.label,
    provider: entry.provider,
    hasKey: !!getApiKey(entry),
    cooldown: cooldowns.has(entry.model)
      ? Math.max(0, Math.ceil((cooldowns.get(entry.model)! - Date.now()) / 1000))
      : 0,
  }));
  return Response.json({
    available: available.length,
    total: MODEL_CASCADE.length,
    models: all,
  });
}
