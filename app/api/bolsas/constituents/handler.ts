import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export interface ConstituentData {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
}

type Region = "us" | "brazil" | "argentina" | "mexico" | "chile" | "europe_core" | "uk" | "germany" | "france" | "japan" | "china_hk" | "china_sh" | "korea" | "taiwan" | "india" | "canada" | "australia" | "spain" | "italy" | "switzerland" | "netherlands" | "nordic" | "asean_sg" | "mideast" | "africa";

const INDEX_REGION: Record<string, Region> = {
  "^GSPC": "us", "^DJI": "us", "^IXIC": "us", "^RUT": "us",
  "^BVSP": "brazil",
  "^GSPTSE": "canada",
  "^STOXX50E": "europe_core",
  "^FTSE": "uk",
  "^GDAXI": "germany",
  "^FCHI": "france",
  "^IBEX": "spain",
  "FTSEMIB.MI": "italy",
  "^SSMI": "switzerland",
  "^AEX": "netherlands",
  "^OMXS30": "nordic", "^OMXC25": "nordic", "^OMXHPI": "nordic", "^OSEAX": "nordic",
  "^N225": "japan",
  "^HSI": "china_hk",
  "000001.SS": "china_sh", "399001.SZ": "china_sh",
  "^KS11": "korea",
  "^TWII": "taiwan",
  "^BSESN": "india", "^NSEI": "india",
  "^AXJO": "australia", "^NZ50": "australia",
  "^STI": "asean_sg", "^JKSE": "asean_sg", "^KLSE": "asean_sg", "^SET.BK": "asean_sg",
  "^TA125.TA": "mideast",
  "^J203.JO": "africa", "^CASE30": "africa",
  "^MXX": "mexico", "^MERV": "argentina", "^IPSA": "chile",
  "^ATX": "europe_core", "^BFX": "europe_core", "PSI20.LS": "europe_core",
  "^WIG20": "europe_core", "XU100.IS": "europe_core", "IMOEX.ME": "europe_core",
};

