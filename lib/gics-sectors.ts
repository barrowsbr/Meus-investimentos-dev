const BR_SECTORS: Record<string, string> = {
  // Financeiro
  ITUB4: "Financeiro", ITUB3: "Financeiro", BBDC4: "Financeiro", BBDC3: "Financeiro",
  BBAS3: "Financeiro", B3SA3: "Financeiro", SANB11: "Financeiro", BPAC11: "Financeiro",
  ITSA4: "Financeiro", ITSA3: "Financeiro", BBSE3: "Financeiro", BRSR3: "Financeiro",
  BMGB4: "Financeiro", CIEL3: "Financeiro", IRBR3: "Financeiro", SULA11: "Financeiro",
  WIZC3: "Financeiro", PSSA3: "Financeiro", ABCB4: "Financeiro", BPAN4: "Financeiro",
  CASH3: "Financeiro", MODL3: "Financeiro", BMOB3: "Financeiro",

  // Petróleo & Gás / Energia
  PETR4: "Energia", PETR3: "Energia", PRIO3: "Energia", RECV3: "Energia",
  RRRP3: "Energia", CSAN3: "Energia", UGPA3: "Energia", VBBR3: "Energia",
  BRAP4: "Energia", BRAP3: "Energia",

  // Mineração & Materiais
  VALE3: "Mineração & Materiais", CMIN3: "Mineração & Materiais",
  CSNA3: "Mineração & Materiais", GGBR4: "Mineração & Materiais",
  GOAU4: "Mineração & Materiais", USIM5: "Mineração & Materiais",
  SUZB3: "Mineração & Materiais", KLBN4: "Mineração & Materiais",
  KLBN11: "Mineração & Materiais", DXCO3: "Mineração & Materiais",

  // Utilidades Públicas (Energia Elétrica / Saneamento)
  ELET3: "Utilidades Públicas", ELET6: "Utilidades Públicas",
  CPFE3: "Utilidades Públicas", CMIG4: "Utilidades Públicas", CMIG3: "Utilidades Públicas",
  EGIE11: "Utilidades Públicas", ENGI11: "Utilidades Públicas",
  TAEE11: "Utilidades Públicas", ALUP11: "Utilidades Públicas",
  SBSP3: "Utilidades Públicas", SAPR11: "Utilidades Públicas",
  CPLE6: "Utilidades Públicas", CPLE3: "Utilidades Públicas",
  NEOE3: "Utilidades Públicas", EQUI3: "Utilidades Públicas",
  AURE3: "Utilidades Públicas", AESB3: "Utilidades Públicas",
  TIET11: "Utilidades Públicas", CPFE11: "Utilidades Públicas",
  TRPL4: "Utilidades Públicas", ENEV3: "Utilidades Públicas",
  CSMG3: "Utilidades Públicas",

  // Saúde
  HAPV3: "Saúde", RDOR3: "Saúde", FLRY3: "Saúde", QUAL3: "Saúde",
  PNVL3: "Saúde", HYPE3: "Saúde", RADL3: "Saúde", MATD3: "Saúde",
  ONCO3: "Saúde", AALR3: "Saúde", BLAU3: "Saúde",

  // Consumo (Alimentos / Bebidas / Básico)
  ABEV3: "Consumo", JBSS3: "Consumo", BRFS3: "Consumo", MDIA3: "Consumo",
  BEEF3: "Consumo", MRFG3: "Consumo", NTCO3: "Consumo", SMTO3: "Consumo",
  SLCE3: "Consumo", CAML3: "Consumo", RAIZ4: "Consumo",

  // Varejo / Consumo Discricionário
  MGLU3: "Varejo", LREN3: "Varejo", PETZ3: "Varejo", AMER3: "Varejo",
  SOMA3: "Varejo", GRND3: "Varejo", VIIA3: "Varejo", AREC3: "Varejo",
  ASAI3: "Varejo", CRFB3: "Varejo", GMAT3: "Varejo", PCAR3: "Varejo",
  BHIA3: "Varejo", VAMO3: "Varejo", RENT3: "Varejo", MOVI3: "Varejo",
  LCAM3: "Varejo", ALPA4: "Varejo", VULC3: "Varejo",

  // Tecnologia
  TOTS3: "Tecnologia", POSI3: "Tecnologia", INTB3: "Tecnologia",
  LWSA3: "Tecnologia", MLAS3: "Tecnologia", SQIA3: "Tecnologia",
  MBLY3: "Tecnologia", NINJ3: "Tecnologia",

  // Telecomunicações / Comunicação
  VIVT3: "Comunicação", TIMS3: "Comunicação", OIBR3: "Comunicação",
  COGN3: "Comunicação", YDUQ3: "Comunicação", ANIM3: "Comunicação",
  SEER3: "Comunicação",

  // Industriais
  WEGE3: "Industriais", EMBR3: "Industriais", TUPY3: "Industriais",
  RANI3: "Industriais", RAPT4: "Industriais", FRAS3: "Industriais",
  KEPL3: "Industriais", POMO4: "Industriais", MYPK3: "Industriais",
  AZUL4: "Industriais", GOLL4: "Industriais", CCRO3: "Industriais",
  ECOR3: "Industriais", STBP3: "Industriais", RAIL3: "Industriais",
  HBSA3: "Industriais", TPIS3: "Industriais", RLOG3: "Industriais",

  // Construção / Imobiliário
  EZTC3: "Imobiliário", MRVE3: "Imobiliário", CYRE3: "Imobiliário",
  EVEN3: "Imobiliário", TEND3: "Imobiliário", DIRR3: "Imobiliário",
  LAVV3: "Imobiliário", JHSF3: "Imobiliário", MDNE3: "Imobiliário",
  TRIS3: "Imobiliário", MELK3: "Imobiliário", PLPL3: "Imobiliário",
  CURY3: "Imobiliário", MRV: "Imobiliário",
};

