// Temas de notícia + classificador por keywords + filtro anti-briga política.
// PURO (client-safe): usado pelo motor no servidor e pelo card de perfil na UI.

export type Tema =
  | "macro"          // macroeconomia: juros, inflação, PIB, bancos centrais
  | "geopolitica"    // política global que move o mundo: guerras, sanções, eleições-chave, blocos
  | "mercados"       // bolsa, índices, câmbio — market-moving direto
  | "commodities"    // petróleo, ouro, minério, energia, agro
  | "tech"           // tecnologia, IA, chips, big techs
  | "ciencia"        // ciência, espaço, descobertas
  | "saude_bio"      // saúde, farma, biotech
  | "cripto"         // bitcoin, ethereum, regulação cripto
  | "empresas"       // resultados/fatos relevantes de empresas específicas
  | "negocios"       // negócios, M&A, startups, venture
  | "pagamentos"     // TRABALHO do dono: meios de pagamento, Pix/Bacen, bandeiras, adquirentes, emissores, open finance, DREX + software houses/ERP (integração)
  | "politica_local" // política de bastidor/briga — o que o dono NÃO quer
  | "outros";

export const TEMA_LABEL: Record<Tema, string> = {
  macro: "Macro",
  geopolitica: "Geopolítica",
  mercados: "Mercados",
  commodities: "Commodities",
  tech: "Tecnologia",
  ciencia: "Ciência",
  saude_bio: "Saúde & Bio",
  cripto: "Cripto",
  empresas: "Empresas",
  negocios: "Negócios",
  pagamentos: "Pagamentos",
  politica_local: "Política local",
  outros: "Geral",
};

// Temas selecionáveis no perfil (politica_local/outros não são escolhíveis).
export const TEMAS_PERFIL: Array<{ id: Tema; label: string; desc: string }> = [
  { id: "macro", label: "Macroeconomia", desc: "Juros, inflação, PIB, bancos centrais (Fed/Copom)" },
  { id: "geopolitica", label: "Política global", desc: "O que faz diferença no mundo: guerras, sanções, blocos, eleições-chave" },
  { id: "mercados", label: "Mercados", desc: "Bolsa, índices, câmbio — o que move preço" },
  { id: "commodities", label: "Commodities & Energia", desc: "Petróleo, ouro, minério, gás, agro" },
  { id: "tech", label: "Tecnologia & IA", desc: "IA, chips, big techs, inovação" },
  { id: "ciencia", label: "Ciência & Espaço", desc: "Espaço, física, clima, descobertas" },
  { id: "saude_bio", label: "Saúde & Biotech", desc: "Farmacêuticas, biotech, avanços médicos" },
  { id: "cripto", label: "Cripto", desc: "Bitcoin, Ethereum, regulação" },
  { id: "empresas", label: "Empresas", desc: "Resultados e fatos relevantes de companhias" },
  { id: "negocios", label: "Negócios & Startups", desc: "M&A, venture capital, novos players" },
];

export const DEFAULT_INTERESSES: Tema[] = ["macro", "geopolitica", "mercados", "tech", "ciencia"];

// ── Trabalho do dono: meios de pagamento + software de gestão (BR) ──────────
// Regex ampla e curada — cobre arranjo de pagamentos, Pix/Bacen/normativas,
// bandeiras, adquirentes/subadquirentes, emissores, open finance, DREX, e o
// ecossistema de software houses/ERP com que ele integra. Usada tanto para
// CLASSIFICAR (tema "pagamentos") quanto para FILTRAR a aba Trabalho.
export const PAGAMENTOS_RX =
  /\b(pix\b|meios? de pagamento|mercado de pagamento|arranjo de pagamento|indústria de (pagamento|cart(ão|ões))|meio[- ]de[- ]pagamento|adquirente|subadquirente|credenciador|maquininha|maquineta|point of sale|\bpos\b|\bpin ?pad\b|bandeira[s]? de cart|cart(ão|ões) de (crédito|débito|múltiplo|benefício|refeição|alimentação)|vale[- ](refeição|alimentação)|emissor(a|es)? de cart|open finance|open banking|\bdrex\b|real digital|\bcbdc\b|moeda digital|carteira[s]? digita(l|is)|\bwallet\b|tokeniz|contactless|\bnfc\b|\bqr ?code\b|chargeback|\bmdr\b|interchange|taxas? de intercâmbio|intercâmbio de cart|recebíveis|registradora de recebíveis|antecipação de recebíveis|\bsplit\b de pagamento|gateway de pagamento|subcredenciad|\bpsp\b|\biso ?8583\b|\bemv\b|\bpci[- ]?dss\b|liquidação financeira|câmara de (compensação|pagamento)|\bspb\b|\bspi\b|ted\/doc|transferência bancária|boleto|iniciador de pagamento|\bitp\b|conta digital|banking as a service|\bbaas\b|pagamento instantâneo|pagamento por aproximação|nova plataforma de cobrança|débito automático|débito recorrente|assinatura recorrente|split de recebíveis)\b/i;

