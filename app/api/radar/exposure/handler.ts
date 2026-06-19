import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Exposure — cruza posições reais do portfólio com os países do
// Radar. Fase 4: "Pessoal & Acionável". Reutiliza inferência de país de
// lib/ticker-country.ts e lê posições de /api/cotacoes.
// ─────────────────────────────────────────────────────────────────────────────

// Mapa de sufixo de bolsa → código ISO do país
const EXCHANGE_SUFFIX: Record<string, string> = {
  ".SA": "BR", ".L": "GB", ".T": "JP", ".DE": "DE", ".PA": "FR",
  ".SW": "CH", ".AS": "NL", ".CO": "DK", ".ST": "SE", ".HE": "FI",
  ".MC": "ES", ".MI": "IT", ".LS": "PT", ".BR": "BE", ".VI": "AT",
  ".WA": "PL", ".AT": "GR", ".PR": "CZ", ".BU": "HU",
  ".HK": "HK", ".KS": "KR", ".KQ": "KR", ".TW": "TW", ".BO": "IN",
  ".NS": "IN", ".SI": "SG", ".JK": "ID", ".BK": "TH", ".KL": "MY",
  ".AX": "AU", ".NZ": "NZ", ".TA": "IL", ".SR": "SA",
  ".TO": "CA", ".V": "CA", ".MX": "MX",
  ".AQ": "AR", ".SN": "CL",
};

const ADR_COUNTRY: Record<string, string> = {
  BABA: "CN", PDD: "CN", JD: "CN", NIO: "CN", TSM: "TW",
  TM: "JP", SONY: "JP", ASML: "NL", NVS: "CH", NVO: "DK",
  SHEL: "GB", BP: "GB", AZN: "GB", HSBC: "GB", ARM: "GB",
  SAP: "DE", SPOT: "SE", BHP: "AU", MELI: "AR",
  PBR: "BR", VALE: "BR", ITUB: "BR", BBD: "BR", ABEV: "BR",
  INFY: "IN", HDB: "IN", SHOP: "CA", TD: "CA", RY: "CA",
  AMX: "MX", SQM: "CL", YPF: "AR", GLOB: "AR",
};

// PT country name → ISO-2 (reverse of Radar's mapping)
const PT_TO_ISO2: Record<string, string> = {
  "EUA": "US", "Brasil": "BR", "Canadá": "CA", "México": "MX",
  "Argentina": "AR", "Chile": "CL", "Colômbia": "CO", "Peru": "PE",
  "Reino Unido": "GB", "Alemanha": "DE", "França": "FR", "Holanda": "NL",
  "Suíça": "CH", "Espanha": "ES", "Itália": "IT", "Portugal": "PT",
  "Suécia": "SE", "Dinamarca": "DK", "Noruega": "NO", "Finlândia": "FI",
  "Polônia": "PL", "Turquia": "TR", "Rússia": "RU", "Grécia": "GR",
  "Hungria": "HU", "Ucrânia": "UA", "Áustria": "AT", "Bélgica": "BE",
  "Japão": "JP", "China": "CN", "Hong Kong": "HK", "Coreia do Sul": "KR",
  "Taiwan": "TW", "Índia": "IN", "Singapura": "SG", "Indonésia": "ID",
  "Malásia": "MY", "Tailândia": "TH", "Filipinas": "PH",
  "Israel": "IL", "Arábia Saudita": "SA", "Emirados": "AE",
  "África do Sul": "ZA", "Egito": "EG", "Nigéria": "NG",
  "Austrália": "AU", "Nova Zelândia": "NZ",
};

const ISO2_TO_PT = Object.fromEntries(Object.entries(PT_TO_ISO2).map(([k, v]) => [v, k]));

interface PortfolioPosition {
  ticker: string;
  setor: string;
  valorAtualBRL: number;
  quantidade: number;
}

interface ExposureEntry {
  countryPT: string;    // nome PT do país (match com Radar)
  iso2: string;
  totalBRL: number;
  pct: number;
  tickers: string[];
}

function inferCountry(ticker: string, setor: string): string {
  for (const [suffix, code] of Object.entries(EXCHANGE_SUFFIX)) {
    if (ticker.toUpperCase().endsWith(suffix.toUpperCase())) return code;
  }
  const clean = ticker.toUpperCase().replace(".SA", "");
  if (ADR_COUNTRY[clean]) return ADR_COUNTRY[clean];

  if (ticker.endsWith(".SA") || ["Ações Brasil", "FIIs", "BDRs", "Renda Fixa", "Caixa/Liquidez", "Tesouro Direto"].includes(setor)) {
    return "BR";
  }
  if (["Ações Internacional", "ETF USA", "Ações EUA"].includes(setor)) return "US";
  if (setor === "Cripto") return "";
  return "US";
}

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
}

export async function GET() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/cotacoes`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return NextResponse.json({ exposure: [], error: "Falha ao buscar portfólio" });
    }
    const data = await res.json();
    const positions: PortfolioPosition[] = (data.positions ?? []).map((p: Record<string, unknown>) => ({
      ticker: String(p.ticker ?? ""),
      setor: String(p.setor ?? ""),
      valorAtualBRL: Number(p.valorAtualBRL ?? 0),
      quantidade: Number(p.quantidade ?? 0),
    })).filter((p: PortfolioPosition) => p.valorAtualBRL > 0);

    const byCountry: Record<string, { totalBRL: number; tickers: Set<string> }> = {};

    for (const pos of positions) {
      const iso2 = inferCountry(pos.ticker, pos.setor);
      if (!iso2) continue;
      if (!byCountry[iso2]) byCountry[iso2] = { totalBRL: 0, tickers: new Set() };
      byCountry[iso2].totalBRL += pos.valorAtualBRL;
      byCountry[iso2].tickers.add(pos.ticker.replace(".SA", ""));
    }

    const totalBRL = Object.values(byCountry).reduce((s, v) => s + v.totalBRL, 0);

    const exposure: ExposureEntry[] = Object.entries(byCountry)
      .map(([iso2, data]) => ({
        countryPT: ISO2_TO_PT[iso2] ?? iso2,
        iso2,
        totalBRL: data.totalBRL,
        pct: totalBRL > 0 ? (data.totalBRL / totalBRL) * 100 : 0,
        tickers: [...data.tickers].slice(0, 8),
      }))
      .sort((a, b) => b.totalBRL - a.totalBRL);

    return NextResponse.json({ exposure, totalBRL });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg, exposure: [] }, { status: 500 });
  }
}
