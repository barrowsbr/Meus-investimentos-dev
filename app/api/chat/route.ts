import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NextRequest } from "next/server";

const SYSTEM_PROMPT = `Você é um assistente financeiro inteligente integrado ao dashboard pessoal de investimentos de Lucas.
Você tem profundo conhecimento de: mercado financeiro brasileiro (B3, Tesouro Direto, FIIs, ETFs, BDRs),
análise de portfólio, imposto de renda sobre investimentos (DARF, come-cotas, isenção até R$20k/mês),
câmbio e investimentos internacionais, criptoativos, estratégias de alocação de ativos, e planejamento financeiro.
Responda sempre em português brasileiro, de forma clara, precisa e útil.
Quando não tiver certeza, seja honesto. Não faça recomendações específicas de compra/venda de ativos.`;

interface HistoryPart {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY não configurada. Adicione ao .env.local." },
      { status: 500 }
    );
  }

  try {
    const { message, history = [] }: { message: string; history: HistoryPart[] } =
      await req.json();

    if (!message?.trim()) {
      return Response.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(message);
    const response = result.response.text();

    return Response.json({ response });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return Response.json({ error: message }, { status: 500 });
  }
}
