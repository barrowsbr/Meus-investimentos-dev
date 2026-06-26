import { getAssetMeta } from "./asset-meta";

const RF_SETORES = new Set(["Renda Fixa USD", "Renda Fixa", "Caixa/Liquidez"]);

const CRIPTO = new Set([
  "BTC", "ETH", "SOL", "USDT", "USDC", "HBAR", "ADA",
  "BTC-USD", "ETH-USD",
]);

const ETFS_BR = new Set([
  "IVVB11", "BOVA11", "SMAL11", "HASH11", "XINA11",
  "EURP11", "GOLD11", "B5P211",
]);

const COMMODITIES = new Set(["IAU", "SIVR", "SLV", "GLD", "DBC", "USO"]);

const RENDA_FIXA_USD = new Set<string>([]);

const ETFS_USA = new Set(["SPY", "QQQ", "VWRA", "VOO", "VNQ", "SCHD", "VT", "FLJP", "SHV", "BIL", "VDST"]);

const RF_TERMS = ["TESOURO", "NTN", "NTB", "LFT", "LTN", "LCI", "LCA", "CDB", "LC", "DEBENTURE", "CASH", "CAIXA"];

const UNITS_ACOES = new Set([
  "KLBN11", "SAPR11", "TAEE11", "ALUP11", "SANB11", "BPAC11",
  "ITUB11", "BBAS11", "EGIE11", "ENGI11", "TIET11", "CPFE11",
]);

// Sufixo de bolsa (estilo Yahoo) → moeda nativa. FONTE ÚNICA para reconhecer
// ativos estrangeiros automaticamente: basta escrever TICKER.SUFIXO na planilha
// (ex.: VOW3.DE) e o sistema infere país (internacional), moeda e câmbio sozinho —
// sem isso, um ticker como VOW3 cairia no padrão numérico da B3 e viraria "Ações
// Brasil". Só inclui moedas com câmbio suportado em fxToBRL (BRL/EUR/GBP/CAD/USD).
const EXCHANGE_SUFFIX_CURRENCY: Record<string, string> = {
  SA: "BRL", // B3 — Brasil
  L: "GBP",  // LSE — Londres
  DE: "EUR", // Xetra/Frankfurt — Alemanha
  AS: "EUR", // Euronext Amsterdam — Holanda
  PA: "EUR", // Euronext Paris — França
  MI: "EUR", // Borsa Italiana — Itália
  MC: "EUR", // BME — Espanha
  LS: "EUR", // Euronext Lisbon — Portugal
  TO: "CAD", // TSX — Canadá
};

// Extrai o sufixo de bolsa de um ticker (ex.: "VOW3.DE" → "DE"), ou "" se não houver.
function exchangeSuffix(ticker: string): string {
  const m = ticker.toUpperCase().trim().match(/\.([A-Z]{1,2})$/);
  return m ? m[1] : "";
}

export function identificarSetor(ticker: string): string {
  const t = ticker.toUpperCase().trim();
  const tClean = t.replace(/\.(SA|L|DE|TO|AS|PA|MI|MC|LS)$/i, "");

  // Asset metadata (from Yahoo validation) is the primary source.
  // Falls through to heuristics only on cold start / uncached tickers.
  const meta = getAssetMeta(t);
  if (meta) {
    if (meta.quoteType === "CRYPTOCURRENCY") return "Cripto";
    if (meta.quoteType === "ETF") {
      if (meta.currency === "BRL") return "ETF";
      return "ETF USA";
    }
    const isBR = meta.yahooSymbol.endsWith(".SA") || meta.exchange.includes("São Paulo") || meta.exchange.includes("SAO");
    if (isBR) {
      if (tClean.endsWith("11") && !UNITS_ACOES.has(tClean)) return "FIIs";
      if (/3[2-5]$/.test(tClean)) return "BDRs";
      return "Ações Brasil";
    }
    return "Ações Internacional";
  }

  if (CRIPTO.has(tClean)) return "Cripto";
  if ((tClean.startsWith("BTC") || tClean.startsWith("ETH")) && tClean.length < 8) return "Cripto";

  // Sufixo de bolsa estrangeira (≠ .SA) ⇒ ação internacional, ANTES do padrão
  // numérico da B3 — senão VOW3.DE (Volkswagen/Frankfurt) cairia em "Ações Brasil"
  // por terminar em 3. Vale para qualquer ticker.<bolsa> não-brasileiro.
  const suf = exchangeSuffix(t);
  if (suf && suf !== "SA" && EXCHANGE_SUFFIX_CURRENCY[suf]) return "Ações Internacional";

  if (ETFS_BR.has(tClean)) return "ETF";

  if (COMMODITIES.has(tClean)) return "Commodities";

  if (RENDA_FIXA_USD.has(tClean)) return "Renda Fixa USD";

  if (ETFS_USA.has(tClean)) return "ETF USA";

  if (RF_TERMS.some((term) => tClean.includes(term))) return "Renda Fixa";

  const lastChar = tClean[tClean.length - 1];
  if (lastChar >= "0" && lastChar <= "9") {
    if (tClean.endsWith("11")) {
      return UNITS_ACOES.has(tClean) ? "Ações Brasil" : "FIIs";
    }
    if (/3[2-5]$/.test(tClean)) return "BDRs";
    if (/[3456]$/.test(tClean)) return "Ações Brasil";
  }

  return "Ações Internacional";
}

export function isRendaFixa(setor: string): boolean {
  return RF_SETORES.has(setor);
}

// RF "precificável" = ETFs de renda fixa negociados (SHV, BIL) que vivem na
// meus_ativos e TÊM cotação de mercado. Diferente da RF "manual" (CDB, Tesouro)
// que é controlada por saldo nas abas renda_fixa/fixa_aberta e não tem cotação.
// Continuam classificados como RF (proventos/atribuição), mas DEVEM ser
// precificados pelo mercado no NAV.
export function isRendaFixaPrecificavel(setor: string): boolean {
  return setor === "Renda Fixa USD";
}

// RF manual = RF sem cotação de mercado (deve ser excluída da precificação).
export function isRendaFixaManual(setor: string): boolean {
  return isRendaFixa(setor) && !isRendaFixaPrecificavel(setor);
}

export function isRendaVariavel(setor: string): boolean {
  return !RF_SETORES.has(setor);
}

export function getMoedaEfetiva(ticker: string, moedaPlanilha: string, setor: string): string {
  // Asset metadata (from Yahoo validation) is the primary source for currency.
  const meta = getAssetMeta(ticker);
  if (meta?.currency) return meta.currency;
  if (setor === "ETF USA") return "USD";
  if (setor === "Cripto") return "USD";
  const tClean = ticker.toUpperCase().replace(".SA", "").replace(".L", "");
  if (tClean === "VWRA") return "USD";
  // Fallback: moeda inferida pelo sufixo de bolsa — ex.: VOW3.DE ⇒ EUR.
  const suf = exchangeSuffix(ticker);
  if (suf && EXCHANGE_SUFFIX_CURRENCY[suf]) return EXCHANGE_SUFFIX_CURRENCY[suf];
  return moedaPlanilha || "BRL";
}

export function getMoedaExposicao(setor: string, moedaEfetiva: string): string {
  if (setor === "Cripto") return "Cripto";
  return moedaEfetiva;
}

export { RF_SETORES };