// Empresas e marcas do ecossistema (bandeiras, adquirentes, fintechs, ERPs).
export const PAGAMENTOS_MARCAS_RX =
  /\b(visa\b|mastercard|master ?card|\belo\b|american express|\bamex\b|hipercard|\bdiners\b|discover\b|unionpay|\bcielo\b|\brede\b|getnet|\bstone\b|pagseguro|pagbank|mercado pago|\bpagar\.?me\b|\bebanx\b|\badyen\b|\bstripe\b|\bpaypal\b|\bsafrapay\b|\bpicpay\b|\bnubank\b|\binter\b|c6 bank|\bwill bank\b|\bneon\b|banco central|bacen|\bbcb\b|\bfebraban\b|\babecs\b|\bpci\b|totvs|\bsap\b|\bomie\b|conta azul|contaazul|\bbling\b|\bsenior\b|\blinx\b|\btiny\b|\bsankhya\b|nomus|\berp\b|nota fiscal eletrônic|\bnf-?e\b|\bnfc-?e\b|\bsped\b|software de gestão|sistema de gestão|software house)\b/i;

/** true se o título é sobre meios de pagamento OU o ecossistema de software de gestão. */
export function ehPagamentos(titulo: string): boolean {
  return PAGAMENTOS_RX.test(titulo) || PAGAMENTOS_MARCAS_RX.test(titulo);
}

// ── Classificador por keywords (fallback: o tema do feed de origem) ─────────

const RX: Array<[Tema, RegExp]> = [
  ["pagamentos", PAGAMENTOS_RX],
  ["macro", /\b(selic|copom|fomc|fed\b|bce|boj|jerome powell|galípolo|juro[s]?|inflaç|ipca|cpi\b|pce\b|pib\b|gdp\b|recess|payroll|desemprego|unemployment|fiscal|arcabouço|treasury|yield|títulos públicos|banco central|central bank)/i],
  ["geopolitica", /\b(guerra|war\b|ucrânia|ukraine|rússia|russia|china|taiwan|otan|nato|sanç|sanction|irã|iran|israel|gaza|oriente médio|middle east|tarifa|tariff|acordo comercial|trade deal|brics|g7\b|g20\b|onu\b|eleiç(ão|ões) (americana|presidencial|na )|coreia do norte)/i],
  ["cripto", /\b(bitcoin|btc\b|ethereum|eth\b|cripto|crypto|blockchain|stablecoin|binance|coinbase|etf de bitcoin|halving)/i],
  ["tech", /\b(inteligência artificial|\bia\b|\bai\b|openai|anthropic|nvidia|chip[s]?|semicondutor|semiconductor|apple|google|microsooft|microsoft|meta\b|amazon|big tech|startup|software|data center|5g\b|computação quântica|quantum)/i],
  ["ciencia", /\b(nasa|spacex|foguete|rocket|espaço|space\b|telescópio|cient(ista|ífico)|descoberta|estudo revela|vacina|fusão nuclear|energia solar|clima\b|climate|amazônia|arqueolog|física|biolog)/i],
  ["commodities", /\b(petróleo|crude|opep|opec|barril|ouro\b|gold\b|prata\b|minério|iron ore|cobre|copper|lítio|lithium|gás natural|natural gas|etanol|soja|milho|café\b|commodit|agronegócio)/i],
  ["saude_bio", /\b(farmacêutic|pharma|biotech|anvisa|fda\b|vacina|medicamento|ensaio clínico|clinical trial|ozempic|wegovy|oncolog|terapia gênica)/i],
  ["mercados", /\b(ibovespa|b3\b|wall street|s&p ?500|nasdaq|dow jones|dólar|câmbio|bolsa[s]? de valores|mercado financeiro|rally|sell-?off|circuit breaker|vix\b)/i],
  ["negocios", /\b(startup|venture capital|rodada de (investimento|captação)|série [abc]\b|unicórnio|aporte de|m&a\b|joint venture|spin-?off)/i],
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

// ── Filtro de RUÍDO (sempre ligado — regra do motor, não configurável) ───────
// O que NÃO é notícia para este feed: listicle de consumo ("5 melhores
// notebooks…"), guia de compra/review, oferta/cupom, tutorial, fofoca de
// celebridade, horóscopo e clickbait genérico. Aprendizado direto do dono:
// "cinco melhores notebooks pra sei lá o quê — isso não deve ter".

const RUIDO_RX: RegExp[] = [
  // Listicles e guias de consumo
  /^\s*(os |as )?\d+\s+(melhores|piores|dicas|formas|maneiras|motivos|coisas|erros|truques|apps|jogos|filmes|séries)/i,
  /\b(top ?\d+|ranking d[eo]s? melhores)\b/i,
  /\b(melhores (notebooks?|celulares?|smartphones?|tvs?|fones|tablets?|air ?fryers?|geladeiras?|monitores?))\b/i,
  /\b(vale a pena( comprar)?\??|review|unboxing|hands-?on|primeiras impressões|testamos|comparativo:)\b/i,
  /\b(guia de compra|como escolher|qual (comprar|escolher))\b/i,
  // Ofertas / promoções
  /\b(cupom|desconto[s]?|promoç(ão|ões)|oferta[s]?|black friday|esquenta black|mais barato|baixou de preço|em promoção|por apenas r\$)\b/i,
  // Tutoriais / how-to de produto
  /\b(como (usar|ativar|configurar|instalar|baixar|desativar|recuperar|transferir)|passo a passo|tutorial)\b/i,
  // Fofoca / entretenimento raso
  /\b(bbb ?\d*|reality|novela|celebridade[s]?|famos[oa]s?|fofoca|affair|namoro d[eo]|término|look d[eo]|red carpet)\b/i,
  /\b(horóscopo|signo[s]? (de|do|que)|tarô)\b/i,
  // Clickbait genérico
  /\b(você não vai acreditar|vai te surpreender|chocou a internet|viralizou)\b/i,
];

export function ehRuido(titulo: string): boolean {
  return RUIDO_RX.some((rx) => rx.test(titulo)) || ehBrigaPolitica(titulo);
}