const CONSTITUENTS: Record<Region, string[]> = {
  us: [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "BRK-B", "TSLA",
    "UNH", "LLY", "JPM", "V", "AVGO", "XOM", "MA", "JNJ",
    "PG", "COST", "HD", "ABBV",
  ],
  brazil: [
    "PETR4.SA", "VALE3.SA", "ITUB4.SA", "BBDC4.SA", "BBAS3.SA", "B3SA3.SA",
    "ABEV3.SA", "WEGE3.SA", "RENT3.SA", "SUZB3.SA", "ELET3.SA", "JBSS3.SA",
    "HAPV3.SA", "RDOR3.SA", "GGBR4.SA", "VIVT3.SA", "TOTS3.SA", "LREN3.SA",
    "PRIO3.SA", "RADL3.SA",
  ],
  argentina: [
    "GGAL.BA", "YPFD.BA", "PAMP.BA", "BMA.BA", "BBAR.BA", "CEPU.BA",
    "ALUA.BA", "TXAR.BA", "TGSU2.BA", "TGNO4.BA", "TECO2.BA", "TRAN.BA",
    "EDN.BA", "LOMA.BA", "MIRG.BA", "SUPV.BA", "COME.BA", "CRES.BA",
    "VALO.BA", "BYMA.BA",
  ],
  mexico: [
    "AMXB.MX", "WALMEX.MX", "FEMSAUBD.MX", "GFNORTEO.MX", "GMEXICOB.MX",
    "CEMEXCPO.MX", "BIMBOA.MX", "TLEVISACPO.MX", "KIMBERA.MX", "ALSEA.MX",
    "GAPB.MX", "ASURB.MX", "OMAB.MX", "PINFRA.MX", "GRUMAB.MX",
    "AC.MX", "KOFUBL.MX", "ORBIA.MX", "ELEKTRA.MX", "LABB.MX",
  ],
  chile: [
    "SQM-B.SN", "FALABELLA.SN", "CENCOSUD.SN", "COPEC.SN", "CMPC.SN",
    "BSANTANDER.SN", "CHILE.SN", "BCI.SN", "ENELCHILE.SN", "ENELAM.SN",
    "COLBUN.SN", "CCU.SN", "ANDINA-B.SN", "PARAUCO.SN", "VAPORES.SN",
    "AGUAS-A.SN", "ENTEL.SN", "RIPLEY.SN", "CAP.SN", "LTM.SN",
  ],
  canada: [
    "RY.TO", "TD.TO", "BNS.TO", "ENB.TO", "CNR.TO", "CP.TO",
    "BMO.TO", "CNQ.TO", "SHOP.TO", "SU.TO", "ATD.TO", "MFC.TO",
    "NTR.TO", "TRI.TO", "CSU.TO", "ABX.TO", "BCE.TO", "FTS.TO",
    "WCN.TO", "QSR.TO",
  ],
  uk: [
    "SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L", "GSK.L",
    "RIO.L", "BAT.L", "DGE.L", "LSEG.L", "REL.L", "NG.L",
    "VOD.L", "BAE.L", "BARC.L", "LLOY.L", "NXT.L", "RR.L",
    "ABF.L", "SSE.L",
  ],
  germany: [
    "SAP.DE", "SIE.DE", "ALV.DE", "MBG.DE", "DTE.DE", "BAS.DE",
    "MUV2.DE", "BMW.DE", "IFX.DE", "ADS.DE", "BAY.DE", "VOW3.DE",
    "DBK.DE", "HEN3.DE", "EOAN.DE", "RWE.DE", "FRE.DE", "BEI.DE",
    "MTX.DE", "SHL.DE",
  ],
  france: [
    "MC.PA", "TTE.PA", "SAN.PA", "AIR.PA", "BNP.PA", "OR.PA",
    "SU.PA", "AI.PA", "CS.PA", "DG.PA", "KER.PA", "CAP.PA",
    "SGO.PA", "GLE.PA", "RI.PA", "ACA.PA", "ORA.PA", "ENGI.PA",
    "DSY.PA", "VIV.PA",
  ],
  spain: [
    "SAN.MC", "IBE.MC", "ITX.MC", "TEF.MC", "BBVA.MC", "AMS.MC",
    "FER.MC", "REP.MC", "CABK.MC", "RED.MC", "ACS.MC", "GRF.MC",
    "ENG.MC", "MAP.MC", "ELE.MC", "CLNX.MC", "IAG.MC", "VIS.MC",
    "ACX.MC", "MTS.MC",
  ],
  italy: [
    "ENEL.MI", "ISP.MI", "UCG.MI", "ENI.MI", "STM.MI", "RACE.MI",
    "G.MI", "TEN.MI", "STLA.MI", "PST.MI", "SRG.MI", "CNHI.MI",
    "PRY.MI", "A2A.MI", "BGN.MI", "BAMI.MI", "CPR.MI", "HER.MI",
    "SPM.MI", "MB.MI",
  ],
  switzerland: [
    "NESN.SW", "ROG.SW", "NOVN.SW", "UBSG.SW", "CSGN.SW", "ABB.SW",
    "ZURN.SW", "SREN.SW", "GEBN.SW", "SIKA.SW", "LONN.SW", "SCMN.SW",
    "PGHN.SW", "SLHN.SW", "BAER.SW", "GIVN.SW", "SOON.SW", "ALC.SW",
    "STMN.SW", "BARN.SW",
  ],
  netherlands: [
    "ASML.AS", "SHEL.AS", "UNA.AS", "PRX.AS", "INGA.AS", "PHIA.AS",
    "ADYEN.AS", "HEIA.AS", "WKL.AS", "ASM.AS", "NN.AS", "AD.AS",
    "AKZA.AS", "DSM.AS", "REN.AS", "UMG.AS", "RAND.AS", "IMCD.AS",
    "BESI.AS", "KPN.AS",
  ],
  nordic: [
    "NOVO-B.CO", "NFLX.CO", "MAERSK-B.CO", "ERIC-B.ST", "VOLV-B.ST",
    "ATCO-A.ST", "SAND.ST", "HEXA-B.ST", "INVE-B.ST", "ABB.ST",
    "NESTE.HE", "SAMPO.HE", "NOKIA.HE", "UPM.HE", "FORTUM.HE",
    "EQNR.OL", "DNB.OL", "TEL.OL", "MOWI.OL", "ORK.OL",
  ],
  europe_core: [
    "ASML.AS", "MC.PA", "SAP.DE", "SIE.DE", "TTE.PA", "SAN.PA",
    "ALV.DE", "AIR.PA", "BNP.PA", "SU.PA", "OR.PA", "DTE.DE",
    "BAS.DE", "ENEL.MI", "MBG.DE", "IBE.MC", "ING.AS", "ABI.BR",
    "UCG.MI", "PHIA.AS",
  ],
  japan: [
    "7203.T", "6758.T", "6861.T", "9984.T", "8306.T", "9432.T",
    "4502.T", "6501.T", "7267.T", "9983.T", "6902.T", "8316.T",
    "4063.T", "2914.T", "4503.T", "6301.T", "7011.T", "8801.T",
    "9433.T", "8411.T",
  ],
  china_hk: [
    "0700.HK", "9988.HK", "0005.HK", "1398.HK", "2318.HK", "0941.HK",
    "3690.HK", "9618.HK", "0016.HK", "0883.HK", "0001.HK", "0857.HK",
    "2269.HK", "0027.HK", "1177.HK", "2313.HK", "0003.HK", "0002.HK",
    "0017.HK", "0388.HK",
  ],
  china_sh: [
    "601398.SS", "601288.SS", "601857.SS", "600519.SS", "601318.SS",
    "600036.SS", "601988.SS", "600276.SS", "600030.SS", "601166.SS",
    "600900.SS", "601888.SS", "600809.SS", "601012.SS", "600585.SS",
    "601668.SS", "600028.SS", "600048.SS", "601601.SS", "603259.SS",
  ],
  korea: [
    "005930.KS", "000660.KS", "005380.KS", "051910.KS", "006400.KS",
    "035420.KS", "035720.KS", "105560.KS", "055550.KS", "012330.KS",
    "207940.KS", "373220.KS", "005490.KS", "068270.KS", "017670.KS",
    "051900.KS", "096770.KS", "028260.KS", "066570.KS", "034730.KS",
  ],
  taiwan: [
    "2330.TW", "2317.TW", "2454.TW", "2881.TW", "2882.TW", "2303.TW",
    "2891.TW", "1301.TW", "1303.TW", "2412.TW", "3711.TW", "2382.TW",
    "1101.TW", "2886.TW", "2308.TW", "1216.TW", "5880.TW", "2603.TW",
    "3008.TW", "2884.TW",
  ],
  india: [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS", "LT.NS",
    "SBIN.NS", "AXISBANK.NS", "BAJFINANCE.NS", "MARUTI.NS", "TATAMOTORS.NS",
    "SUNPHARMA.NS", "ONGC.NS", "NTPC.NS", "HCLTECH.NS", "WIPRO.NS",
  ],
  australia: [
    "BHP.AX", "CBA.AX", "CSL.AX", "NAB.AX", "WBC.AX", "ANZ.AX",
    "WES.AX", "MQG.AX", "FMG.AX", "WOW.AX", "RIO.AX", "TLS.AX",
    "WDS.AX", "GMG.AX", "ALL.AX", "STO.AX", "COL.AX", "TCL.AX",
    "XRO.AX", "QBE.AX",
  ],
  asean_sg: [
    "D05.SI", "O39.SI", "U11.SI", "Z74.SI", "C09.SI", "BN4.SI",
    "F34.SI", "A17U.SI", "S58.SI", "C38U.SI",
    "PTT.BK", "ADVANC.BK", "CPALL.BK", "AOT.BK", "BDMS.BK",
    "TLKM.JK", "BBCA.JK", "BMRI.JK", "BBRI.JK", "ASII.JK",
  ],
  mideast: [
    "CHKP", "NICE", "TEVA", "CYBR", "MNDY", "GLBE",
    "WIX", "FVRR", "LUMI.TA", "DSCT.TA", "POLI.TA", "ICL",
    "BEZQ.TA", "ORA.TA", "AZRG.TA", "ELCO.TA", "ESLT",
    "DLEKG.TA", "MGDL.TA", "CEL.TA",
  ],
  africa: [
    "AGL.JO", "NPN.JO", "CFR.JO", "BHP.JO", "SOL.JO", "SBK.JO",
    "FSR.JO", "ANG.JO", "MTN.JO", "NED.JO", "ABG.JO", "SHP.JO",
    "IMP.JO", "VOD.JO", "REM.JO", "DSY.JO", "BAW.JO", "TKG.JO",
    "WHL.JO", "GRT.JO",
  ],
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const region = INDEX_REGION[symbol];
  if (!region) {
    return NextResponse.json({ symbol, constituents: [], available: false }, {
      headers: { "Cache-Control": "s-maxage=3600" },
    });
  }

  const tickers = CONSTITUENTS[region];
  if (!tickers || tickers.length === 0) {
    return NextResponse.json({ symbol, constituents: [], available: false }, {
      headers: { "Cache-Control": "s-maxage=3600" },
    });
  }

  try {
    const { quotes } = await fetchQuotes(tickers);

    const result: ConstituentData[] = [];
    for (const t of tickers) {
      const q = quotes[t];
      if (q && q.price > 0) {
        result.push({
          ticker: t,
          name: q.name || t.replace(/\.(SA|L|DE|PA|T|HK|KS|TW|NS|AX|SI|BK|JK|MI|MC|SW|AS|CO|ST|HE|OL|JO|SS|SZ|TA|TO|BR|ME|IS|LS|BA|MX|SN)$/, ""),
          price: q.price,
          changePct: q.changePercent ?? 0,
          currency: q.currency || "",
        });
      }
    }

    return NextResponse.json({
      symbol,
      constituents: result.slice(0, 20),
      available: true,
      total: result.length,
    }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=120" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
