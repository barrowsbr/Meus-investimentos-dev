// ─────────────────────────────────────────────────────────────────────────────
// Aba "Trabalho" do dono — mercado de MEIOS DE PAGAMENTO + software de gestão.
//
// O dono trabalha com pagamentos (bandeiras, adquirentes, emissores, arranjos,
// Pix/Bacen/DREX/open finance) e integração com software de gestão (ERP/NF-e).
// Este motor agrega, com QUALIDADE (é assunto de trabalho):
//   1. Feeds RSS diretos especializados (Mobile Time, Finsiders, PYMNTS,
//      Finextra, The Paypers — fonte primária, COM imagem);
//   2. Buscas dirigidas no Google News (BR + EN) por normativa Bacen, bandeiras,
//      adquirência, open finance/DREX e software house/ERP.
// Depois: filtra ruído, deduplica, marca importância (normativa Bacen = alto),
// traduz EN→PT, enriquece imagem (og:image) e ranqueia por relevância+recência.
// ─────────────────────────────────────────────────────────────────────────────

import type { NewsItem } from "./types";
import type { Tema } from "./temas";
import { ehPagamentos, PAGAMENTOS_MARCAS_RX, ehRuido } from "./temas";
import { scoreImpacto, rankNoticias } from "./score";
import { fetchRssDiretos } from "./providers/rss";
import { dedupeNews } from "./engine";
import { fetchFeed, extractTag, decodeHtml, pickFeedImage } from "@/lib/news-images";

// ── Buscas dirigidas no Google News (complemento de cauda dos feeds diretos) ──
// PT cobre o mercado e a regulação brasileira; EN cobre bandeiras e tendências
// globais que pautam o mercado local. Cada busca é um feed RSS de search.
interface Busca { q: string; lang: "pt" | "en" }
const BUSCAS: Busca[] = [
  // Regulação / Bacen / infra do SFN (o que mais importa no trabalho)
  { q: "Banco Central meios de pagamento resolução", lang: "pt" },
  { q: "Pix novidade Banco Central", lang: "pt" },
  { q: "open finance Brasil", lang: "pt" },
  { q: "Drex real digital Banco Central", lang: "pt" },
  { q: "regulação arranjo de pagamento Bacen", lang: "pt" },
  // Mercado: bandeiras, adquirência, emissores, fintechs
  { q: "adquirente maquininha Cielo Rede Stone", lang: "pt" },
  { q: "bandeira cartão Visa Mastercard Elo Brasil", lang: "pt" },
  { q: "mercado de pagamentos fintech Brasil", lang: "pt" },
  { q: "recebíveis registradora antecipação", lang: "pt" },
  // Software de gestão / ERP (integração — trabalho do dono)
  { q: "software de gestão ERP Brasil NF-e", lang: "pt" },
  { q: "TOTVS Omie Conta Azul Bling sistema de gestão", lang: "pt" },
  // Global (bandeiras e tendências que pautam o BR)
  { q: "payments industry Visa Mastercard regulation", lang: "en" },
  { q: "acquiring merchant payments fintech", lang: "en" },
];

