// Helpers de UI de notícia — PUROS e client-safe (sem deps de servidor). Antes
// estavam duplicados (timeAgo 4×, proxyImg, gradiente de categoria, estilo de
// impacto) em page.tsx / AssetNews / app/hoje. Centralizados aqui.

export interface NewsArticle {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  imagem?: string | null;
  categoria?: string;
  impacto?: "alto" | "medio" | "baixo";
  ticker?: string;
  local?: boolean;      // veículo regional/nativo
  idioma?: string;      // idioma original (quando traduzida)
  original?: string;    // título no idioma original
  escopo?: "regulacao" | "mercado";  // aba Trabalho: normas/Bacen × mercado/inovação
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const t = new Date(dateStr).getTime();
  if (!isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 0) return "agora";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const mo = Math.floor(d / 30);
  return `há ${mo}mês${mo > 1 ? "es" : ""}`;
}

// Imagem sempre via proxy (evita mixed-content / hotlink bloqueado).
export function proxyImg(url: string): string {
  return `/api/img-proxy?url=${encodeURIComponent(url)}`;
}

// Gradiente placeholder por categoria (quando não há foto).
export function catGradient(categoria?: string): string {
  const c = (categoria ?? "").toLowerCase();
  if (c.includes("cripto")) return "linear-gradient(135deg,#7c2d12,#b45309)";
  if (c.includes("global") || c.includes("mundo")) return "linear-gradient(135deg,#4c1d95,#6d28d9)";
  if (c.includes("econ")) return "linear-gradient(135deg,#065f46,#059669)";
  if (c.includes("invest")) return "linear-gradient(135deg,#1e3a8a,#2563eb)";
  if (c.includes("câmbio") || c.includes("cambio")) return "linear-gradient(135deg,#78350f,#a16207)";
  if (c.includes("portfólio") || c.includes("portfolio")) return "linear-gradient(135deg,#92400e,#d97706)";
  return "linear-gradient(135deg,#1e293b,#334155)"; // Mercado / default
}

export const IMPACT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  alto:  { bg: "rgba(248,113,113,0.14)", text: "#f87171", label: "ALTO" },
  medio: { bg: "rgba(232,163,61,0.14)",  text: "#E8A33D", label: "MÉDIO" },
  baixo: { bg: "rgba(113,113,122,0.12)", text: "#a1a1aa", label: "BAIXO" },
};
