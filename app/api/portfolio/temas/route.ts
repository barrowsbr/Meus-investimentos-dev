import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { isRendaFixa } from "@/lib/sectors";
import { llmComplete } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Temas de investimento da carteira (Investment Themes do PortfolioAnalyst)
// A cascata LLM classifica os papéis detidos em até 7 temas (IA, semicondutores,
// ouro/prata, índice amplo…); os PESOS são calculados AQUI, somando o valor real
// das posições de cada tema — o LLM só agrupa, nunca inventa número. Best-effort:
// sem chave de LLM a rota devolve vazio e o card não aparece. Cache 7d por
// composição (mudou a carteira → reclassifica).

interface Tema { tema: string; descricao: string; tickers: string[]; pesoPct: number }
interface PayloadTemas { temas: Tema[]; modelo: string | null; geradoEm: string }

let cache: { chave: string; at: number; payload: PayloadTemas } | null = null;
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(): Promise<NextResponse> {
  try {
    const store = getDataStore();
    const transacoes = await store.fetchTab("meus_ativos");
    const tickerSet = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const t = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!t || tickerSet.has(t)) continue;
      tickerSet.set(t, { moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(), corretora: String(row["corretora"] ?? "").trim() });
    }
    const tickers = [...tickerSet.entries()].map(([ticker, i]) => ({ ticker, moeda: i.moeda, corretora: i.corretora }));
    const cotacoes = await fetchCotacoes(tickers);
    const snapshot = calcularSnapshot(transacoes, [], [], cotacoes.quotes, cotacoes.fx, cotacoes.fx);

    const posicoes: Array<{ ticker: string; nome: string; setor: string; pesoBRL: number }> = [];
    const seen = new Set<string>();
    for (const p of snapshot.positions) {
      if ((p.quantidade ?? 0) <= 0 || (p.valorAtualBRL ?? 0) <= 0) continue;
      if (isRendaFixa(p.setor) || p.setor === "Cripto") continue;
      const info = tickerSet.get(p.ticker);
      const ySym = yahooTicker(p.ticker, info?.moeda ?? "BRL", info?.corretora ?? "");
      if (seen.has(ySym)) continue;
      seen.add(ySym);
      posicoes.push({
        ticker: p.ticker.replace(/\.SA$/i, ""),
        nome: cotacoes.quotes[p.ticker]?.name ?? p.ticker,
        setor: p.setor,
        pesoBRL: p.valorAtualBRL,
      });
    }
    const chave = posicoes.map(p => p.ticker).sort().join(",");
    if (cache && cache.chave === chave && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.payload, { headers: { "Cache-Control": "s-maxage=86400" } });
    }

    const totalBRL = posicoes.reduce((s, p) => s + p.pesoBRL, 0);
    const lista = posicoes.map(p => `${p.ticker} (${p.nome}; setor ${p.setor})`).join("\n");
    const system = "Você é um analista que agrupa ativos em TEMAS de investimento, como a seção Investment Themes do PortfolioAnalyst da IBKR. Responda APENAS JSON válido, sem markdown.";
    const prompt = `Agrupe os ativos abaixo em no máximo 7 temas de investimento em português (ex.: "IA & semicondutores", "Índices amplos", "Metais preciosos", "Bancos & seguros"...). Todo ativo entra em EXATAMENTE um tema (o mais forte). Formato: {"temas":[{"tema":"...","descricao":"1 frase curta","tickers":["..."]}]}\n\nATIVOS:\n${lista}`;

    let payload: PayloadTemas;
    try {
      const { text, model } = await llmComplete(system, prompt);
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as { temas?: Array<{ tema?: string; descricao?: string; tickers?: string[] }> };
      const conhecidos = new Map(posicoes.map(p => [p.ticker.toUpperCase(), p.pesoBRL]));
      const temas: Tema[] = (parsed.temas ?? [])
        .map(t => {
          const tk = (t.tickers ?? []).map(x => String(x).toUpperCase()).filter(x => conhecidos.has(x));
          const peso = tk.reduce((s, x) => s + (conhecidos.get(x) ?? 0), 0);
          return { tema: String(t.tema ?? "").slice(0, 60), descricao: String(t.descricao ?? "").slice(0, 160), tickers: tk, pesoPct: totalBRL > 0 ? (peso / totalBRL) * 100 : 0 };
        })
        .filter(t => t.tema && t.tickers.length > 0)
        .sort((a, b) => b.pesoPct - a.pesoPct);
      payload = { temas, modelo: model, geradoEm: new Date().toISOString() };
    } catch {
      payload = { temas: [], modelo: null, geradoEm: new Date().toISOString() }; // sem LLM → card some
    }

    if (payload.temas.length > 0) cache = { chave, at: Date.now(), payload };
    return NextResponse.json(payload, { headers: { "Cache-Control": "s-maxage=86400" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
