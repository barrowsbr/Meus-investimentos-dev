// ─────────────────────────────────────────────────────────────────────────────
// Aba "Trabalho" do dono — mercado de MEIOS DE PAGAMENTO + software de gestão.
//
// O dono trabalha com pagamentos (bandeiras, adquirentes, emissores, arranjos,
// Pix/Bacen/DREX/open finance) e integração com software de gestão (ERP/NF-e).
// Este motor agrega, com QUALIDADE (é assunto de trabalho):
//   1. Feeds RSS diretos especializados (Mobile Time, Finsiders, Panorama ABECS,
//      PYMNTS, Finextra, The Paypers — fonte primária, COM imagem);
//   2. Buscas dirigidas no Google News (BR + EN), incluindo fontes institucionais
//      via site: (ABECS, Bacen, Febraban) que bloqueiam raspagem direta.
//
// SEGMENTAÇÃO investimento × trabalho (pedido do dono): a aba Trabalho é sobre
// o SETOR (regulação, produto, mercado), não sobre a AÇÃO das empresas. Itens
// com "lente de investidor" pura (ação subiu/caiu, preço-alvo, recomendação,
// cotação) são barrados aqui — esse conteúdo pertence às abas de investimento.
//
// Cada item recebe um ESCOPO ("regulacao" | "mercado") para a UI separar
// normas/Bacen de mercado/inovação. Fontes institucionais ganham prioridade.
// ─────────────────────────────────────────────────────────────────────────────

import type { NewsItem } from "./types";
import type { Tema } from "./temas";
import { ehPagamentos, ehRuido } from "./temas";
import { scoreImpacto, rankNoticias } from "./score";
import { fetchRssDiretos } from "./providers/rss";
import { dedupeNews } from "./engine";
import { fetchFeed, extractTag, decodeHtml, pickFeedImage } from "@/lib/news-images";

export type Escopo = "regulacao" | "mercado";
export type TrabalhoItem = NewsItem & { escopo: Escopo };

