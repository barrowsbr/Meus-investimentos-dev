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

const MODEL_CASCADE = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
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

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY ou GOOGLE_API_KEY não configurada." },
      { status: 500 },
    );
  }

  try {
    const { message, history = [], stream: wantStream = false }: {
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

    const genAI = new GoogleGenerativeAI(apiKey);
    let lastError: unknown = null;

    for (const modelName of MODEL_CASCADE) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
        });
        const chat = model.startChat({ history });

        if (wantStream) {
          const streamResult = await chat.sendMessageStream(message);
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: modelName })}\n\n`));
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
          return new Response(readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }

        const result = await chat.sendMessage(message);
        return Response.json({ response: result.response.text(), model: modelName });
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
