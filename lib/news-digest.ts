// Manchetes enxutas para o digest diário (Telegram). Diferente de
// app/api/noticias/destaques (que resolve og:image, traduz, etc.), aqui só
// precisamos de título + fonte + impacto — rápido e sem scraping de imagem.
// Reusa os helpers de RSS de lib/news-images.ts (fonte única de parsing).

import { fetchFeed, decodeHtml, extractTag } from "./news-images";

export interface DigestHeadline {
  titulo: string;
  fonte: string;
  impacto: "alto" | "medio" | "baixo";
  link: string;
}

const HIGH = [
  "selic", "copom", "fomc", "fed ", "corte de juros", "alta de juros", "decisão",
  "inflação", "ipca", "pib", "recessão", "resultados", "dividendos", "ipo",
  "falência", "fusão", "aquisição", "rebaixamento", "guerra", "sanções", "urgente",
];
const MEDIUM = [
  "balanço", "guidance", "analista", "preço-alvo", "upgrade", "downgrade",
  "volatilidade", "sell-off", "rally", "câmbio", "dólar", "petróleo",
  "dividendo", "recompra", "regulação", "lucro", "receita",
];

function scoreImpact(t: string): DigestHeadline["impacto"] {
  const lc = t.toLowerCase();
  if (HIGH.some(k => lc.includes(k))) return "alto";
  if (MEDIUM.some(k => lc.includes(k))) return "medio";
  return "baixo";
}

const FEEDS: { url: string; fonte: string }[] = [
  { url: "https://www.infomoney.com.br/mercados/feed/", fonte: "InfoMoney" },
  { url: "https://www.infomoney.com.br/economia/feed/", fonte: "InfoMoney" },
  { url: "https://www.moneytimes.com.br/feed/", fonte: "Money Times" },
  { url: "https://g1.globo.com/rss/g1/economia/", fonte: "G1" },
  { url: "https://exame.com/feed/", fonte: "Exame" },
];

function parseTitles(xml: string, fonte: string, max: number): DigestHeadline[] {
  const items: DigestHeadline[] = [];
  for (const m of [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, max)) {
    const block = m[1];
    const titulo = decodeHtml(extractTag(block, "title"));
    const link = extractTag(block, "link").trim();
    if (!titulo) continue;
    items.push({ titulo, fonte, impacto: scoreImpact(titulo), link });
  }
  return items;
}

/** Top manchetes do dia, priorizadas por impacto (alto → baixo). */
export async function fetchDigestHeadlines(limit = 5): Promise<DigestHeadline[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async f => parseTitles(await fetchFeed(f.url), f.fonte, 6)),
  );
  const all: DigestHeadline[] = [];
  for (const r of results) if (r.status === "fulfilled") all.push(...r.value);

  // Dedup por início do título.
  const seen = new Set<string>();
  const deduped = all.filter(h => {
    const key = h.titulo.toLowerCase().slice(0, 45);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const order = { alto: 0, medio: 1, baixo: 2 };
  deduped.sort((a, b) => order[a.impacto] - order[b.impacto]);
  return deduped.slice(0, limit);
}
