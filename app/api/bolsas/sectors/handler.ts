import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ── Types ─────────────────────────────────────────────────────────────────

interface SectorDef {
  name: string;
  weight: number;
  tickers: string[];
}

export interface SectorData {
  name: string;
  weight: number;
  changePct: number;
  ticker: string;
  fallback: boolean;
}

// ── Index → Region mapping (mirrors the main bolsas route) ───────────────

type Region = "us" | "brazil" | "europe" | "japan" | "china" | "korea" | "taiwan" | "india" | "asean" | "oceania" | "mideast" | "africa" | "latam" | "canada";

const INDEX_REGION: Record<string, Region> = {
  "^GSPC": "us", "^DJI": "us", "^IXIC": "us", "^RUT": "us",
  "^BVSP": "brazil",
  "^GSPTSE": "canada",
  "^MXX": "latam", "^MERV": "latam", "^IPSA": "latam",
  "^STOXX50E": "europe", "^FTSE": "europe", "^GDAXI": "europe",
  "^FCHI": "europe", "^IBEX": "europe", "FTSEMIB.MI": "europe",
  "^SSMI": "europe", "^AEX": "europe", "^OMXS30": "europe",
  "^OMXC25": "europe", "^OMXHPI": "europe", "^OSEAX": "europe",
  "^ATX": "europe", "^BFX": "europe", "PSI20.LS": "europe",
  "^WIG20": "europe", "XU100.IS": "europe", "IMOEX.ME": "europe",
  "^N225": "japan",
  "^HSI": "china", "000001.SS": "china", "399001.SZ": "china",
  "^KS11": "korea",
  "^TWII": "taiwan",
  "^BSESN": "india", "^NSEI": "india",
  "^STI": "asean", "^JKSE": "asean", "^KLSE": "asean", "^SET.BK": "asean",
  "^AXJO": "oceania", "^NZ50": "oceania",
  "^TA125.TA": "mideast",
  "^J203.JO": "africa", "^CASE30": "africa",
};

// ── Sector compositions with fallback tickers ────────────────────────────
//    tickers[] = [preferred, fallback1, fallback2, …]

