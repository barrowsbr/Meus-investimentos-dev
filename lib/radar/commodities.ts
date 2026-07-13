// ─────────────────────────────────────────────────────────────────────────────
// Commodities monitoradas no Radar — futuros contínuos do Yahoo Finance (=F).
// Mesma fonte de cotação do resto do app (fetchQuotes), sem API nova.
// Minério de ferro fica de fora: não há futuro líquido no Yahoo (SGX não é
// coberto); proxy seria ação de mineradora, o que não é preço de commodity.
// ─────────────────────────────────────────────────────────────────────────────

export type CommodityCategoria = "Energia" | "Metais preciosos" | "Metais industriais" | "Agrícolas";

export interface CommodityMeta {
  symbol: string;          // símbolo Yahoo do futuro contínuo
  name: string;
  categoria: CommodityCategoria;
  unidade: string;         // unidade de cotação (para exibição)
  emoji: string;
}

export const COMMODITIES: CommodityMeta[] = [
  // ── Energia ──
  { symbol: "CL=F", name: "Petróleo WTI",   categoria: "Energia",            unidade: "USD/barril", emoji: "🛢️" },
  { symbol: "BZ=F", name: "Petróleo Brent", categoria: "Energia",            unidade: "USD/barril", emoji: "🛢️" },
  { symbol: "NG=F", name: "Gás natural",    categoria: "Energia",            unidade: "USD/MMBtu",  emoji: "🔥" },

  // ── Metais preciosos ──
  { symbol: "GC=F", name: "Ouro",           categoria: "Metais preciosos",   unidade: "USD/onça",   emoji: "🥇" },
  { symbol: "SI=F", name: "Prata",          categoria: "Metais preciosos",   unidade: "USD/onça",   emoji: "🥈" },
  { symbol: "PL=F", name: "Platina",        categoria: "Metais preciosos",   unidade: "USD/onça",   emoji: "🪙" },
  { symbol: "PA=F", name: "Paládio",        categoria: "Metais preciosos",   unidade: "USD/onça",   emoji: "🪙" },

  // ── Metais industriais ──
  { symbol: "HG=F",  name: "Cobre",         categoria: "Metais industriais", unidade: "USD/libra",  emoji: "🔶" },
  { symbol: "ALI=F", name: "Alumínio",      categoria: "Metais industriais", unidade: "USD/ton",    emoji: "🔩" },

  // ── Agrícolas ──
  { symbol: "ZS=F", name: "Soja",           categoria: "Agrícolas",          unidade: "¢/bushel",   emoji: "🌱" },
  { symbol: "ZC=F", name: "Milho",          categoria: "Agrícolas",          unidade: "¢/bushel",   emoji: "🌽" },
  { symbol: "ZW=F", name: "Trigo",          categoria: "Agrícolas",          unidade: "¢/bushel",   emoji: "🌾" },
  { symbol: "KC=F", name: "Café arábica",   categoria: "Agrícolas",          unidade: "¢/libra",    emoji: "☕" },
  { symbol: "SB=F", name: "Açúcar",         categoria: "Agrícolas",          unidade: "¢/libra",    emoji: "🍬" },
  { symbol: "CT=F", name: "Algodão",        categoria: "Agrícolas",          unidade: "¢/libra",    emoji: "🧵" },
  { symbol: "CC=F", name: "Cacau",          categoria: "Agrícolas",          unidade: "USD/ton",    emoji: "🍫" },
  { symbol: "LE=F", name: "Boi gordo (EUA)", categoria: "Agrícolas",         unidade: "¢/libra",    emoji: "🐂" },
];

export const COMMODITY_CATEGORIAS: CommodityCategoria[] = [
  "Energia", "Metais preciosos", "Metais industriais", "Agrícolas",
];

export interface CommodityQuote extends CommodityMeta {
  price: number;
  change: number;
  changePct: number;
  spark: number[];     // fechamentos do último mês (sparkline)
  sparkPct: number | null; // variação % na janela do sparkline
}

export interface CommoditiesResponse {
  commodities: CommodityQuote[];
  best: { symbol: string; name: string; emoji: string; changePct: number } | null;
  worst: { symbol: string; name: string; emoji: string; changePct: number } | null;
  lastUpdate: string;
  error?: string;
}
