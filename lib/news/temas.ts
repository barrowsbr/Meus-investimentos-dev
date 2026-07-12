// Temas de notícia + classificador por keywords + filtro anti-briga política.
// PURO (client-safe): usado pelo motor no servidor e pelo card de perfil na UI.

export type Tema =
  | "macro"          // macroeconomia: juros, inflação, PIB, bancos centrais
  | "geopolitica"    // política global que move o mundo: guerras, sanções, eleições-chave, blocos
  | "mercados"       // bolsa, índices, câmbio, commodities — market-moving direto
  | "tech"           // tecnologia, IA, chips, big techs
  | "ciencia"        // ciência, espaço, energia, saúde/descobertas
  | "cripto"         // bitcoin, ethereum, regulação cripto
  | "empresas"       // resultados/fatos relevantes de empresas específicas
  | "politica_local" // política de bastidor/briga — o que o dono NÃO quer
  | "outros";

export const TEMA_LABEL: Record<Tema, string> = {
  macro: "Macro",
  geopolitica: "Geopolítica",
  mercados: "Mercados",
  tech: "Tecnologia",
  ciencia: "Ciência",
  cripto: "Cripto",
  empresas: "Empresas",
  politica_local: "Política local",
  outros: "Geral",
};

// Temas selecionáveis no perfil (politica_local/outros não são escolhíveis).
export const TEMAS_PERFIL: Array<{ id: Tema; label: string; desc: string }> = [
  { id: "macro", label: "Macroeconomia", desc: "Juros, inflação, PIB, bancos centrais (Fed/Copom)" },
  { id: "geopolitica", label: "Política global", desc: "O que faz diferença no mundo: guerras, sanções, blocos, eleições-chave" },
  { id: "mercados", label: "Mercados", desc: "Bolsa, índices, câmbio, commodities — o que move preço" },
  { id: "tech", label: "Tecnologia", desc: "IA, chips, big techs, inovação" },
  { id: "ciencia", label: "Ciência", desc: "Espaço, energia, descobertas, saúde" },
  { id: "cripto", label: "Cripto", desc: "Bitcoin, Ethereum, regulação" },
  { id: "empresas", label: "Empresas", desc: "Resultados e fatos relevantes de companhias" },
];

export const DEFAULT_INTERESSES: Tema[] = ["macro", "geopolitica", "mercados", "tech", "ciencia"];

// ── Classificador por keywords (fallback: o tema do feed de origem) ─────────

const RX: Array<[Tema, RegExp]> = [
  ["macro", /\b(selic|copom|fomc|fed\b|bce|boj|jerome powell|galípolo|juro[s]?|inflaç|ipca|cpi\b|pce\b|pib\b|gdp\b|recess|payroll|desemprego|unemployment|fiscal|arcabouço|treasury|yield|títulos públicos|banco central|central bank)/i],
  ["geopolitica", /\b(guerra|war\b|ucrânia|ukraine|rússia|russia|china|taiwan|otan|nato|sanç|sanction|irã|iran|israel|gaza|oriente médio|middle east|tarifa|tariff|acordo comercial|trade deal|brics|g7\b|g20\b|onu\b|eleiç(ão|ões) (americana|presidencial|na )|coreia do norte)/i],
  ["cripto", /\b(bitcoin|btc\b|ethereum|eth\b|cripto|crypto|blockchain|stablecoin|binance|coinbase|etf de bitcoin|halving)/i],
  ["tech", /\b(inteligência artificial|\bia\b|\bai\b|openai|anthropic|nvidia|chip[s]?|semicondutor|semiconductor|apple|google|microsooft|microsoft|meta\b|amazon|big tech|startup|software|data center|5g\b|computação quântica|quantum)/i],
  ["ciencia", /\b(nasa|spacex|foguete|rocket|espaço|space\b|telescópio|cient(ista|ífico)|descoberta|estudo revela|vacina|fusão nuclear|energia solar|clima\b|climate|amazônia|arqueolog|física|biolog)/i],
  ["mercados", /\b(ibovespa|b3\b|wall street|s&p ?500|nasdaq|dow jones|dólar|câmbio|petróleo|crude|ouro\b|gold\b|commodit|bolsa[s]? de valores|mercado financeiro|rally|sell-?off|circuit breaker|vix\b)/i],
  ["empresas", /\b(balanç|resultado[s]? (do|da|de)|lucro (líquido|cai|sobe)|receita (de|cresce)|earnings|guidance|dividendo|jcp\b|fato relevante|fusão|aquisição|merger|acquisition|ipo\b|recuperação judicial|falência|ceo\b)/i],
];

export function classificarTema(titulo: string, fallback: Tema = "outros"): Tema {
  for (const [tema, rx] of RX) if (rx.test(titulo)) return tema;
  return fallback;
}

// ── Anti-briga política ──────────────────────────────────────────────────────
// O dono NÃO quer picuinha/bastidor: "X rebate Y", farpas, bate-boca. Padrões
// conservadores — geopolítica real ("Rússia ataca Kiev") NÃO cai aqui.

const BRIGA_RX: RegExp[] = [
  /\b(rebate|alfineta|cutuca|ironiza|debocha|provoca|detona|esculacha|xinga|zomba)\b/i,
  /\b(bate-?boca|troca de farpas|farpas entre|picuinha|treta|climão)\b/i,
  /\b(manda (recado|indireta)|sobe o tom contra|perde a paciência com|se irrita com)\b/i,
  /\b(aliados de \w+ (reagem|criticam)|base do governo|articulação política|toma[- ]lá[- ]dá[- ]cá)\b/i,
  /\b(lula (critica|ataca|responde|chama)|bolsonaro (critica|ataca|responde|chama))\b/i,
  /\b(vereador|deputado \w+ (bate|discute)|cpi d[ao] |quebra de decoro|fake news sobre)\b/i,
];

export function ehBrigaPolitica(titulo: string): boolean {
  return BRIGA_RX.some((rx) => rx.test(titulo));
}