function googleNewsUrl(query: string, lang: "pt" | "en"): string {
  const q = encodeURIComponent(query);
  return lang === "en"
    ? `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
    : `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt`;
}

function extractSource(block: string): string {
  const m = block.match(/<source[^>]*>([^<]*)<\/source>/i);
  return m ? decodeHtml(m[1].trim()) : "Google News";
}

function parseGoogleNews(xml: string, lang: "pt" | "en", max = 8): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, max)) {
    const block = m[1];
    const titulo = decodeHtml(extractTag(block, "title"));
    let link = extractTag(block, "link");
    if (!link) {
      const hm = block.match(/<link\s+href="([^"]+)"/i);
      if (hm) link = hm[1];
    }
    if (!titulo || !link) continue;
    out.push({
      titulo,
      link,
      data: extractTag(block, "pubDate"),
      fonte: extractSource(block),
      imagem: pickFeedImage(block, link),
      categoria: "pagamentos",
      tema: "pagamentos",
      impacto: scoreImpacto(titulo),
      idioma: lang,
    });
  }
  return out;
}

// ── Importância específica de pagamentos ────────────────────────────────────
// O scorer genérico não conhece "resolução do Bacen" nem "DREX". Aqui elevamos
// o impacto do que é ESTRUTURAL para o trabalho: normativa/regulação, Pix,
// open finance, DREX (alto) e movimentos de bandeira/adquirente/marca (médio).
const REGULATORIO_RX =
  /\b(banco central|bacen|\bbcb\b|resoluç|normativ|regulament|regula(ção|r)|circular\b|instrução normativa|consulta pública|medida provisória|\blei\b|open finance|open banking|\bdrex\b|real digital|\bpix\b|liquidação|câmara de|febraban|abecs)\b/i;

function marcarImpacto(it: NewsItem): NewsItem {
  if (REGULATORIO_RX.test(it.titulo)) return { ...it, impacto: "alto" };
  if (PAGAMENTOS_MARCAS_RX.test(it.titulo) && it.impacto === "baixo") return { ...it, impacto: "medio" };
  return it;
}

async function traduzirEN(items: NewsItem[]): Promise<void> {
  const en = items.filter((i) => i.idioma === "en");
  if (en.length === 0) return;
  try {
    const { translateBatch } = await import("@/lib/translate");
    const pt = await translateBatch(en.map((e) => e.titulo), "pt");
    for (let i = 0; i < en.length; i++) {
      if (pt[i] && pt[i].length > 3 && pt[i] !== en[i].titulo) en[i].titulo = pt[i];
    }
  } catch { /* mantém EN — melhor que atrasar */ }
}

// Enriquece imagem do TOPO: feeds diretos já vêm com foto; itens do Google News
// precisam decodificar o redirect e raspar og:image. Deadline global.
async function enriquecerImagens(items: NewsItem[], topN = 24, deadlineMs = 6000): Promise<void> {
  const alvo = items.slice(0, topN).filter((it) => !it.imagem && /^https?:\/\//.test(it.link));
  if (alvo.length === 0) return;
  const { fetchArticleImage, resolveAndImage } = await import("@/lib/news-images");
  await Promise.race([
    Promise.allSettled(alvo.map(async (it) => {
      if (/news\.google/.test(it.link)) {
        const r = await resolveAndImage(it.link);
        if (r?.img) { it.imagem = r.img; if (r.realUrl) it.link = r.realUrl; }
      } else {
        const img = await fetchArticleImage(it.link);
        if (img) it.imagem = img;
      }
    })),
    new Promise((resolve) => setTimeout(resolve, deadlineMs)),
  ]);
}

export async function fetchNoticiasTrabalho(limit = 48): Promise<NewsItem[]> {
  const settled = await Promise.allSettled([
    // Feeds especializados — fonte confiável de pagamentos (mantém todos).
    fetchRssDiretos(["pagamentos"]),
    // Buscas dirigidas — filtro estrito de relevância aplicado depois.
    ...BUSCAS.map(async (b) => parseGoogleNews(await fetchFeed(googleNewsUrl(b.q, b.lang)), b.lang)),
  ]);

  let all: NewsItem[] = [];
  const [feedsRes, ...buscasRes] = settled;
  // Itens dos feeds especializados: fonte já é do nicho → só corta ruído.
  if (feedsRes.status === "fulfilled") {
    all.push(...feedsRes.value.filter((it) => !ehRuido(it.titulo)));
  }
  // Itens de busca genérica: exige casar com pagamentos/software de gestão.
  for (const r of buscasRes) {
    if (r.status === "fulfilled") {
      all.push(...r.value.filter((it) => ehPagamentos(it.titulo) && !ehRuido(it.titulo)));
    }
  }

  all = all.map(marcarImpacto);
  all = dedupeNews(all);

  // Ranqueia por relevância (tema pagamentos casa o perfil) + impacto + recência
  // + foto. Recência com o half-life padrão (18h) — trabalho quer o que é novo.
  const interesses = new Set<Tema>(["pagamentos"]);
  const ranked = rankNoticias(all, { interesses }).slice(0, limit);

  await traduzirEN(ranked);
  await enriquecerImagens(ranked);

  // Reordena após enriquecer (o bônus de imagem pode ter mudado o topo).
  return rankNoticias(ranked, { interesses }).slice(0, limit);
}
