import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NextRequest } from "next/server";
import { buildAgentContext } from "@/lib/agent-context";

export const maxDuration = 60;

const SYSTEM_PROMPT_BASE = `Você é um assistente financeiro pessoal inteligente integrado a um dashboard de investimentos.

Sua missão:
1. Analisar o portfólio do usuário com base nos dados fornecidos no contexto.
2. Identificar oportunidades, riscos e desequilíbrios de alocação.
3. Resumir notícias relevantes e explicar o impacto nos ativos do portfólio.
4. Responder perguntas sobre finanças pessoais, estratégia e mercado.

Regras:
- Sempre responda em português do Brasil.
- Seja conciso e direto. Use bullet points e markdown para clareza.
- Para dados do portfólio, use exclusivamente o contexto fornecido.
- Não dê recomendações de compra/venda como verdade absoluta — sempre inclua ressalvas.
- Use emojis com moderação para melhorar a legibilidade (📈 📉 ⚠️ ✅).

Conhecimentos: mercado financeiro brasileiro (B3, Tesouro Direto, FIIs, ETFs, BDRs),
análise de portfólio, imposto de renda sobre investimentos (DARF, come-cotas, isenção até R$20k/mês),
câmbio e investimentos internacionais, criptoativos, estratégias de alocação de ativos, e planejamento financeiro.`;

let cachedContext: { text: string; timestamp: number } | null = null;
const CONTEXT_TTL_MS = 120_000; // 2 minutes

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

const MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

interface HistoryPart {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

function isQuotaError(err: unknown): boolean {
  const s = String(err).toLowerCase();
  return (
    s.includes("429") ||
    s.includes("quota") ||
    s.includes("rate") ||
    s.includes("resource_exhausted") ||
    s.includes("too many requests") ||
    s.includes("503")
  );
}

async function tryModel(
  apiKey: string,
  modelName: string,
  message: string,
  history: HistoryPart[],
  systemPrompt: string,
): Promise<{ response: string; model: string }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(message);
  return { response: result.response.text(), model: modelName };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY ou GOOGLE_API_KEY não configurada." },
      { status: 500 },
    );
  }

  try {
    const { message, history = [] }: { message: string; history: HistoryPart[] } =
      await req.json();

    if (!message?.trim()) {
      return Response.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const portfolioContext = await getPortfolioContext();
    const systemPrompt = portfolioContext
      ? `${SYSTEM_PROMPT_BASE}\n\n---\n\n${portfolioContext}`
      : SYSTEM_PROMPT_BASE;

    let lastError: unknown = null;

    for (const modelName of MODEL_CASCADE) {
      try {
        const result = await tryModel(apiKey, modelName, message, history, systemPrompt);
        return Response.json(result);
      } catch (err) {
        lastError = err;
        if (isQuotaError(err)) {
          console.warn(`[Chat] ${modelName} quota/rate error, trying next model...`);
          continue;
        }
        throw err;
      }
    }

    const msg = lastError instanceof Error ? lastError.message : "Todos os modelos atingiram o limite de quota";
    return Response.json({ error: `⚠️ ${msg}` }, { status: 429 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[Chat]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