const SECTOR_MAP: Record<string, SectorDef[]> = {

  // ── US ──────────────────────────────────────────────────────────────────

  "^GSPC": [
    { name: "Tecnologia",     weight: 31, tickers: ["XLK", "VGT", "FTEC"] },
    { name: "Financeiro",     weight: 13, tickers: ["XLF", "VFH", "IYF"] },
    { name: "Saúde",          weight: 12, tickers: ["XLV", "VHT", "IYH"] },
    { name: "Consumo Disc.",  weight: 10, tickers: ["XLY", "VCR", "IYC"] },
    { name: "Comunicação",    weight: 9,  tickers: ["XLC", "VOX", "FCOM"] },
    { name: "Industrial",     weight: 8,  tickers: ["XLI", "VIS", "IYJ"] },
    { name: "Consumo Básico", weight: 6,  tickers: ["XLP", "VDC", "IYK"] },
    { name: "Energia",        weight: 4,  tickers: ["XLE", "VDE", "IYE"] },
    { name: "Utilities",      weight: 3,  tickers: ["XLU", "VPU", "IDU"] },
    { name: "Imobiliário",    weight: 2,  tickers: ["XLRE", "VNQ", "IYR"] },
    { name: "Materiais",      weight: 2,  tickers: ["XLB", "VAW", "IYM"] },
  ],
  "^DJI": [
    { name: "Tecnologia",     weight: 22, tickers: ["XLK", "VGT"] },
    { name: "Saúde",          weight: 18, tickers: ["XLV", "VHT"] },
    { name: "Financeiro",     weight: 16, tickers: ["XLF", "VFH"] },
    { name: "Industrial",     weight: 14, tickers: ["XLI", "VIS"] },
    { name: "Consumo Disc.",  weight: 13, tickers: ["XLY", "VCR"] },
    { name: "Consumo Básico", weight: 7,  tickers: ["XLP", "VDC"] },
    { name: "Energia",        weight: 4,  tickers: ["XLE", "VDE"] },
    { name: "Comunicação",    weight: 3,  tickers: ["XLC", "VOX"] },
    { name: "Materiais",      weight: 2,  tickers: ["XLB", "VAW"] },
    { name: "Utilities",      weight: 1,  tickers: ["XLU", "VPU"] },
  ],
  "^IXIC": [
    { name: "Tecnologia",     weight: 49, tickers: ["XLK", "VGT", "QQQ"] },
    { name: "Comunicação",    weight: 16, tickers: ["XLC", "VOX"] },
    { name: "Consumo Disc.",  weight: 13, tickers: ["XLY", "VCR"] },
    { name: "Saúde",          weight: 8,  tickers: ["XLV", "VHT"] },
    { name: "Industrial",     weight: 5,  tickers: ["XLI", "VIS"] },
    { name: "Financeiro",     weight: 4,  tickers: ["XLF", "VFH"] },
    { name: "Consumo Básico", weight: 3,  tickers: ["XLP", "VDC"] },
    { name: "Utilities",      weight: 1,  tickers: ["XLU", "VPU"] },
    { name: "Energia",        weight: 1,  tickers: ["XLE", "VDE"] },
  ],
  "^RUT": [
    { name: "Saúde",          weight: 17, tickers: ["XLV", "VHT"] },
    { name: "Industrial",     weight: 16, tickers: ["XLI", "VIS"] },
    { name: "Financeiro",     weight: 16, tickers: ["XLF", "VFH"] },
    { name: "Tecnologia",     weight: 13, tickers: ["XLK", "VGT"] },
    { name: "Consumo Disc.",  weight: 11, tickers: ["XLY", "VCR"] },
    { name: "Imobiliário",    weight: 8,  tickers: ["XLRE", "VNQ"] },
    { name: "Energia",        weight: 7,  tickers: ["XLE", "VDE"] },
    { name: "Consumo Básico", weight: 4,  tickers: ["XLP", "VDC"] },
    { name: "Materiais",      weight: 4,  tickers: ["XLB", "VAW"] },
    { name: "Utilities",      weight: 3,  tickers: ["XLU", "VPU"] },
    { name: "Comunicação",    weight: 1,  tickers: ["XLC", "VOX"] },
  ],

  // ── Brazil ─────────────────────────────────────────────────────────────

  "^BVSP": [
    { name: "Financeiro",       weight: 26, tickers: ["ITUB4.SA", "BBDC4.SA", "BBAS3.SA"] },
    { name: "Petróleo & Gás",   weight: 14, tickers: ["PETR4.SA", "PETR3.SA", "PRIO3.SA"] },
    { name: "Mineração",        weight: 11, tickers: ["VALE3.SA", "CMIN3.SA"] },
    { name: "Utilities",        weight: 9,  tickers: ["ELET3.SA", "ELET6.SA", "CPFE3.SA"] },
    { name: "Bebidas",          weight: 6,  tickers: ["ABEV3.SA"] },
    { name: "Siderurgia",       weight: 5,  tickers: ["GGBR4.SA", "CSNA3.SA", "USIM5.SA"] },
    { name: "Saúde",            weight: 5,  tickers: ["HAPV3.SA", "RDOR3.SA", "FLRY3.SA"] },
    { name: "Frigoríficos",     weight: 5,  tickers: ["JBSS3.SA", "BRFS3.SA", "MRFG3.SA"] },
    { name: "Telecom",          weight: 4,  tickers: ["VIVT3.SA", "TIMS3.SA"] },
    { name: "Varejo",           weight: 4,  tickers: ["MGLU3.SA", "LREN3.SA", "ARZZ3.SA"] },
    { name: "Seguros",          weight: 4,  tickers: ["BBSE3.SA", "PSSA3.SA"] },
    { name: "Papel & Celulose", weight: 4,  tickers: ["SUZB3.SA", "KLBN11.SA"] },
    { name: "Tecnologia",       weight: 3,  tickers: ["TOTS3.SA", "LWSA3.SA"] },
  ],

  // ── Europe ─────────────────────────────────────────────────────────────

  "^STOXX50E": [
    { name: "Tecnologia",     weight: 16, tickers: ["ASML.AS", "SAP.DE"] },
    { name: "Luxo & Consumo", weight: 14, tickers: ["MC.PA", "CDI.PA", "KER.PA"] },
    { name: "Financeiro",     weight: 13, tickers: ["BNP.PA", "SAN.MC", "ING.AS"] },
    { name: "Saúde",          weight: 11, tickers: ["SAN.PA", "ROG.SW", "NOVO-B.CO"] },
    { name: "Industrial",     weight: 11, tickers: ["SIE.DE", "AIR.PA", "PHIA.AS"] },
    { name: "Energia",        weight: 9,  tickers: ["TTE.PA", "SHEL.AS", "ENI.MI"] },
    { name: "Químico",        weight: 6,  tickers: ["BAS.DE", "AI.PA"] },
    { name: "Seguros",        weight: 6,  tickers: ["ALV.DE", "AXA.PA", "MUV2.DE"] },
    { name: "Telecom",        weight: 5,  tickers: ["DTE.DE", "TEF.MC", "ORA.PA"] },
    { name: "Utilities",      weight: 5,  tickers: ["ENEL.MI", "IBE.MC", "ENGI.PA"] },
    { name: "Automotivo",     weight: 4,  tickers: ["MBG.DE", "BMW.DE", "VOW3.DE"] },
  ],
  "^FTSE": [
    { name: "Financeiro",     weight: 18, tickers: ["HSBA.L", "BARC.L", "LLOY.L"] },
    { name: "Energia",        weight: 13, tickers: ["SHEL.L", "BP.L", "CNE.L"] },
    { name: "Saúde",          weight: 12, tickers: ["AZN.L", "GSK.L"] },
    { name: "Consumo Básico", weight: 12, tickers: ["ULVR.L", "RKT.L", "DGE.L"] },
    { name: "Industrial",     weight: 10, tickers: ["BAE.L", "RR.L", "RS1.L"] },
    { name: "Mineração",      weight: 8,  tickers: ["RIO.L", "ANTO.L", "AAL.L"] },
    { name: "Tecnologia",     weight: 8,  tickers: ["DARK.L", "SAGE.L", "AUTO.L"] },
    { name: "Consumo Disc.",  weight: 7,  tickers: ["NXT.L", "BDEV.L"] },
    { name: "Utilities",      weight: 5,  tickers: ["NG.L", "SSE.L", "UU.L"] },
    { name: "Telecom",        weight: 4,  tickers: ["VOD.L", "BT-A.L"] },
    { name: "Imobiliário",    weight: 3,  tickers: ["SGRO.L", "LAND.L", "BLND.L"] },
  ],
  "^GDAXI": [
    { name: "Tecnologia",     weight: 22, tickers: ["SAP.DE", "IFX.DE", "AIXA.DE"] },
    { name: "Industrial",     weight: 17, tickers: ["SIE.DE", "AIR.DE"] },
    { name: "Automotivo",     weight: 12, tickers: ["MBG.DE", "BMW.DE", "VOW3.DE"] },
    { name: "Químico",        weight: 10, tickers: ["BAS.DE", "LIN.DE"] },
    { name: "Seguros",        weight: 9,  tickers: ["ALV.DE", "MUV2.DE", "HNR1.DE"] },
    { name: "Saúde",          weight: 8,  tickers: ["BAY.DE", "FRE.DE", "MRK.DE"] },
    { name: "Consumo",        weight: 7,  tickers: ["ADS.DE", "HEN3.DE", "BEI.DE"] },
    { name: "Financeiro",     weight: 6,  tickers: ["DBK.DE", "CBK.DE"] },
    { name: "Energia",        weight: 5,  tickers: ["EOAN.DE", "RWE.DE"] },
    { name: "Telecom",        weight: 4,  tickers: ["DTE.DE", "1U1.DE"] },
  ],
  "^FCHI": [
    { name: "Luxo",           weight: 20, tickers: ["MC.PA", "CDI.PA", "KER.PA"] },
    { name: "Energia",        weight: 13, tickers: ["TTE.PA", "ENGI.PA"] },
    { name: "Saúde",          weight: 11, tickers: ["SAN.PA", "EL.PA"] },
    { name: "Financeiro",     weight: 10, tickers: ["BNP.PA", "GLE.PA", "ACA.PA"] },
    { name: "Industrial",     weight: 10, tickers: ["AIR.PA", "SGO.PA", "DG.PA"] },
    { name: "Consumo",        weight: 9,  tickers: ["OR.PA", "RI.PA", "SW.PA"] },
    { name: "Tecnologia",     weight: 8,  tickers: ["CAP.PA", "STM.PA", "DSY.PA"] },
    { name: "Materiais",      weight: 6,  tickers: ["AI.PA", "ML.PA"] },
    { name: "Utilities",      weight: 5,  tickers: ["ENGI.PA", "VIE.PA"] },
    { name: "Telecom",        weight: 4,  tickers: ["ORA.PA", "VIV.PA"] },
    { name: "Automotivo",     weight: 4,  tickers: ["RNO.PA", "UG.PA"] },
  ],

  // ── Japan ──────────────────────────────────────────────────────────────

  "^N225": [
    { name: "Tecnologia",     weight: 23, tickers: ["6758.T", "6861.T", "6902.T"] },
    { name: "Consumo Disc.",  weight: 17, tickers: ["7203.T", "7267.T", "9983.T"] },
    { name: "Industrial",     weight: 13, tickers: ["6501.T", "6301.T", "7011.T"] },
    { name: "Saúde",          weight: 11, tickers: ["4502.T", "4503.T", "4568.T"] },
    { name: "Financeiro",     weight: 8,  tickers: ["8306.T", "8316.T", "8411.T"] },
    { name: "Comunicação",    weight: 7,  tickers: ["9432.T", "9433.T", "9984.T"] },
    { name: "Materiais",      weight: 6,  tickers: ["4063.T", "4188.T"] },
    { name: "Consumo Básico", weight: 5,  tickers: ["2914.T", "2502.T"] },
    { name: "Imobiliário",    weight: 4,  tickers: ["8801.T", "8802.T"] },
    { name: "Utilities",      weight: 3,  tickers: ["9501.T", "9502.T"] },
    { name: "Energia",        weight: 3,  tickers: ["5020.T", "5019.T"] },
  ],

  // ── China / HK ─────────────────────────────────────────────────────────

  "^HSI": [
    { name: "Financeiro",   weight: 34, tickers: ["0005.HK", "1398.HK", "2318.HK"] },
    { name: "Tecnologia",   weight: 24, tickers: ["0700.HK", "9618.HK", "3690.HK"] },
    { name: "Imobiliário",  weight: 10, tickers: ["0016.HK", "0001.HK", "0017.HK"] },
    { name: "Consumo",      weight: 8,  tickers: ["9988.HK", "9999.HK", "2020.HK"] },
    { name: "Energia",      weight: 6,  tickers: ["0883.HK", "0857.HK", "0386.HK"] },
    { name: "Industrial",   weight: 5,  tickers: ["2313.HK", "0669.HK"] },
    { name: "Saúde",        weight: 4,  tickers: ["1177.HK", "2269.HK"] },
    { name: "Telecom",      weight: 4,  tickers: ["0941.HK", "0728.HK"] },
    { name: "Utilities",    weight: 3,  tickers: ["0002.HK", "0003.HK", "0006.HK"] },
    { name: "Materiais",    weight: 2,  tickers: ["0914.HK", "2600.HK"] },
  ],

  // ── Korea ──────────────────────────────────────────────────────────────

  "^KS11": [
    { name: "Tecnologia",   weight: 35, tickers: ["005930.KS", "000660.KS"] },
    { name: "Automotivo",   weight: 12, tickers: ["005380.KS", "012330.KS"] },
    { name: "Químico",      weight: 10, tickers: ["051910.KS", "096770.KS"] },
    { name: "Financeiro",   weight: 10, tickers: ["105560.KS", "055550.KS"] },
    { name: "Baterias",     weight: 8,  tickers: ["373220.KS", "006400.KS"] },
    { name: "Bio & Saúde",  weight: 7,  tickers: ["207940.KS", "068270.KS"] },
    { name: "Internet",     weight: 6,  tickers: ["035420.KS", "035720.KS"] },
    { name: "Aço",          weight: 4,  tickers: ["005490.KS"] },
    { name: "Telecom",      weight: 4,  tickers: ["017670.KS", "030200.KS"] },
    { name: "Consumo",      weight: 4,  tickers: ["051900.KS"] },
  ],

  // ── Taiwan ─────────────────────────────────────────────────────────────

  "^TWII": [
    { name: "Semicondutores", weight: 42, tickers: ["2330.TW", "2303.TW", "3711.TW"] },
    { name: "Eletrônicos",    weight: 14, tickers: ["2317.TW", "2382.TW", "2454.TW"] },
    { name: "Financeiro",     weight: 13, tickers: ["2881.TW", "2882.TW", "2891.TW"] },
    { name: "Telecom",        weight: 5,  tickers: ["2412.TW", "3045.TW"] },
    { name: "Plásticos",      weight: 5,  tickers: ["1301.TW", "1303.TW"] },
    { name: "Alimentos",      weight: 4,  tickers: ["1216.TW", "1229.TW"] },
    { name: "Transporte",     weight: 4,  tickers: ["2603.TW", "2609.TW"] },
    { name: "Cimento",        weight: 3,  tickers: ["1101.TW", "1102.TW"] },
    { name: "Têxtil",         weight: 3,  tickers: ["1476.TW"] },
    { name: "Outros",         weight: 7,  tickers: ["2308.TW", "3008.TW"] },
  ],

  // ── India ──────────────────────────────────────────────────────────────

  "^BSESN": [
    { name: "Financeiro",     weight: 26, tickers: ["HDFCBANK.NS", "ICICIBANK.NS", "KOTAKBANK.NS"] },
    { name: "TI",             weight: 15, tickers: ["TCS.NS", "INFY.NS", "WIPRO.NS"] },
    { name: "Energia",        weight: 12, tickers: ["RELIANCE.NS", "ONGC.NS"] },
    { name: "Consumo",        weight: 10, tickers: ["HINDUNILVR.NS", "ITC.NS", "NESTLEIND.NS"] },
    { name: "Automotivo",     weight: 7,  tickers: ["TATAMOTORS.NS", "MARUTI.NS", "M&M.NS"] },
    { name: "Farmacêutico",   weight: 6,  tickers: ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS"] },
    { name: "Cimento",        weight: 5,  tickers: ["ULTRACEMCO.NS", "SHREECEM.NS"] },
    { name: "Telecom",        weight: 5,  tickers: ["BHARTIARTL.NS", "IDEA.NS"] },
    { name: "Metais",         weight: 4,  tickers: ["TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS"] },
    { name: "Utilities",      weight: 4,  tickers: ["NTPC.NS", "POWERGRID.NS"] },
    { name: "Imobiliário",    weight: 3,  tickers: ["DLF.NS", "GODREJPROP.NS"] },
    { name: "Tabaco",         weight: 3,  tickers: ["ITC.NS"] },
  ],

  // ── Oceania ────────────────────────────────────────────────────────────

  "^AXJO": [
    { name: "Financeiro",  weight: 28, tickers: ["CBA.AX", "NAB.AX", "ANZ.AX", "WBC.AX"] },
    { name: "Mineração",   weight: 20, tickers: ["BHP.AX", "RIO.AX", "FMG.AX"] },
    { name: "Saúde",       weight: 10, tickers: ["CSL.AX", "RMD.AX", "COH.AX"] },
    { name: "Imobiliário", weight: 7,  tickers: ["GMG.AX", "MGR.AX", "SCG.AX"] },
    { name: "Consumo",     weight: 7,  tickers: ["WES.AX", "WOW.AX", "COL.AX"] },
    { name: "Energia",     weight: 6,  tickers: ["WDS.AX", "STO.AX", "ORG.AX"] },
    { name: "Tecnologia",  weight: 5,  tickers: ["XRO.AX", "WTC.AX", "CPU.AX"] },
    { name: "Industrial",  weight: 5,  tickers: ["TCL.AX", "BXB.AX"] },
    { name: "Telecom",     weight: 4,  tickers: ["TLS.AX", "TPG.AX"] },
    { name: "Utilities",   weight: 4,  tickers: ["AGL.AX", "APA.AX"] },
    { name: "Materiais",   weight: 4,  tickers: ["JHX.AX", "AMC.AX", "ORA.AX"] },
  ],
};

// Nifty 50 shares the same structure as Sensex
SECTOR_MAP["^NSEI"] = SECTOR_MAP["^BSESN"];

// ── Regional fallback templates ──────────────────────────────────────────
// Used when an index isn't in SECTOR_MAP. Uses diversified, liquid tickers.

const REGIONAL_FALLBACK: Record<Region, SectorDef[]> = {
  us: SECTOR_MAP["^GSPC"],
  brazil: SECTOR_MAP["^BVSP"],
  europe: SECTOR_MAP["^STOXX50E"],
  japan: SECTOR_MAP["^N225"],
  china: SECTOR_MAP["^HSI"],
  korea: SECTOR_MAP["^KS11"],
  taiwan: SECTOR_MAP["^TWII"],
  india: SECTOR_MAP["^BSESN"],
  oceania: SECTOR_MAP["^AXJO"],
  canada: [
    { name: "Financeiro",  weight: 31, tickers: ["RY.TO", "TD.TO", "BNS.TO"] },
    { name: "Energia",     weight: 17, tickers: ["CNQ.TO", "SU.TO", "ENB.TO"] },
    { name: "Mineração",   weight: 12, tickers: ["ABX.TO", "NTR.TO", "TECK-B.TO"] },
    { name: "Industrial",  weight: 10, tickers: ["CNR.TO", "CP.TO", "WSP.TO"] },
    { name: "Tecnologia",  weight: 8,  tickers: ["SHOP.TO", "CSU.TO", "OTEX.TO"] },
    { name: "Consumo",     weight: 7,  tickers: ["ATD.TO", "L.TO", "MRU.TO"] },
    { name: "Telecom",     weight: 5,  tickers: ["BCE.TO", "T.TO", "RCI-B.TO"] },
    { name: "Utilities",   weight: 4,  tickers: ["FTS.TO", "EMA.TO", "H.TO"] },
    { name: "Saúde",       weight: 3,  tickers: ["WELL.TO"] },
    { name: "Imobiliário", weight: 3,  tickers: ["BAM.TO", "BPY-UN.TO"] },
  ],
  latam: [
    { name: "Financeiro",     weight: 22, tickers: ["BSMX.MX", "GFNORTEO.MX", "ITUB4.SA"] },
    { name: "Mineração",      weight: 15, tickers: ["GMEXICOB.MX", "VALE3.SA"] },
    { name: "Consumo",        weight: 14, tickers: ["WALMEX.MX", "AC.MX", "ABEV3.SA"] },
    { name: "Telecom",        weight: 11, tickers: ["AMXB.MX", "TLEVICPO.MX", "VIVT3.SA"] },
    { name: "Materiais",      weight: 10, tickers: ["CEMEXCPO.MX", "ORBIA.MX"] },
    { name: "Energia",        weight: 8,  tickers: ["PETR4.SA", "EC.MX"] },
    { name: "Industrial",     weight: 7,  tickers: ["FEMSAUBD.MX", "BIMBOA.MX"] },
    { name: "Utilities",      weight: 5,  tickers: ["ELET3.SA", "IENOVA.MX"] },
    { name: "Aeroportos",     weight: 4,  tickers: ["ASURB.MX", "OMAB.MX"] },
    { name: "Saúde",          weight: 4,  tickers: ["LABB.MX", "HAPV3.SA"] },
  ],
  asean: [
    { name: "Financeiro",  weight: 30, tickers: ["D05.SI", "O39.SI", "U11.SI"] },
    { name: "Telecom",     weight: 12, tickers: ["Z74.SI", "ADVANC.BK", "TLKM.JK"] },
    { name: "Imobiliário", weight: 11, tickers: ["C09.SI", "A17U.SI", "LPN.BK"] },
    { name: "Consumo",     weight: 10, tickers: ["F34.SI", "CPALL.BK", "ICBP.JK"] },
    { name: "Energia",     weight: 8,  tickers: ["PTT.BK", "PTTEP.BK", "ADRO.JK"] },
    { name: "Industrial",  weight: 8,  tickers: ["BN4.SI", "SCC.BK", "SMGR.JK"] },
    { name: "Transporte",  weight: 6,  tickers: ["S58.SI", "AOT.BK"] },
    { name: "Saúde",       weight: 5,  tickers: ["BDMS.BK", "Q0F.SI"] },
    { name: "Tecnologia",  weight: 5,  tickers: ["GOTO.JK", "SE"] },
    { name: "Utilities",   weight: 5,  tickers: ["GULF.BK", "RATCH.BK"] },
  ],
  mideast: [
    { name: "Tecnologia",  weight: 20, tickers: ["CHKP", "NICE", "CYBR"] },
    { name: "Farmacêutico",weight: 15, tickers: ["TEVA", "TARO"] },
    { name: "Financeiro",  weight: 14, tickers: ["LUMI.TA", "DSCT.TA", "POLI.TA"] },
    { name: "Químico",     weight: 10, tickers: ["ICL", "AMCR.TA"] },
    { name: "Imobiliário", weight: 9,  tickers: ["AZRG.TA", "MGDL.TA"] },
    { name: "Consumo",     weight: 8,  tickers: ["SHUFERSAL.TA", "FOX.TA"] },
    { name: "Energia",     weight: 7,  tickers: ["DLEKG.TA", "ORA.TA"] },
    { name: "Industrial",  weight: 7,  tickers: ["ELCO.TA", "FTAL.TA"] },
    { name: "Telecom",     weight: 5,  tickers: ["BEZQ.TA", "CEL.TA"] },
    { name: "Defesa",      weight: 5,  tickers: ["ESLT", "ELBIT.TA"] },
  ],
  africa: [
    { name: "Mineração",      weight: 25, tickers: ["AGL.JO", "ANG.JO", "IMP.JO"] },
    { name: "Financeiro",     weight: 22, tickers: ["FSR.JO", "SBK.JO", "NED.JO"] },
    { name: "Consumo",        weight: 12, tickers: ["NPN.JO", "BTI.JO", "APN.JO"] },
    { name: "Saúde",          weight: 8,  tickers: ["DSY.JO", "NHC.JO"] },
    { name: "Telecom",        weight: 8,  tickers: ["MTN.JO", "VOD.JO", "TKG.JO"] },
    { name: "Energia",        weight: 7,  tickers: ["SOL.JO", "SSW.JO"] },
    { name: "Varejo",         weight: 6,  tickers: ["SHP.JO", "WHL.JO", "PIK.JO"] },
    { name: "Industrial",     weight: 5,  tickers: ["BID.JO", "BAW.JO"] },
    { name: "Químico",        weight: 4,  tickers: ["SOL.JO", "OMN.JO"] },
    { name: "Imobiliário",    weight: 3,  tickers: ["GRT.JO", "RDF.JO"] },
  ],
};

// ── Fetch helper with per-ticker fallback ────────────────────────────────

async function resolveChanges(
  sectors: SectorDef[],
): Promise<SectorData[]> {
  const allTickers = [...new Set(sectors.flatMap(s => s.tickers))];

  const { quotes } = await fetchQuotes(allTickers);

  return sectors.map(s => {
    let resolved: { changePct: number; ticker: string; fallback: boolean } | null = null;

    for (let i = 0; i < s.tickers.length; i++) {
      const q = quotes[s.tickers[i]];
      if (q && q.price > 0) {
        resolved = {
          changePct: q.changePercent ?? 0,
          ticker: s.tickers[i],
          fallback: i > 0,
        };
        break;
      }
    }

    return {
      name: s.name,
      weight: s.weight,
      changePct: resolved?.changePct ?? 0,
      ticker: resolved?.ticker ?? s.tickers[0],
      fallback: resolved?.fallback ?? true,
    };
  });
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  if (symbol === "^VIX") {
    return NextResponse.json({ symbol, sectors: [], available: false });
  }

  let sectors = SECTOR_MAP[symbol];
  let isFallback = false;

  if (!sectors) {
    const region = INDEX_REGION[symbol];
    if (region && REGIONAL_FALLBACK[region]) {
      sectors = REGIONAL_FALLBACK[region];
      isFallback = true;
    }
  }

  if (!sectors) {
    return NextResponse.json({ symbol, sectors: [], available: false }, {
      headers: { "Cache-Control": "s-maxage=3600" },
    });
  }

  try {
    const result = await resolveChanges(sectors);

    const resolved = result.filter(s => s.changePct !== 0).length;

    return NextResponse.json({
      symbol,
      sectors: result,
      available: true,
      regional: isFallback,
      resolved,
      total: result.length,
    }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=120" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
