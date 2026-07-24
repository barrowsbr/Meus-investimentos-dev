import { NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";
import { translateBatch } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  imagem?: string | null;
  ticker: string;
  categoria: "mercado" | "portfolio" | "economia" | "macro" | "setor";
  impacto: "alto" | "medio" | "baixo";
}

// ─── Impact scoring ──────────────────────────────────────────────────────────

const HIGH_IMPACT: string[] = [
  "selic", "copom", "fomc", "fed ", "rate cut", "rate hike",
  "corte de juros", "alta de juros", "decisão de juros",
  "inflação", "ipca", "cpi ", "pce ",
  "pib", "gdp", "recessão", "recession",
  "resultados", "earnings", "lucro líquido", "net income",
  "dividendos extraordinários", "special dividend",
  "ipo", "falência", "bankruptcy", "recuperação judicial",
  "fusão", "merger", "aquisição", "acquisition", "takeover",
  "default", "moratória", "rebaixamento", "downgrade soberano",
  "guerra", "war ", "sanções", "sanctions",
  "payroll", "emprego", "unemployment",
  "breaking", "urgente", "alerta",
];

const MEDIUM_IMPACT: string[] = [
  "balanço", "projeção", "guidance", "analista", "analyst",
  "preço-alvo", "price target", "upgrade", "downgrade", "rating",
  "volatilidade", "volatility", "sell-off", "rally",
  "câmbio", "dólar", "petróleo", "crude oil",
  "desemprego", "treasury", "bond yield",
  "lucro", "profit", "receita", "revenue",
  "dividendo", "dividend", "recompra", "buyback",
  "regulação", "regulation",
];

function scoreImpact(titulo: string): "alto" | "medio" | "baixo" {
  const t = titulo.toLowerCase();
  if (HIGH_IMPACT.some(kw => t.includes(kw))) return "alto";
  if (MEDIUM_IMPACT.some(kw => t.includes(kw))) return "medio";
  return "baixo";
}

// ─── RSS helpers ──────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  const inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : inner;
}

