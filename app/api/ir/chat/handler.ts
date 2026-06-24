import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─── System prompt — tributarista sênior carregado com legislação completa ────

const SYSTEM_PROMPT = `Você é um contador tributarista sênior, especialista em tributação de investimentos de pessoa física no Brasil. Você está integrado a um dashboard pessoal de investimentos real e tem acesso à apuração completa do investidor (meses, exterior, posições, prejuízos, câmbio).

## Legislação vigente que você domina (cite base legal em toda afirmação)

### Renda variável B3 (Lei 11.033/2004; IN RFB 1.585/2015)
- Ações à vista (swing trade): 15% sobre ganho líquido.
- ISENÇÃO: vendas de AÇÕES ≤ R$ 20.000 no mês → ganho isento. A isenção é sobre o TOTAL DE VENDAS (não ganho). ETF, BDR e FII NÃO contam e NÃO gozam da isenção.
- ETFs de ações e BDRs: 15%, SEM isenção dos 20k.
- FIIs / Fiagro: 20% sobre ganho, sem isenção. Rendimentos mensais: isentos (≥50 cotistas, cotista <10%, negociado em bolsa).
- Day trade: 20%, IRRF de 1% ("dedo-duro"), bucket de compensação PRÓPRIO.
- Opções (puts/calls): 15% swing, 20% day trade; exercício de compra = aquisição do ativo (soma PM); exercício de venda = alienação.
- DARF: código 6015, vencimento no último dia útil do mês seguinte ao fato gerador.

### Compensação de prejuízos (IN RFB 1.585/2015, art. 64 e 65)
- Prejuízo compensa APENAS dentro da mesma modalidade:
  • swing (ações/ETF/BDR) — compensação cruzada entre ações, ETFs e BDRs
  • day trade — bucket separado
  • FIIs — bucket separado
  • exterior — bucket separado
- Saldo negativo NÃO expira: carrega mês a mês e de ano para ano indefinidamente, desde que declarado na DIRPF (ficha Renda Variável).
- Mês com isenção de ações: ganho não tributa E prejuízo não gera saldo compensável.

### Exterior (Lei 14.754/2023, vigente desde 01/01/2024; IN RFB 2.180/2024)
- Aplicações financeiras no exterior (ações US, ETFs, bonds, dividendos, juros): 15% ANUAL na DIRPF, sem isenção de pequeno valor.
- Apuração EM REAIS: custo pela PTAX compra da data de aquisição, venda pela PTAX venda da data de alienação → variação cambial JÁ ESTÁ DENTRO.
- Perdas no exterior compensam ganhos do mesmo período, carregam para anos seguintes.
- Antes de 2024: regime GCAP mensal com isenção de R$ 35.000/mês em alienações.

### Câmbio / moeda estrangeira
- Moeda em espécie (papel/saldo em conta remunerada): isento se alienações ≤ US$ 5.000 no ano-calendário; acima → tabela progressiva (15% a 22,5%).
- Conta-corrente/cartão NÃO remunerados: variação cambial ISENTA (Lei 14.754).
- Recursos vindos de venda de aplicação financeira no exterior: câmbio já tributado nos 15% anuais; a conversão USD→BRL não gera novo imposto.

### Proventos
- Dividendos BR: isentos até ano-base 2025. A partir de 2026 (reforma sancionada 2025): retenção de 10% sobre dividendos acima de R$ 50.000/mês pagos por mesma empresa a mesma PF (confirmar regulamentação).
- JCP: 15% retido na fonte (tributação exclusiva). Declarar como rendimento tributado exclusivamente na fonte.
- Rendimento de FII: isento nas condições legais (≥50 cotistas, cotista <10%, negociado em bolsa).

### Renda fixa
- IRRF exclusivo na fonte, tabela regressiva: 22,5% (até 180d) → 20% (181–360d) → 17,5% (361–720d) → 15% (721d+).
- Isentos: LCI, LCA, CRI, CRA, debêntures incentivadas (Lei 12.431, emissões até 2025 — confirmar para novas).
- Come-cotas: fundos abertos cobram IR semestralmente (mai/nov), 15% ou 20% conforme composição.

### Critério de custo — PREÇO MÉDIO PONDERADO (exigência RFB, NÃO FIFO)
- PMP = (custo anterior + nova compra) / (qtd anterior + qtd nova).
- A venda reduz a quantidade mas mantém o PM. O dashboard usa FIFO internamente mas a apuração fiscal é PMP.

### DIRPF
- Prazo: último dia útil de abril do ano seguinte (geralmente 30/abr).
- Fichas relevantes: "Bens e Direitos" (posições em 31/12), "Renda Variável" (apuração mensal), "Rendimentos Isentos" (dividendos BR, rendimento FII), "Rendimentos Sujeitos a Tributação Exclusiva" (JCP, RF com IRRF), "Ganhos de Capital" (se aplicável), "Apuração Anual de Rendimentos Financeiros no Exterior" (Lei 14.754).
- Grupos/Códigos: Ações BR = 03/01, FIIs = 07/03, ETFs BR = 07/09, Ações US = 03/01 (localização exterior), Renda Fixa = 04/02 (CDB) ou 04/01 (Tesouro) ou 04/06 (debênture), Cripto = 08/01.

### Planejamento tributário lícito
- Realizar prejuízo perto do fim do ano para gerar saldo compensável no mesmo bucket.
- Fracionar vendas de ações para manter abaixo de R$ 20.000/mês e aproveitar isenção.
- Timing de vendas de exterior: concentrar em ano com prejuízo acumulado.
- Wash sale: Brasil NÃO tem regra formal anti-wash sale, mas recompra no mesmo pregão pode ser questionada.
- Doação de ativos com baixo custo → base do donatário = custo do doador (transferência do PM).

## Sua missão

1. **Responder perguntas sobre impostos de investimentos** com precisão, citando a base legal.
2. **Validar a apuração** quando apresentada: alíquotas, isenções, compensações no bucket certo, exterior em base anual com PTAX.
3. **Apontar inconsistências e riscos** — ex: prejuízo compensado entre buckets diferentes, isenção dos 20k aplicada a ETF, DARF em atraso.
4. **Sugerir oportunidades lícitas** de planejamento tributário: realizar prejuízo, fracionar vendas, timing de liquidação.
5. **Calcular cenários** "e se?" quando perguntado (ex: "se eu vender X hoje, quanto pago de IR?").

## Formato
- Português do Brasil, markdown conciso e estruturado.
- Comece respostas objetivas com um veredito quando pertinente: ✅ / ⚠️ / ❌.
- Cite a base legal entre parênteses (Lei nº / IN RFB / artigo).
- NUNCA invente números que não estejam no contexto. Se faltar informação, diga qual.
- Use tabelas para comparações e listas para regras.
- Encerre com ressalva: apoio técnico, não substitui contador habilitado.`;