// ── Buscas dirigidas no Google News (complemento de cauda dos feeds diretos) ──
// PT cobre o mercado e a regulação brasileira; EN cobre bandeiras e tendências
// globais que pautam o mercado local. Cada busca é um feed RSS de search. As
// fontes institucionais (ABECS/Bacen/Febraban) entram por site:/nome porque
// bloqueiam raspagem direta — o Google News as indexa mesmo assim.
interface Busca { q: string; lang: "pt" | "en" }
const BUSCAS: Busca[] = [
  // Institucional / primária (o que mais importa no trabalho)
  { q: "ABECS meios de pagamento", lang: "pt" },
  { q: "ABECS balanço setor cartões", lang: "pt" },
  { q: "site:panoramaabecs.com.br", lang: "pt" },
  { q: "Banco Central Pix pagamentos regras", lang: "pt" },
  { q: "site:bcb.gov.br Pix OR pagamentos OR arranjo", lang: "pt" },
  { q: "Febraban meios de pagamento", lang: "pt" },
  // Regulação / infra do SFN
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

// ── Escopo: regulação/normas × mercado/inovação ─────────────────────────────
// Regulatório/estrutural: o que muda a REGRA do jogo (Bacen/normas/Pix/open
// finance/DREX) e fontes institucionais (ABECS/Febraban). O resto é mercado.
const REGULATORIO_RX =
  /\b(banco central|bacen|\bbcb\b|resoluç|normativ|regulament|regula(ção|r)|circular\b|instrução normativa|consulta pública|medida provisória|\blei\b|marco legal|open finance|open banking|\bdrex\b|real digital|\bpix\b|liquidação|câmara de|febraban|abecs|cvm\b|conselho monetário|cmn\b)\b/i;

export function escopoDe(it: NewsItem): Escopo {
  return REGULATORIO_RX.test(it.titulo) || /abecs|banco central|bacen|febraban/i.test(it.fonte)
    ? "regulacao"
    : "mercado";
}

// ── Segmentação investimento × trabalho ─────────────────────────────────────
// "Lente de investidor" PURA: a matéria é sobre o PAPEL/cotação, não sobre o
// setor. Isso pertence às abas de investimento, não à aba de trabalho.
const LENTE_INVESTIDOR_RX =
  /\b(aç(ão|ões) d[aeo]|papéis d[aeo]|papel d[aeo]|preço[- ]?alvo|recomendaç(ão|ões)|cotaç(ão|ões) d[aeo]|fechou em (alta|queda)|dispara(m|ndo)? na bolsa|sob(e|em) na bolsa|ca(i|em) na bolsa|valor de mercado|market cap|\bibovespa\b|\bbovespa\b|dividend yield|comprar aç(ão|ões)|vender aç(ão|ões)|analistas? (recomendam|elevam|cortam)|target price|stock (rises|falls|jumps|drops)|shares (rise|fall|jump|drop|slump|surge))\b/i;
// Substância de trabalho: se a matéria carrega REGRA/PRODUTO/OPERAÇÃO do setor,
// ela fica mesmo mencionando a bolsa (ex.: "MDR cai após decisão do Bacen").
const SUBSTANCIA_RX =
  /\b(lanç|nova regra|novas regras|normativ|resoluç|regulament|parceria|integraç|funcionalidade|maquininha|\bmdr\b|intercâmbio|antecipação|\bsplit\b|gateway|open finance|open banking|\bdrex\b|carteira digital|tokeniz|contactless|fraude|golpe|segurança|\bpix\b|bacen|banco central|febraban|abecs|arranjo|adquir|credenciad|emissor|boleto|recebíveis|\berp\b|nf-?e\b|software de gestão|market share|participação de mercado|expande|aquisição|adquire)\b/i;

/** true se é matéria de PAPEL/cotação sem substância setorial → não é "trabalho". */
export function ehLenteInvestidorPura(titulo: string): boolean {
  return LENTE_INVESTIDOR_RX.test(titulo) && !SUBSTANCIA_RX.test(titulo);
}

// ── Importância ─────────────────────────────────────────────────────────────
// Regulatório/institucional é o que mais pesa no trabalho → impacto ALTO.
// Marcas do ecossistema em movimento → ao menos MÉDIO.
const INSTITUCIONAL_FONTE_RX = /abecs|banco central|bacen|\bbcb\b|febraban/i;
function marcarImpacto(it: NewsItem): NewsItem {
  if (REGULATORIO_RX.test(it.titulo) || INSTITUCIONAL_FONTE_RX.test(it.fonte)) {
    return { ...it, impacto: "alto" };
  }
  if (it.impacto === "baixo" && SUBSTANCIA_RX.test(it.titulo)) return { ...it, impacto: "medio" };
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

export async function fetchNoticiasTrabalho(limit = 48): Promise<TrabalhoItem[]> {
  const settled = await Promise.allSettled([
    // Feeds especializados — fonte confiável de pagamentos (mantém, só corta ruído).
    fetchRssDiretos(["pagamentos"]),
    // Buscas dirigidas — filtro estrito de relevância aplicado depois.
    ...BUSCAS.map(async (b) => parseGoogleNews(await fetchFeed(googleNewsUrl(b.q, b.lang)), b.lang)),
  ]);

  let all: NewsItem[] = [];
  const [feedsRes, ...buscasRes] = settled;
  // Feeds especializados: fonte já é do nicho → corta ruído E lente-investidor pura.
  if (feedsRes.status === "fulfilled") {
    all.push(...feedsRes.value.filter((it) => !ehRuido(it.titulo) && !ehLenteInvestidorPura(it.titulo)));
  }
  // Buscas genéricas: exige casar com pagamentos/software de gestão, sem ruído
  // e sem matéria de papel/cotação pura (segmentação investimento × trabalho).
  for (const r of buscasRes) {
    if (r.status === "fulfilled") {
      all.push(...r.value.filter((it) =>
        ehPagamentos(it.titulo) && !ehRuido(it.titulo) && !ehLenteInvestidorPura(it.titulo),
      ));
    }
  }

  all = all.map(marcarImpacto);
  all = dedupeNews(all);

  // Ranqueia por relevância (tema pagamentos casa o perfil) + impacto (institucional
  // = alto) + recência + foto. Depois enriquece imagem e reordena.
  const interesses = new Set<Tema>(["pagamentos"]);
  let ranked = rankNoticias(all, { interesses }).slice(0, limit);
  await traduzirEN(ranked);
  await enriquecerImagens(ranked);
  ranked = rankNoticias(ranked, { interesses }).slice(0, limit);

  // Anexa o escopo (regulação × mercado) para a UI segmentar.
  return ranked.map((it) => ({ ...it, escopo: escopoDe(it) }));
}