const US_SECTORS: Record<string, string> = {
  // Technology
  AAPL: "Tecnologia", MSFT: "Tecnologia", GOOGL: "Tecnologia", GOOG: "Tecnologia",
  NVDA: "Tecnologia", AMD: "Tecnologia", INTC: "Tecnologia", TSM: "Tecnologia",
  CRM: "Tecnologia", ADBE: "Tecnologia", ORCL: "Tecnologia", AVGO: "Tecnologia",
  CSCO: "Tecnologia", TXN: "Tecnologia", QCOM: "Tecnologia", AMAT: "Tecnologia",
  MU: "Tecnologia", NOW: "Tecnologia", SNOW: "Tecnologia", PLTR: "Tecnologia",
  UBER: "Tecnologia", SHOP: "Tecnologia", SQ: "Tecnologia", PYPL: "Tecnologia",
  PANW: "Tecnologia", CRWD: "Tecnologia", FTNT: "Tecnologia", ZS: "Tecnologia",
  NET: "Tecnologia", DDOG: "Tecnologia", MDB: "Tecnologia", TEAM: "Tecnologia",
  MRVL: "Tecnologia", ARM: "Tecnologia", SMCI: "Tecnologia", DELL: "Tecnologia",
  HPQ: "Tecnologia", IBM: "Tecnologia", INTU: "Tecnologia", SNPS: "Tecnologia",
  CDNS: "Tecnologia", KLAC: "Tecnologia", LRCX: "Tecnologia", ASML: "Tecnologia",
  VRSN: "Tecnologia",

  // Communication
  META: "Comunicação", NFLX: "Comunicação", DIS: "Comunicação", CMCSA: "Comunicação",
  TMUS: "Comunicação", VZ: "Comunicação", T: "Comunicação", SPOT: "Comunicação",
  ROKU: "Comunicação", PINS: "Comunicação", SNAP: "Comunicação", RBLX: "Comunicação",
  PARA: "Comunicação", WBD: "Comunicação", EA: "Comunicação", TTWO: "Comunicação",
  ATVI: "Comunicação",

  // Financial
  JPM: "Financeiro", BAC: "Financeiro", GS: "Financeiro", MS: "Financeiro",
  WFC: "Financeiro", C: "Financeiro", USB: "Financeiro", SCHW: "Financeiro",
  "BRK-B": "Financeiro", "BRK.B": "Financeiro", V: "Financeiro", MA: "Financeiro",
  AXP: "Financeiro", BLK: "Financeiro", SPGI: "Financeiro", MCO: "Financeiro",
  ICE: "Financeiro", CME: "Financeiro", AON: "Financeiro", MMC: "Financeiro",
  TFC: "Financeiro", PNC: "Financeiro", COF: "Financeiro", AIG: "Financeiro",
  MET: "Financeiro", PRU: "Financeiro", TRV: "Financeiro", ALL: "Financeiro",
  COIN: "Financeiro", HOOD: "Financeiro", SOFI: "Financeiro", NU: "Financeiro",
  IBKR: "Financeiro",

  // Healthcare
  JNJ: "Saúde", PFE: "Saúde", UNH: "Saúde", ABBV: "Saúde", MRK: "Saúde",
  LLY: "Saúde", TMO: "Saúde", ABT: "Saúde", BMY: "Saúde", AMGN: "Saúde",
  GILD: "Saúde", ISRG: "Saúde", MDT: "Saúde", CVS: "Saúde", CI: "Saúde",
  REGN: "Saúde", VRTX: "Saúde", SYK: "Saúde", BDX: "Saúde", ZTS: "Saúde",
  MRNA: "Saúde", DXCM: "Saúde", EW: "Saúde", BIIB: "Saúde", HUM: "Saúde",
  NVO: "Saúde", AZN: "Saúde", GSK: "Saúde", SNY: "Saúde",

  // Energy
  XOM: "Energia", CVX: "Energia", COP: "Energia", SLB: "Energia", OXY: "Energia",
  EOG: "Energia", PXD: "Energia", MPC: "Energia", VLO: "Energia", PSX: "Energia",
  DVN: "Energia", HAL: "Energia", BKR: "Energia", FANG: "Energia",

  // Consumer / Staples
  PG: "Consumo", KO: "Consumo", PEP: "Consumo", WMT: "Consumo", COST: "Consumo",
  CL: "Consumo", MDLZ: "Consumo", MO: "Consumo", PM: "Consumo", STZ: "Consumo",
  KHC: "Consumo", GIS: "Consumo", K: "Consumo", HSY: "Consumo", KMB: "Consumo",
  SJM: "Consumo", TSN: "Consumo",

  // Consumer Discretionary / Retail
  AMZN: "Varejo", TSLA: "Varejo", NKE: "Varejo", HD: "Varejo", MCD: "Varejo",
  SBUX: "Varejo", LOW: "Varejo", TJX: "Varejo", TGT: "Varejo", ROST: "Varejo",
  GM: "Varejo", F: "Varejo", ABNB: "Varejo", BKNG: "Varejo", MAR: "Varejo",
  HLT: "Varejo", YUM: "Varejo", CMG: "Varejo", LULU: "Varejo", ORLY: "Varejo",
  AZO: "Varejo", BBY: "Varejo", ETSY: "Varejo", RCL: "Varejo", LVS: "Varejo",
  WYNN: "Varejo", VOW3: "Varejo",

  // Industrials
  CAT: "Industriais", BA: "Industriais", UNP: "Industriais", HON: "Industriais",
  GE: "Industriais", RTX: "Industriais", LMT: "Industriais", NOC: "Industriais",
  GD: "Industriais", DE: "Industriais", UPS: "Industriais", FDX: "Industriais",
  WM: "Industriais", RSG: "Industriais", EMR: "Industriais", ETN: "Industriais",
  ITW: "Industriais", CSX: "Industriais", NSC: "Industriais", JCI: "Industriais",
  MMM: "Industriais", ROK: "Industriais",

  // Materials
  LIN: "Mineração & Materiais", APD: "Mineração & Materiais", FCX: "Mineração & Materiais",
  NEM: "Mineração & Materiais", NUE: "Mineração & Materiais", STLD: "Mineração & Materiais",
  DOW: "Mineração & Materiais", DD: "Mineração & Materiais", ECL: "Mineração & Materiais",
  SHW: "Mineração & Materiais", PPG: "Mineração & Materiais", DPM: "Mineração & Materiais",

  // Utilities
  NEE: "Utilidades Públicas", DUK: "Utilidades Públicas", SO: "Utilidades Públicas",
  AEP: "Utilidades Públicas", XEL: "Utilidades Públicas", SRE: "Utilidades Públicas",
  D: "Utilidades Públicas", EXC: "Utilidades Públicas", ED: "Utilidades Públicas",
  WEC: "Utilidades Públicas", ES: "Utilidades Públicas", AWK: "Utilidades Públicas",

  // Real Estate
  PLD: "Imobiliário", AMT: "Imobiliário", EQIX: "Imobiliário", SPG: "Imobiliário",
  CCI: "Imobiliário", PSA: "Imobiliário", O: "Imobiliário", WELL: "Imobiliário",
  DLR: "Imobiliário", AVB: "Imobiliário", EQR: "Imobiliário", MAA: "Imobiliário",
};

