import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MODEL_CASCADE, chaveDoModelo, type ModelEntry } from "@/lib/llm-models";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sonda da cascata de IA em PRODUÇÃO — o "Nenhum modelo disponível" do bot só
// mostrava o último erro; aqui cada modelo COM CHAVE é testado com uma
// completion mínima e reporta ok/erro individualmente. Também lista o catálogo
// vivo do Groq (ids públicos), porque o Groq APOSENTA modelos e o 404 de um
// aposentado mascarava o resto. Auth por CRON_SECRET (workflow telegram-diag);
// log do CI é público — ids de modelo e erros truncados, nunca chaves.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  const sonda = async (entry: ModelEntry, apiKey: string): Promise<string | null> => {
    if (entry.provider === "gemini") {
      const genAI = new GoogleGenerativeAI(apiKey);
      const m = genAI.getGenerativeModel({ model: entry.model });
      const r = await m.generateContent("responda apenas: ok");
      return r.response.text() ? null : "resposta vazia";
    }
    const res = await fetch(`${entry.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: entry.model,
        messages: [{ role: "user", content: "responda apenas: ok" }],
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `${res.status}: ${(await res.text()).slice(0, 220)}`;
    const data = await res.json();
    return data.choices?.[0]?.message?.content ? null : "resposta vazia";
  };

  const modelos = await Promise.all(
    MODEL_CASCADE.map(async (entry) => {
      const apiKey = chaveDoModelo(entry);
      if (!apiKey) return { label: entry.label, model: entry.model, semChave: true };
      try {
        const erro = await sonda(entry, apiKey);
        return erro
          ? { label: entry.label, model: entry.model, ok: false, erro }
          : { label: entry.label, model: entry.model, ok: true };
      } catch (e) {
        return {
          label: entry.label, model: entry.model, ok: false,
          erro: String(e instanceof Error ? e.message : e).slice(0, 220),
        };
      }
    }),
  );

  // Catálogo vivo do Groq — é ele que diz quais ids EXISTEM hoje.
  let groqCatalogo: string[] | string = "sem GROQ_API_KEY";
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${groqKey}` },
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json();
      groqCatalogo = Array.isArray(data?.data)
        ? data.data.map((m: { id?: string }) => String(m.id ?? "")).filter(Boolean).sort()
        : `HTTP ${r.status}`;
    } catch (e) {
      groqCatalogo = String(e instanceof Error ? e.message : e).slice(0, 120);
    }
  }

  // Catálogo vivo do Gemini (nomes públicos) — para escolher substituto de um
  // id aposentado com dado real. Só modelos de generateContent.
  let geminiCatalogo: string[] | string = "sem GEMINI_API_KEY";
  const gemKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (gemKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${gemKey}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data = await r.json();
      geminiCatalogo = Array.isArray(data?.models)
        ? data.models
            .filter((m: { supportedGenerationMethods?: string[] }) =>
              m.supportedGenerationMethods?.includes("generateContent"))
            .map((m: { name?: string }) => String(m.name ?? "").replace(/^models\//, ""))
            .filter(Boolean)
            .sort()
        : `HTTP ${r.status}`;
    } catch (e) {
      geminiCatalogo = String(e instanceof Error ? e.message : e).slice(0, 120);
    }
  }

  return NextResponse.json({ modelos, groqCatalogo, geminiCatalogo }, { headers: { "Cache-Control": "no-store" } });
}
