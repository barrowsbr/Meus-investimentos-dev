import { NextResponse } from "next/server";
import { fetchQuotes, fetchHistory, type HistoryPoint } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

interface IndexMeta {
  symbol: string;
  tvSymbol: string;
  name: string;
  country: string;
  flag: string;
  region: string;
  lat: number;
  lng: number;
}

interface IndexData extends IndexMeta {
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

const INDICES: IndexMeta[] = [
  // Americas
  { symbol: "^GSPC",    tvSymbol: "SP:SPX",              name: "S&P 500",                country: "EUA",           flag: "\u{1f1fa}\u{1f1f8}", region: "Americas",    lat: 40.7,  lng: -74.0 },
  { symbol: "^DJI",     tvSymbol: "DJ:DJI",              name: "Dow Jones",               country: "EUA",           flag: "\u{1f1fa}\u{1f1f8}", region: "Americas",    lat: 40.7,  lng: -73.2 },
  { symbol: "^IXIC",    tvSymbol: "NASDAQ:IXIC",         name: "NASDAQ Composite",        country: "EUA",           flag: "\u{1f1fa}\u{1f1f8}", region: "Americas",    lat: 40.7,  lng: -74.8 },
  { symbol: "^RUT",     tvSymbol: "TVC:RUT",             name: "Russell 2000",            country: "EUA",           flag: "\u{1f1fa}\u{1f1f8}", region: "Americas",    lat: 38.9,  lng: -77.0 },
  { symbol: "^VIX",     tvSymbol: "TVC:VIX",             name: "VIX (Volatilidade)",      country: "EUA",           flag: "\u{1f1fa}\u{1f1f8}", region: "Americas",    lat: 41.9,  lng: -87.6 },
  { symbol: "^BVSP",    tvSymbol: "BMFBOVESPA:IBOV",     name: "Ibovespa",                country: "Brasil",        flag: "\u{1f1e7}\u{1f1f7}", region: "Americas",    lat: -23.5, lng: -46.6 },
  { symbol: "^GSPTSE",  tvSymbol: "TSX:TSX",             name: "S&P/TSX Composite",       country: "Canadá",   flag: "\u{1f1e8}\u{1f1e6}", region: "Americas",    lat: 43.7,  lng: -79.4 },
  { symbol: "^MXX",     tvSymbol: "BMV:ME",              name: "IPC México",         country: "México",   flag: "\u{1f1f2}\u{1f1fd}", region: "Americas",    lat: 19.4,  lng: -99.1 },
  { symbol: "^MERV",    tvSymbol: "BCBA:IMV",            name: "MERVAL",                  country: "Argentina",     flag: "\u{1f1e6}\u{1f1f7}", region: "Americas",    lat: -34.6, lng: -58.4 },
  { symbol: "^IPSA",    tvSymbol: "BCS:IPSA",            name: "S&P CLX IPSA",            country: "Chile",         flag: "\u{1f1e8}\u{1f1f1}", region: "Americas",    lat: -33.4, lng: -70.6 },

  // Europe
  { symbol: "^STOXX50E", tvSymbol: "TVC:SX5E",           name: "Euro Stoxx 50",          country: "Europa",        flag: "\u{1f1ea}\u{1f1fa}", region: "Europe",      lat: 50.1,  lng: 8.7 },
  { symbol: "^FTSE",     tvSymbol: "TVC:UKX",            name: "FTSE 100",               country: "Reino Unido",   flag: "\u{1f1ec}\u{1f1e7}", region: "Europe",      lat: 51.5,  lng: -0.1 },
  { symbol: "^GDAXI",    tvSymbol: "XETR:DAX",           name: "DAX",                    country: "Alemanha",      flag: "\u{1f1e9}\u{1f1ea}", region: "Europe",      lat: 50.1,  lng: 8.7 },
  { symbol: "^FCHI",     tvSymbol: "TVC:CAC40",          name: "CAC 40",                 country: "França",   flag: "\u{1f1eb}\u{1f1f7}", region: "Europe",      lat: 48.9,  lng: 2.3 },
  { symbol: "^IBEX",     tvSymbol: "TVC:IBEX35",         name: "IBEX 35",                country: "Espanha",       flag: "\u{1f1ea}\u{1f1f8}", region: "Europe",      lat: 40.4,  lng: -3.7 },
  { symbol: "FTSEMIB.MI", tvSymbol: "MIL:FTSEMIB",       name: "FTSE MIB",              country: "Itália",   flag: "\u{1f1ee}\u{1f1f9}", region: "Europe",      lat: 45.5,  lng: 9.2 },
  { symbol: "^SSMI",     tvSymbol: "TVC:SMI",            name: "SMI",                    country: "Suíça", flag: "\u{1f1e8}\u{1f1ed}", region: "Europe",    lat: 47.4,  lng: 8.5 },
  { symbol: "^AEX",      tvSymbol: "TVC:AEX",            name: "AEX",                    country: "Holanda",       flag: "\u{1f1f3}\u{1f1f1}", region: "Europe",      lat: 52.4,  lng: 4.9 },
  { symbol: "^OMXS30",   tvSymbol: "OMXSTO:OMXS30",      name: "OMX Stockholm 30",       country: "Suécia",   flag: "\u{1f1f8}\u{1f1ea}", region: "Europe",      lat: 59.3,  lng: 18.1 },
  { symbol: "^OMXC25",   tvSymbol: "OMXCOP:OMXC25",      name: "OMX Copenhagen 25",      country: "Dinamarca",     flag: "\u{1f1e9}\u{1f1f0}", region: "Europe",      lat: 55.7,  lng: 12.6 },
  { symbol: "^OMXHPI",   tvSymbol: "OMXHEX:OMXHPI",      name: "OMX Helsinki",           country: "Finlândia", flag: "\u{1f1eb}\u{1f1ee}", region: "Europe",     lat: 60.2,  lng: 24.9 },
  { symbol: "^OSEAX",    tvSymbol: "OSL:OSEAX",           name: "Oslo All Share",          country: "Noruega",       flag: "\u{1f1f3}\u{1f1f4}", region: "Europe",      lat: 59.9,  lng: 10.8 },
  { symbol: "^ATX",      tvSymbol: "TVC:ATX",             name: "ATX",                    country: "Áustria",  flag: "\u{1f1e6}\u{1f1f9}", region: "Europe",      lat: 48.2,  lng: 16.4 },
  { symbol: "^BFX",      tvSymbol: "TVC:BFX",             name: "BEL 20",                 country: "Bélgica",  flag: "\u{1f1e7}\u{1f1ea}", region: "Europe",      lat: 50.8,  lng: 4.4 },
  { symbol: "PSI20.LS",  tvSymbol: "EURONEXT:PSI20",      name: "PSI 20",                 country: "Portugal",      flag: "\u{1f1f5}\u{1f1f9}", region: "Europe",      lat: 38.7,  lng: -9.1 },
  { symbol: "^WIG20",    tvSymbol: "GPW:WIG20",           name: "WIG 20",                 country: "Polônia",  flag: "\u{1f1f5}\u{1f1f1}", region: "Europe",      lat: 52.2,  lng: 21.0 },
  { symbol: "XU100.IS",  tvSymbol: "BIST:XU100",          name: "BIST 100",               country: "Turquia",       flag: "\u{1f1f9}\u{1f1f7}", region: "Europe",      lat: 41.0,  lng: 29.0 },
  { symbol: "IMOEX.ME",  tvSymbol: "MOEX:IMOEX",          name: "MOEX Russia",            country: "Rússia",   flag: "\u{1f1f7}\u{1f1fa}", region: "Europe",      lat: 55.8,  lng: 37.6 },

  // Asia
  { symbol: "^N225",     tvSymbol: "TVC:NI225",           name: "Nikkei 225",             country: "Japão",    flag: "\u{1f1ef}\u{1f1f5}", region: "Asia",        lat: 35.7,  lng: 139.7 },
  { symbol: "^HSI",      tvSymbol: "TVC:HSI",             name: "Hang Seng",              country: "Hong Kong",     flag: "\u{1f1ed}\u{1f1f0}", region: "Asia",        lat: 22.3,  lng: 114.2 },
  { symbol: "000001.SS", tvSymbol: "SSE:000001",          name: "Shanghai Composite",     country: "China",         flag: "\u{1f1e8}\u{1f1f3}", region: "Asia",        lat: 31.2,  lng: 121.5 },
  { symbol: "399001.SZ", tvSymbol: "SZSE:399001",         name: "Shenzhen Component",     country: "China",         flag: "\u{1f1e8}\u{1f1f3}", region: "Asia",        lat: 22.5,  lng: 114.1 },
  { symbol: "^KS11",     tvSymbol: "KRX:KOSPI",           name: "KOSPI",                  country: "Coreia do Sul", flag: "\u{1f1f0}\u{1f1f7}", region: "Asia",        lat: 37.6,  lng: 127.0 },
  { symbol: "^TWII",     tvSymbol: "TWSE:TAIEX",          name: "TAIEX",                  country: "Taiwan",        flag: "\u{1f1f9}\u{1f1fc}", region: "Asia",        lat: 25.0,  lng: 121.5 },
  { symbol: "^BSESN",    tvSymbol: "BSE:SENSEX",          name: "BSE Sensex",             country: "Índia",    flag: "\u{1f1ee}\u{1f1f3}", region: "Asia",        lat: 19.1,  lng: 72.9 },
  { symbol: "^NSEI",     tvSymbol: "NSE:NIFTY",           name: "Nifty 50",               country: "Índia",    flag: "\u{1f1ee}\u{1f1f3}", region: "Asia",        lat: 19.1,  lng: 73.7 },
  { symbol: "^STI",      tvSymbol: "TVC:STI",             name: "Straits Times",          country: "Singapura",     flag: "\u{1f1f8}\u{1f1ec}", region: "Asia",        lat: 1.3,   lng: 103.8 },
  { symbol: "^JKSE",     tvSymbol: "IDX:COMPOSITE",       name: "Jakarta Composite",      country: "Indonésia", flag: "\u{1f1ee}\u{1f1e9}", region: "Asia",       lat: -6.2,  lng: 106.8 },
  { symbol: "^KLSE",     tvSymbol: "MYX:FBMKLCI",         name: "KLCI",                   country: "Malásia",  flag: "\u{1f1f2}\u{1f1fe}", region: "Asia",        lat: 3.1,   lng: 101.7 },
  { symbol: "^SET.BK",   tvSymbol: "SET:SET",             name: "SET (Tailândia)",   country: "Tailândia", flag: "\u{1f1f9}\u{1f1ed}", region: "Asia",       lat: 13.8,  lng: 100.5 },
  { symbol: "^NZ50",     tvSymbol: "NZX:NZ50G",           name: "NZX 50",                 country: "Nova Zelândia", flag: "\u{1f1f3}\u{1f1ff}", region: "Oceania",  lat: -36.8, lng: 174.8 },

  // Middle East
  { symbol: "^TA125.TA", tvSymbol: "TASE:TA125",          name: "TA-125",                 country: "Israel",        flag: "\u{1f1ee}\u{1f1f1}", region: "Middle East", lat: 32.1,  lng: 34.8 },
  { symbol: "^TASI.SR",  tvSymbol: "TADAWUL:TASI",        name: "Tadawul All Share",      country: "Arábia Saudita", flag: "\u{1f1f8}\u{1f1e6}", region: "Middle East", lat: 24.7, lng: 46.7 },
  { symbol: "^DFMGI",    tvSymbol: "DFM:DFMGI",           name: "Dubai Financial Market", country: "Emirados",      flag: "\u{1f1e6}\u{1f1ea}", region: "Middle East", lat: 25.2,  lng: 55.3 },
  { symbol: "^ADI",      tvSymbol: "ADX:ADI",             name: "Abu Dhabi Index",        country: "Emirados",      flag: "\u{1f1e6}\u{1f1ea}", region: "Middle East", lat: 24.5,  lng: 54.4 },
  { symbol: "^QSI",      tvSymbol: "QSE:GNRI",            name: "Qatar General",          country: "Catar",         flag: "\u{1f1f6}\u{1f1e6}", region: "Middle East", lat: 25.3,  lng: 51.5 },

  // Africa
  { symbol: "^J203.JO",  tvSymbol: "JSE:J203",            name: "JSE All Share",          country: "África do Sul", flag: "\u{1f1ff}\u{1f1e6}", region: "Africa",  lat: -26.2, lng: 28.0 },
  { symbol: "^CASE30",   tvSymbol: "EGX:EGX30",           name: "EGX 30",                 country: "Egito",         flag: "\u{1f1ea}\u{1f1ec}", region: "Africa",      lat: 30.0,  lng: 31.2 },
  { symbol: "^MASI",     tvSymbol: "CSE:MASI",            name: "MASI Casablanca",        country: "Marrocos",      flag: "\u{1f1f2}\u{1f1e6}", region: "Africa",      lat: 33.6,  lng: -7.6 },
  { symbol: "^NGSEINDX", tvSymbol: "NGXGROUP:NGSE",       name: "NGX All Share",          country: "Nigéria",       flag: "\u{1f1f3}\u{1f1ec}", region: "Africa",      lat: 6.5,   lng: 3.4 },
  { symbol: "^NSE20",    tvSymbol: "NSE:NSE20",           name: "NSE 20",                 country: "Quênia",        flag: "\u{1f1f0}\u{1f1ea}", region: "Africa",      lat: -1.3,  lng: 36.8 },

  // Oceania
  { symbol: "^AXJO",     tvSymbol: "ASX:XJO",             name: "ASX 200",                country: "Austrália", flag: "\u{1f1e6}\u{1f1fa}", region: "Oceania",    lat: -33.9, lng: 151.2 },

  // Americas (additional)
  { symbol: "^COLCAP",   tvSymbol: "BVC:COLCAP",          name: "COLCAP",                 country: "Colômbia",      flag: "\u{1f1e8}\u{1f1f4}", region: "Americas",    lat: 4.7,   lng: -74.1 },
  { symbol: "^SPBLPGPT", tvSymbol: "BVL:SPBLPGPT",        name: "S&P/BVL Peru",           country: "Peru",          flag: "\u{1f1f5}\u{1f1ea}", region: "Americas",    lat: -12.0, lng: -77.0 },

  // Asia (additional)
  { symbol: "^VNINDEX",  tvSymbol: "HOSE:VNINDEX",        name: "VN-Index",               country: "Vietnã",        flag: "\u{1f1fb}\u{1f1f3}", region: "Asia",        lat: 10.8,  lng: 106.7 },
  { symbol: "^PSEi",     tvSymbol: "PSE:PSEi",            name: "PSEi Composite",         country: "Filipinas",     flag: "\u{1f1f5}\u{1f1ed}", region: "Asia",        lat: 14.6,  lng: 121.0 },
  { symbol: "^KSE",      tvSymbol: "PSX:KSE100",          name: "KSE 100",                country: "Paquistão",     flag: "\u{1f1f5}\u{1f1f0}", region: "Asia",        lat: 24.9,  lng: 67.0 },
  { symbol: "^CSE",      tvSymbol: "CSE:ASPI",            name: "CSE All Share",          country: "Sri Lanka",     flag: "\u{1f1f1}\u{1f1f0}", region: "Asia",        lat: 6.9,   lng: 79.9 },
  { symbol: "^BETI",     tvSymbol: "BET:BETI",            name: "Dhaka DSEX",             country: "Bangladesh",    flag: "\u{1f1e7}\u{1f1e9}", region: "Asia",        lat: 23.8,  lng: 90.4 },
];

function closeNDaysAgo(history: HistoryPoint[], days: number): number | null {
  if (history.length === 0) return null;
  const target = new Date();
  target.setDate(target.getDate() - days);
  const targetStr = target.toISOString().split("T")[0];
  let chosen: number | null = null;
  for (const p of history) {
    if (p.date <= targetStr) chosen = p.close;
    else break;
  }
  return chosen ?? history[0].close;
}

function closeYtd(history: HistoryPoint[]): number | null {
  if (history.length === 0) return null;
  const year = new Date().getFullYear();
  const jan1 = `${year}-01-01`;
  for (const p of history) {
    if (p.date >= jan1) return p.close;
  }
  return history[0].close;
}

function pct(now: number, then: number | null): number | null {
  if (then == null || then <= 0) return null;
  return ((now / then) - 1) * 100;
}

type PeriodKey = "1S" | "1M" | "3M" | "6M" | "1A" | "YTD";

interface Periods {
  "1S": number | null;
  "1M": number | null;
  "3M": number | null;
  "6M": number | null;
  "1A": number | null;
  YTD: number | null;
}

export async function GET() {
  try {
    const symbols = INDICES.map(i => i.symbol);

    const { quotes } = await fetchQuotes(symbols);

    const indices: (IndexData & { periods?: Periods })[] = [];
    for (const meta of INDICES) {
      const q = quotes[meta.symbol];
      if (!q || q.price <= 0) continue;
      indices.push({
        ...meta,
        price: q.price,
        change: q.change,
        changePct: q.changePercent,
        currency: q.currency || "USD",
      });
    }

    if (indices.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma fonte de cotação disponível para índices" },
        { status: 502 },
      );
    }

    const spHistory = await fetchHistory("^GSPC", "1y", "1d").catch(() => [] as HistoryPoint[]);
    let spPeriods: Periods | null = null;
    const sp = indices.find(i => i.symbol === "^GSPC");
    if (sp && spHistory.length > 5) {
      const now = sp.price;
      spPeriods = {
        "1S": pct(now, closeNDaysAgo(spHistory, 7)),
        "1M": pct(now, closeNDaysAgo(spHistory, 30)),
        "3M": pct(now, closeNDaysAgo(spHistory, 90)),
        "6M": pct(now, closeNDaysAgo(spHistory, 180)),
        "1A": pct(now, closeNDaysAgo(spHistory, 365)),
        YTD: pct(now, closeYtd(spHistory)),
      };
    }

    const nonVix = indices.filter(i => i.symbol !== "^VIX");
    const breadthUp = nonVix.filter(i => i.changePct > 0).length;
    const breadthTotal = nonVix.length;

    const best = nonVix.reduce((a, b) => a.changePct > b.changePct ? a : b);
    const worst = nonVix.reduce((a, b) => a.changePct < b.changePct ? a : b);

    return NextResponse.json({
      indices,
      spHistory: spHistory.map(p => ({ date: p.date, close: p.close })),
      spPeriods,
      breadth: { up: breadthUp, down: breadthTotal - breadthUp, total: breadthTotal },
      best: { symbol: best.symbol, name: best.name, flag: best.flag, changePct: best.changePct },
      worst: { symbol: worst.symbol, name: worst.name, flag: worst.flag, changePct: worst.changePct },
      lastUpdate: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
