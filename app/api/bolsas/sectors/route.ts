import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface SectorDef {
  name: string;
  weight: number;
  ticker: string;
}

const SECTOR_MAP: Record<string, SectorDef[]> = {
  "^GSPC": [
    { name: "Tecnologia", weight: 31, ticker: "XLK" },
    { name: "Financeiro", weight: 13, ticker: "XLF" },
    { name: "Saúde", weight: 12, ticker: "XLV" },
    { name: "Consumo Disc.", weight: 10, ticker: "XLY" },
    { name: "Comunicação", weight: 9, ticker: "XLC" },
    { name: "Industrial", weight: 8, ticker: "XLI" },
    { name: "Consumo Básico", weight: 6, ticker: "XLP" },
    { name: "Energia", weight: 4, ticker: "XLE" },
    { name: "Utilities", weight: 3, ticker: "XLU" },
    { name: "Imobiliário", weight: 2, ticker: "XLRE" },
    { name: "Materiais", weight: 2, ticker: "XLB" },
  ],
  "^DJI": [
    { name: "Tecnologia", weight: 22, ticker: "XLK" },
    { name: "Saúde", weight: 18, ticker: "XLV" },
    { name: "Financeiro", weight: 16, ticker: "XLF" },
    { name: "Industrial", weight: 14, ticker: "XLI" },
    { name: "Consumo Disc.", weight: 13, ticker: "XLY" },
    { name: "Consumo Básico", weight: 7, ticker: "XLP" },
    { name: "Energia", weight: 4, ticker: "XLE" },
    { name: "Comunicação", weight: 3, ticker: "XLC" },
    { name: "Materiais", weight: 2, ticker: "XLB" },
    { name: "Utilities", weight: 1, ticker: "XLU" },
  ],
  "^IXIC": [
    { name: "Tecnologia", weight: 49, ticker: "XLK" },
    { name: "Comunicação", weight: 16, ticker: "XLC" },
    { name: "Consumo Disc.", weight: 13, ticker: "XLY" },
    { name: "Saúde", weight: 8, ticker: "XLV" },
    { name: "Industrial", weight: 5, ticker: "XLI" },
    { name: "Financeiro", weight: 4, ticker: "XLF" },
    { name: "Consumo Básico", weight: 3, ticker: "XLP" },
    { name: "Utilities", weight: 1, ticker: "XLU" },
    { name: "Energia", weight: 1, ticker: "XLE" },
  ],
  "^RUT": [
    { name: "Saúde", weight: 17, ticker: "XLV" },
    { name: "Industrial", weight: 16, ticker: "XLI" },
    { name: "Financeiro", weight: 16, ticker: "XLF" },
    { name: "Tecnologia", weight: 13, ticker: "XLK" },
    { name: "Consumo Disc.", weight: 11, ticker: "XLY" },
    { name: "Imobiliário", weight: 8, ticker: "XLRE" },
    { name: "Energia", weight: 7, ticker: "XLE" },
    { name: "Consumo Básico", weight: 4, ticker: "XLP" },
    { name: "Materiais", weight: 4, ticker: "XLB" },
    { name: "Utilities", weight: 3, ticker: "XLU" },
    { name: "Comunicação", weight: 1, ticker: "XLC" },
  ],
  "^BVSP": [
    { name: "Financeiro", weight: 26, ticker: "ITUB4.SA" },
    { name: "Petróleo & Gás", weight: 14, ticker: "PETR4.SA" },
    { name: "Mineração", weight: 11, ticker: "VALE3.SA" },
    { name: "Utilities", weight: 9, ticker: "ELET3.SA" },
    { name: "Bebidas", weight: 6, ticker: "ABEV3.SA" },
    { name: "Siderurgia", weight: 5, ticker: "GGBR4.SA" },
    { name: "Saúde", weight: 5, ticker: "HAPV3.SA" },
    { name: "Telecom", weight: 4, ticker: "VIVT3.SA" },
    { name: "Frigoríficos", weight: 5, ticker: "JBSS3.SA" },
    { name: "Varejo", weight: 4, ticker: "MGLU3.SA" },
    { name: "Seguros", weight: 4, ticker: "BBSE3.SA" },
    { name: "Papel & Celulose", weight: 4, ticker: "SUZB3.SA" },
    { name: "Tecnologia", weight: 3, ticker: "TOTS3.SA" },
  ],
  "^FTSE": [
    { name: "Financeiro", weight: 18, ticker: "HSBA.L" },
    { name: "Energia", weight: 13, ticker: "SHEL.L" },
    { name: "Saúde", weight: 12, ticker: "AZN.L" },
    { name: "Consumo Básico", weight: 12, ticker: "ULVR.L" },
    { name: "Industrial", weight: 10, ticker: "BAE.L" },
    { name: "Mineração", weight: 8, ticker: "RIO.L" },
    { name: "Consumo Disc.", weight: 7, ticker: "DGE.L" },
    { name: "Utilities", weight: 5, ticker: "NG.L" },
    { name: "Telecom", weight: 4, ticker: "VOD.L" },
    { name: "Imobiliário", weight: 3, ticker: "SGRO.L" },
    { name: "Tecnologia", weight: 8, ticker: "DARK.L" },
  ],
  "^GDAXI": [
    { name: "Tecnologia", weight: 22, ticker: "SAP.DE" },
    { name: "Industrial", weight: 17, ticker: "SIE.DE" },
    { name: "Automotivo", weight: 12, ticker: "MBG.DE" },
    { name: "Químico", weight: 10, ticker: "BAS.DE" },
    { name: "Seguros", weight: 9, ticker: "ALV.DE" },
    { name: "Saúde", weight: 8, ticker: "BAY.DE" },
    { name: "Consumo", weight: 7, ticker: "ADS.DE" },
    { name: "Financeiro", weight: 6, ticker: "DBK.DE" },
    { name: "Energia", weight: 5, ticker: "EOAN.DE" },
    { name: "Telecom", weight: 4, ticker: "DTE.DE" },
  ],
  "^FCHI": [
    { name: "Luxo", weight: 20, ticker: "MC.PA" },
    { name: "Energia", weight: 13, ticker: "TTE.PA" },
    { name: "Saúde", weight: 11, ticker: "SAN.PA" },
    { name: "Financeiro", weight: 10, ticker: "BNP.PA" },
    { name: "Industrial", weight: 10, ticker: "AIR.PA" },
    { name: "Consumo", weight: 9, ticker: "OR.PA" },
    { name: "Tecnologia", weight: 8, ticker: "CAP.PA" },
    { name: "Materiais", weight: 6, ticker: "AI.PA" },
    { name: "Utilities", weight: 5, ticker: "ENGI.PA" },
    { name: "Telecom", weight: 4, ticker: "ORA.PA" },
    { name: "Automotivo", weight: 4, ticker: "RNO.PA" },
  ],
  "^N225": [
    { name: "Tecnologia", weight: 23, ticker: "6758.T" },
    { name: "Consumo Disc.", weight: 17, ticker: "7203.T" },
    { name: "Saúde", weight: 11, ticker: "4502.T" },
    { name: "Industrial", weight: 13, ticker: "6501.T" },
    { name: "Financeiro", weight: 8, ticker: "8306.T" },
    { name: "Comunicação", weight: 7, ticker: "9432.T" },
    { name: "Materiais", weight: 6, ticker: "4063.T" },
    { name: "Consumo Básico", weight: 5, ticker: "2914.T" },
    { name: "Imobiliário", weight: 4, ticker: "8801.T" },
    { name: "Utilities", weight: 3, ticker: "9501.T" },
    { name: "Energia", weight: 3, ticker: "5020.T" },
  ],
  "^HSI": [
    { name: "Financeiro", weight: 34, ticker: "0005.HK" },
    { name: "Tecnologia", weight: 24, ticker: "0700.HK" },
    { name: "Imobiliário", weight: 10, ticker: "0016.HK" },
    { name: "Consumo", weight: 8, ticker: "9988.HK" },
    { name: "Energia", weight: 6, ticker: "0883.HK" },
    { name: "Industrial", weight: 5, ticker: "2313.HK" },
    { name: "Saúde", weight: 4, ticker: "1177.HK" },
    { name: "Telecom", weight: 4, ticker: "0941.HK" },
    { name: "Utilities", weight: 3, ticker: "0002.HK" },
    { name: "Materiais", weight: 2, ticker: "0914.HK" },
  ],
  "^STOXX50E": [
    { name: "Tecnologia", weight: 16, ticker: "ASML.AS" },
    { name: "Luxo & Consumo", weight: 14, ticker: "MC.PA" },
    { name: "Financeiro", weight: 13, ticker: "BNP.PA" },
    { name: "Saúde", weight: 11, ticker: "SAN.PA" },
    { name: "Industrial", weight: 11, ticker: "SIE.DE" },
    { name: "Energia", weight: 9, ticker: "TTE.PA" },
    { name: "Químico", weight: 6, ticker: "BAS.DE" },
    { name: "Seguros", weight: 6, ticker: "ALV.DE" },
    { name: "Telecom", weight: 5, ticker: "DTE.DE" },
    { name: "Utilities", weight: 5, ticker: "ENEL.MI" },
    { name: "Automotivo", weight: 4, ticker: "MBG.DE" },
  ],
  "^AXJO": [
    { name: "Financeiro", weight: 28, ticker: "CBA.AX" },
    { name: "Mineração", weight: 20, ticker: "BHP.AX" },
    { name: "Saúde", weight: 10, ticker: "CSL.AX" },
    { name: "Imobiliário", weight: 7, ticker: "GMG.AX" },
    { name: "Consumo", weight: 7, ticker: "WES.AX" },
    { name: "Energia", weight: 6, ticker: "WDS.AX" },
    { name: "Tecnologia", weight: 5, ticker: "XRO.AX" },
    { name: "Industrial", weight: 5, ticker: "TCL.AX" },
    { name: "Telecom", weight: 4, ticker: "TLS.AX" },
    { name: "Utilities", weight: 4, ticker: "AGL.AX" },
    { name: "Materiais", weight: 4, ticker: "JHX.AX" },
  ],
  "^KS11": [
    { name: "Tecnologia", weight: 35, ticker: "005930.KS" },
    { name: "Automotivo", weight: 12, ticker: "005380.KS" },
    { name: "Químico", weight: 10, ticker: "051910.KS" },
    { name: "Financeiro", weight: 10, ticker: "105560.KS" },
    { name: "Baterias", weight: 8, ticker: "373220.KS" },
    { name: "Bio & Saúde", weight: 7, ticker: "207940.KS" },
    { name: "Internet", weight: 6, ticker: "035420.KS" },
    { name: "Aço", weight: 4, ticker: "005490.KS" },
    { name: "Telecom", weight: 4, ticker: "017670.KS" },
    { name: "Consumo", weight: 4, ticker: "051900.KS" },
  ],
  "^TWII": [
    { name: "Semicondutores", weight: 42, ticker: "2330.TW" },
    { name: "Eletrônicos", weight: 14, ticker: "2317.TW" },
    { name: "Financeiro", weight: 13, ticker: "2881.TW" },
    { name: "Telecom", weight: 5, ticker: "2412.TW" },
    { name: "Plásticos", weight: 5, ticker: "1301.TW" },
    { name: "Alimentos", weight: 4, ticker: "1216.TW" },
    { name: "Transporte", weight: 4, ticker: "2603.TW" },
    { name: "Cimento", weight: 3, ticker: "1101.TW" },
    { name: "Têxtil", weight: 3, ticker: "1476.TW" },
    { name: "Outros", weight: 7, ticker: "2308.TW" },
  ],
  "^BSESN": [
    { name: "Financeiro", weight: 26, ticker: "HDFCBANK.NS" },
    { name: "TI", weight: 15, ticker: "TCS.NS" },
    { name: "Energia", weight: 12, ticker: "RELIANCE.NS" },
    { name: "Consumo", weight: 10, ticker: "HINDUNILVR.NS" },
    { name: "Automotivo", weight: 7, ticker: "TATAMOTORS.NS" },
    { name: "Farmacêutico", weight: 6, ticker: "SUNPHARMA.NS" },
    { name: "Cimento", weight: 5, ticker: "ULTRACEMCO.NS" },
    { name: "Telecom", weight: 5, ticker: "BHARTIARTL.NS" },
    { name: "Metais", weight: 4, ticker: "TATASTEEL.NS" },
    { name: "Utilities", weight: 4, ticker: "NTPC.NS" },
    { name: "Imobiliário", weight: 3, ticker: "DLF.NS" },
    { name: "Tabaco", weight: 3, ticker: "ITC.NS" },
  ],
};

export interface SectorData {
  name: string;
  weight: number;
  changePct: number;
  ticker: string;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const sectors = SECTOR_MAP[symbol];
  if (!sectors) {
    return NextResponse.json({ symbol, sectors: [], available: false }, {
      headers: { "Cache-Control": "s-maxage=3600" },
    });
  }

  try {
    const tickers = [...new Set(sectors.map(s => s.ticker))];
    const { quotes } = await fetchQuotes(tickers);

    const result: SectorData[] = sectors.map(s => {
      const q = quotes[s.ticker];
      return {
        name: s.name,
        weight: s.weight,
        changePct: q?.changePercent ?? 0,
        ticker: s.ticker,
      };
    });

    return NextResponse.json({ symbol, sectors: result, available: true }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=120" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
