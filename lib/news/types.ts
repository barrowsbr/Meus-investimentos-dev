// ─────────────────────────────────────────────────────────────────────────────
// Motor único de notícias (Fase 1) — tipos compartilhados.
//
// Hoje o parse/fetch de notícias vive duplicado em ~4 rotas (/api/noticias,
// /api/noticias/destaques, /api/noticias/ativo, /api/radar/news). A ideia é
// centralizar tudo aqui: um NewsItem comum + providers plugáveis (RSS, GDELT,
// Marketaux). Fase 1 cria o motor e o provider Marketaux; Fase 2 migra as rotas.
// ─────────────────────────────────────────────────────────────────────────────

export type NewsImpacto = "alto" | "medio" | "baixo";

export interface NewsItem {
  titulo: string;
  link: string;
  data: string;            // ISO (published_at) — pode vir vazio
  fonte: string;
  imagem: string | null;
  categoria: string;
  impacto: NewsImpacto;
  tema?: string;           // tema classificado (lib/news/temas) — ranking por interesse
  pais?: string;           // ISO2 / país (notícia regional)
  entidades?: string[];    // tickers/símbolos citados (Marketaux)
  sentimento?: number;     // -1..1 (Marketaux)
  idioma?: string;         // "pt" | "en" | ...
}

export interface NewsFilter {
  symbols?: string[];      // tickers para filtrar
  countries?: string[];    // ISO2 — notícia regional
  language?: string;       // ex.: "pt,en"
  limit?: number;
}