function extractSourceName(xml: string): string {
  const m = xml.match(/<source[^>]*>([^<]*)<\/source>/i);
  return m ? decodeHtml(m[1].trim()) : "";
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function newsUrl(query: string, lang: "pt" | "en" = "pt"): string {
  const q = encodeURIComponent(query);
  if (lang === "en") {
    return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  }
  return `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt`;
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

interface ParsedItem extends NewsItem {
  _lang: "pt" | "en";
}

function parseRSS(
  xml: string,
  ticker: string,
  categoria: NewsItem["categoria"],
  lang: "pt" | "en",
  maxItems = 6
): ParsedItem[] {
  const items: ParsedItem[] = [];
  const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

  for (const m of matches.slice(0, maxItems)) {
    const block = m[1];
    const titulo = decodeHtml(extractTag(block, "title"));
    let link = extractTag(block, "link");
    if (!link) {
      const hm = block.match(/<link\s+href="([^"]+)"/i);
      if (hm) link = hm[1];
    }
    if (!titulo || !link) continue;

    const data = extractTag(block, "pubDate");
    const fonte = extractSourceName(block) || "Google News";

    items.push({ titulo, link, data, fonte, ticker, categoria, impacto: scoreImpact(titulo), _lang: lang });
  }

  return items;
}

interface FeedDef {
  url: string;
  ticker: string;
  categoria: NewsItem["categoria"];
  max: number;
  lang: "pt" | "en";
}

// ─── Symbol-scoped feeds (drill-down de UMA ação) ─────────────────────────────
// SÓ notícias do ativo clicado — sem feeds gerais de mercado/macro/setor. Usa o
// nome da empresa quando disponível ("Petrobras" casa muito melhor que "PETR4").

function isBrazilian(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (s.endsWith(".SA")) return true;
  const clean = s.replace(/\.\w+$/, "");
  return /^[A-Z]{4}\d{1,2}$/.test(clean); // padrão B3: PETR4, VALE3, ITUB4…
}

function buildSymbolFeeds(tickers: string[], names: Record<string, string>, kind?: string): FeedDef[] {
  const feeds: FeedDef[] = [];
  for (const t of tickers) {
    const clean = t.replace(/\.\w+$/, "");
    const name = (names[t] || names[clean] || "").trim();
    // Commodity: o ticker de futuro ("GC=F") não serve de busca — o que casa é
    // o nome PT ("Ouro preço"). O nome vem em português do catálogo do Radar.
    if (kind === "commodity") {
      const base = (name || clean).replace(/\s*\(.*?\)\s*/g, "").trim();
      feeds.push({ url: newsUrl(`${base} preço commodity`, "pt"), ticker: clean, categoria: "portfolio", max: 10, lang: "pt" });
      continue;
    }
    const br = isBrazilian(t);
    const lang: "pt" | "en" = br ? "pt" : "en";
    const query = br
      ? (name ? `${name} ação` : `${clean} ações bolsa`)
      : (name ? `${name} stock` : `${clean} stock news`);
    feeds.push({ url: newsUrl(query, lang), ticker: clean, categoria: "portfolio", max: 10, lang });
  }
  return feeds;
}

// ─── Batch translate English headlines to Portuguese ─────────────────────────

async function translateHeadlines(items: ParsedItem[]): Promise<void> {
  const english = items.filter(i => i._lang === "en");
  if (english.length === 0) return;

  // 1ª tentativa: Google Translate (rápido, gratuito, em lote). Cobre a
  // maioria dos casos sem gastar tokens de LLM.
  try {
    const translated = await translateBatch(english.map(e => e.titulo), "pt");
    for (let i = 0; i < english.length; i++) {
      const pt = translated[i];
      if (pt && pt.length > 3 && pt !== english[i].titulo) english[i].titulo = pt;
    }
  } catch {
    // ignora — cai para o fallback de LLM abaixo
  }

  // Fallback de LLM só para o que não traduziu (ainda parece inglês). Útil
  // quando o endpoint do Google falha ou rate-limita.
  const pending = english.filter(e => /\b(the|of|and|for|rate|stock|market|report)\b/i.test(e.titulo));
  if (pending.length === 0) return;

  const titles = pending.map((e, i) => `${i}|${e.titulo}`);
  const prompt =
    `Traduza cada manchete abaixo para português do Brasil, mantendo siglas (Fed, FOMC, S&P, etc.) e nomes próprios intactos.\n` +
    `Responda SOMENTE com as linhas traduzidas, uma por linha, no formato "NÚMERO|tradução" (mesmo formato da entrada).\n` +
    `Não adicione explicações.\n\n` +
    titles.join("\n");

  try {
    const result = await Promise.race([
      llmComplete("Você é um tradutor de manchetes financeiras. Traduza de inglês para português do Brasil.", prompt),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    if (!result) return;
    const { text } = result as { text: string };
    const lines = text.split("\n").filter(l => l.includes("|"));
    for (const line of lines) {
      const sep = line.indexOf("|");
      if (sep < 0) continue;
      const idx = parseInt(line.slice(0, sep).trim(), 10);
      const translated = line.slice(sep + 1).trim();
      if (!isNaN(idx) && idx >= 0 && idx < pending.length && translated.length > 3) {
        pending[idx].titulo = translated;
      }
    }
  } catch {
    // Timeout ou falha — mantém títulos originais em inglês.
  }
}

// ─── Fetch news for a SINGLE asset (scope=symbol) ─────────────────────────────

async function fetchSymbolNews(tickers: string[], name: string, kind?: string): Promise<NewsItem[]> {
  const names: Record<string, string> = {};
  if (name) for (const t of tickers) names[t] = name;

  const feeds = buildSymbolFeeds(tickers, names, kind);
  const all: ParsedItem[] = [];
  const results = await Promise.allSettled(
    feeds.map(async f => {
      const xml = await fetchFeed(f.url);
      return parseRSS(xml, f.ticker, f.categoria, f.lang, f.max);
    })
  );
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  // Deduplicate by link + title
  const seen = new Set<string>();
  const deduped: ParsedItem[] = [];
  for (const item of all) {
    const linkKey = item.link.slice(0, 80);
    const titleKey = item.titulo.toLowerCase().slice(0, 60);
    if (!seen.has(linkKey) && !seen.has(titleKey)) {
      seen.add(linkKey);
      seen.add(titleKey);
      deduped.push(item);
    }
  }

  await translateHeadlines(deduped);

  // Para um único ativo, recência manda (o impacto vira só a cor do marcador).
  deduped.sort((a, b) => {
    const da = a.data ? new Date(a.data).getTime() : 0;
    const db = b.data ? new Date(b.data).getTime() : 0;
    return db - da;
  });

  // Imagem para a PRIMEIRA notícia de cada ticker (é a que o Radar do Dia
  // exibe): raspa o og:image da página real (resolveAndImage decodifica o
  // redirect do Google News). Deadline global — sem foto, fica o layout atual.
  try {
    const { resolveAndImage } = await import("@/lib/news-images");
    const vistos = new Set<string>();
    const alvo: ParsedItem[] = [];
    for (const it of deduped) {
      if (vistos.has(it.ticker)) continue;
      vistos.add(it.ticker);
      alvo.push(it);
    }
    await Promise.race([
      Promise.allSettled(alvo.map(async it => {
        const r = await resolveAndImage(it.link);
        if (r?.img) { it.imagem = r.img; if (r.realUrl) it.link = r.realUrl; }
      })),
      new Promise(res => setTimeout(res, 5000)),
    ]);
  } catch { /* segue sem imagem */ }

  return deduped;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers") ?? "";
  const scope = searchParams.get("scope") ?? "";
  const name = searchParams.get("name") ?? "";
  const tickers = tickersParam
    ? tickersParam.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  try {
    // scope=symbol → SÓ notícias do(s) ativo(s) — caminho antigo (Radar do Dia).
    if (scope === "symbol" && tickers.length) {
      const articles = await fetchSymbolNews(tickers, name, searchParams.get("kind") ?? undefined);
      return NextResponse.json(
        { articles, count: articles.length },
        { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1800" } },
      );
    }

    // scope=trabalho → aba TRABALHO do dono: mercado de meios de pagamento
    // (bandeiras, adquirentes, emissores, Bacen/Pix/DREX/open finance) +
    // software de gestão BR. Motor dedicado (lib/news/trabalho).
    if (scope === "trabalho") {
      const { fetchNoticiasTrabalho } = await import("@/lib/news/trabalho");
      const itens = await fetchNoticiasTrabalho(48);
      const articles = itens.map(it => ({
        titulo: it.titulo,
        link: it.link,
        data: it.data,
        fonte: it.fonte,
        imagem: it.imagem,
        tema: it.tema,
        ticker: "Trabalho",
        categoria: it.categoria,
        impacto: it.impacto,
      }));
      return NextResponse.json(
        { articles, count: articles.length },
        { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=3600" } },
      );
    }

    // Painel geral → MOTOR ÚNICO (lib/news/engine): feeds diretos por tema COM
    // imagem + providers gated (Marketaux/Finnhub/GNews) + anti-briga + curador
    // LLM + ranking por interesse/impacto/recência/foto. O perfil vem por query
    // (localStorage do cliente); sem params vale o perfil default do dono.
    const { fetchNoticiasGerais } = await import("@/lib/news/engine");
    const { TEMA_LABEL } = await import("@/lib/news/temas");
    const interessesParam = searchParams.get("interesses") ?? "";
    const interesses = interessesParam
      ? (interessesParam.split(",").map(t => t.trim()).filter(Boolean) as import("@/lib/news/temas").Tema[])
      : undefined;
    const semBriga = searchParams.get("semBriga") !== "0";

    const itens = await fetchNoticiasGerais({ interesses, semBriga, limit: 60 });
    // Shape compatível com os consumidores atuais (+ imagem e tema, novos).
    const articles = itens.map(it => ({
      titulo: it.titulo,
      link: it.link,
      data: it.data,
      fonte: it.fonte,
      imagem: it.imagem,
      tema: it.tema,
      ticker: TEMA_LABEL[(it.tema ?? "outros") as keyof typeof TEMA_LABEL] ?? "Geral",
      categoria: it.categoria,
      impacto: it.impacto,
    }));
    return NextResponse.json(
      { articles, count: articles.length },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1800" } },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message, articles: [] }, { status: 500 });
  }
}