const SECTOR_MAP: Record<string, string> = { ...BR_SECTORS, ...US_SECTORS };

// Yahoo Finance English sector → Portuguese
const YAHOO_SECTOR_PT: Record<string, string> = {
  "Technology": "Tecnologia",
  "Financial Services": "Financeiro",
  "Financials": "Financeiro",
  "Healthcare": "Saúde",
  "Health Care": "Saúde",
  "Energy": "Energia",
  "Basic Materials": "Mineração & Materiais",
  "Materials": "Mineração & Materiais",
  "Consumer Defensive": "Consumo",
  "Consumer Staples": "Consumo",
  "Consumer Cyclical": "Varejo",
  "Consumer Discretionary": "Varejo",
  "Communication Services": "Comunicação",
  "Telecommunications": "Comunicação",
  "Industrials": "Industriais",
  "Utilities": "Utilidades Públicas",
  "Real Estate": "Imobiliário",
};

export function translateYahooSector(englishSector: string): string {
  return YAHOO_SECTOR_PT[englishSector] ?? englishSector;
}

export function getSetorEconomico(ticker: string, setorAtivo: string, apiSector?: string): string {
  // 1) Dynamic sector from Yahoo API takes priority
  if (apiSector) {
    const translated = YAHOO_SECTOR_PT[apiSector];
    if (translated) return translated;
  }

  // 2) Static mapping
  const t = ticker.toUpperCase().replace(/\.(SA|L|DE|TO|AS|KS|T|SW|PA|MI|MC|HK|AX|TW)$/i, "");
  const mapped = SECTOR_MAP[t];
  if (mapped) return mapped;

  // 3) Fallback by asset type
  if (setorAtivo === "Cripto") return "Cripto";
  if (setorAtivo === "Commodities") return "Commodities";
  if (setorAtivo === "Caixa/Liquidez") return "Caixa/Liquidez";
  if (setorAtivo === "Renda Fixa" || setorAtivo === "Renda Fixa USD") return "Renda Fixa";
  if (setorAtivo === "FIIs") return "Imobiliário";
  if (setorAtivo === "ETF" || setorAtivo === "ETF USA") return "ETFs";
  if (setorAtivo === "BDRs") {
    const base = t.replace(/3[2-5]$/, "");
    const us = US_SECTORS[base];
    if (us) return us;
    return "Outros";
  }

  // 4) If we got an untranslated API sector, use it as-is
  if (apiSector) return apiSector;

  return "Outros";
}

export const SETOR_ECONOMICO_COLORS: Record<string, string> = {
  "Tecnologia": "#8b5cf6",
  "Financeiro": "#3b82f6",
  "Saúde": "#ec4899",
  "Energia": "#f97316",
  "Mineração & Materiais": "#a3a3a3",
  "Consumo": "#22c55e",
  "Varejo": "#14b8a6",
  "Comunicação": "#6366f1",
  "Industriais": "#64748b",
  "Utilidades Públicas": "#eab308",
  "Imobiliário": "#06b6d4",
  "ETFs": "#a855f7",
  "Cripto": "#f59e0b",
  "Renda Fixa": "#10b981",
  "Caixa/Liquidez": "#6b7280",
  "Commodities": "#d97706",
  "Outros": "#94a3b8",
};
