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

const RENDA_FIXA_USD = new Set(["BIL", "VDST"]);

const ETFS_USA = new Set(["SPY", "QQQ", "VWRA", "VOO", "VNQ", "SCHD", "VT", "FLJP", "SHV"]);

const RF_TERMS = ["TESOURO", "NTN", "NTB", "LFT", "LTN", "LCI", "LCA", "CDB", "LC", "DEBENTURE", "CASH", "CAIXA"];

const UNITS_ACOES = new Set([
  "KLBN11", "SAPR11", "TAEE11", "ALUP11", "SANB11", "BPAC11",
  "ITUB11", "BBAS11", "EGIE11", "ENGI11", "TIET11", "CPFE11",
]);

export function identificarSetor(ticker: string): string {
  const t = ticker.toUpperCase().trim();
  const tClean = t.replace(/\.(SA|L|DE|TO|AS)$/i, "");

  if (CRIPTO.has(tClean)) return "Cripto";
  if ((tClean.startsWith("BTC") || tClean.startsWith("ETH")) && tClean.length < 8) return "Cripto";

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
  if (setor === "ETF USA") return "USD";
  if (setor === "Cripto") return "USD";
  const tClean = ticker.toUpperCase().replace(".SA", "").replace(".L", "");
  if (tClean === "VWRA") return "USD";
  return moedaPlanilha || "BRL";
}

export function getMoedaExposicao(setor: string, moedaEfetiva: string): string {
  if (setor === "Cripto") return "Cripto";
  return moedaEfetiva;
}

export { RF_SETORES };