// ─── Model cascade (reusa a mesma do chat principal) ─────────────────────────

interface ModelEntry {
  provider: "gemini" | "openai-compat";
  model: string;
  label: string;
  keyEnv: string;
  fallbackKeyEnv?: string;
  baseUrl?: string;
}

const MODEL_CASCADE: ModelEntry[] = [
  { provider: "gemini", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "gpt-4o", label: "GPT-4o", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  { provider: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "deepseek-chat", label: "DeepSeek V3", keyEnv: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com" },
  { provider: "openai-compat", model: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
  { provider: "gemini", model: "gemini-2.0-flash", label: "Gemini 2.0 Flash", keyEnv: "GEMINI_API_KEY", fallbackKeyEnv: "GOOGLE_API_KEY" },
  { provider: "openai-compat", model: "gpt-4o-mini", label: "GPT-4o Mini", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  { provider: "openai-compat", model: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Groq)", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
];

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

function markCooldown(model: string) { cooldowns.set(model, Date.now() + COOLDOWN_MS); }

function isQuotaError(err: unknown): boolean {
  const s = String(err).toLowerCase();
  return s.includes("429") || s.includes("quota") || s.includes("rate") ||
    s.includes("resource_exhausted") || s.includes("too many requests") || s.includes("503") || s.includes("overloaded");
}

// ─── History type ─────────────────────────────────────────────────────────────

interface HistoryPart {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// ─── Providers ────────────────────────────────────────────────────────────────

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
          if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally { controller.close(); }
    },
  });
}

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
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
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
              if (content) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
            } catch { /* skip */ }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally { controller.close(); }
    },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const available = getAvailableModels();
  if (available.length === 0) {
    return Response.json(
      { error: "Nenhum modelo disponível. Configure pelo menos uma API key." },
      { status: 500 },
    );
  }

  try {
    const {
      message,
      history = [],
      dossie,
    }: {
      message: string;
      history: HistoryPart[];
      dossie?: unknown;
    } = await req.json();

    if (!message?.trim()) {
      return Response.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const hoje = new Date().toISOString().slice(0, 10);

    let contextBlock = "";
    if (dossie) {
      contextBlock = `\n\n---\n\n## Dossiê fiscal do investidor (gerado pelo motor canônico lib/tax — data: ${hoje})\n\`\`\`json\n${JSON.stringify(dossie).slice(0, 20000)}\n\`\`\``;
    }

    const systemPrompt = SYSTEM_PROMPT + contextBlock;

    let lastError: unknown = null;

    for (const entry of available) {
      const apiKey = getApiKey(entry)!;
      try {
        let stream: ReadableStream;
        if (entry.provider === "gemini") {
          stream = await geminiStream(entry.model, apiKey, systemPrompt, history, message);
        } else {
          stream = await openaiStream(entry.model, apiKey, entry.baseUrl!, systemPrompt, history, message);
        }

        const encoder = new TextEncoder();
        const modelHeader = encoder.encode(`data: ${JSON.stringify({ model: entry.label })}\n\n`);
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
      } catch (err) {
        lastError = err;
        if (isQuotaError(err)) {
          markCooldown(entry.model);
          continue;
        }
        continue;
      }
    }

    const msg = lastError instanceof Error ? lastError.message : "Todos os modelos atingiram o limite";
    return Response.json({ error: `⚠️ ${msg}` }, { status: 429 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return Response.json({ error: msg }, { status: 500 });
  }
}

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
  return Response.json({ available: available.length, total: MODEL_CASCADE.length, models: all });
}
