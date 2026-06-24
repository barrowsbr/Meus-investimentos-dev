import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { buildPmFxRates, calcularCambioMetrics, buildFxDateMap } from "@/lib/cambio";
import { loadFromGSheets, fetchHoldings, type Holding } from "@/lib/etf-holdings";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

const LOOKTHROUGH_SECTORS = new Set(["ETF USA", "ETF"]);

interface ExposureEntry {
  countryPT: string;
  iso2: string;
  totalBRL: number;
  pct: number;
  tickers: string[];
  directBRL: number;
  etfBRL: number;
  etfSources: string[];
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

function inferCountryFromTicker(ticker: string): string {
  for (const [suffix, code] of Object.entries(EXCHANGE_SUFFIX)) {
    if (ticker.toUpperCase().endsWith(suffix.toUpperCase())) return code;
  }
  const clean = ticker.toUpperCase().replace(".SA", "");
  if (ADR_COUNTRY[clean]) return ADR_COUNTRY[clean];
  return "US";
}

export async function GET() {
  try {
    const store = getDataStore();
    const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows] = await Promise.all([
      store.fetchTab("meus_ativos"),
      store.fetchTab("meus_proventos"),
      store.fetchTab("fixa_aberta"),
      store.fetchTab("cambio").catch(() => []),
      store.fetchTab("p_tax").catch(() => []),
    ]);

    const tickerSet = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!ticker) continue;
      if (!tickerSet.has(ticker)) {
        tickerSet.set(ticker, {
          moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
          corretora: String(row["corretora"] ?? "").trim(),
        });
      }
    }

    const tickers = [...tickerSet.entries()].map(([ticker, info]) => ({
      ticker,
      moeda: info.moeda,
      corretora: info.corretora,
    }));

    const cotacoes = await fetchCotacoes(tickers);
    const fxAtual = cotacoes.fx;
    const cambio = calcularCambioMetrics(cambioRows, fxAtual);
    const fxCusto = buildPmFxRates(cambio);
    const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);

    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate, {});

    // ── Direct positions → country ──────────────────────────────────────────
    const byCountry: Record<string, { directBRL: number; etfBRL: number; tickers: Set<string>; etfSources: Set<string> }> = {};

    for (const pos of snapshot.positions) {
      if (pos.valorAtualBRL <= 0) continue;
      if (LOOKTHROUGH_SECTORS.has(pos.setor)) continue;
      const iso2 = inferCountry(pos.ticker, pos.setor);
      if (!iso2) continue;
      if (!byCountry[iso2]) byCountry[iso2] = { directBRL: 0, etfBRL: 0, tickers: new Set(), etfSources: new Set() };
      byCountry[iso2].directBRL += pos.valorAtualBRL;
      byCountry[iso2].tickers.add(pos.ticker.replace(".SA", ""));
    }

    // ── ETF look-through → country ─────────────────────────────────────────
    const etfPositions = snapshot.positions.filter(
      p => LOOKTHROUGH_SECTORS.has(p.setor) && p.quantidade > 0 && p.valorAtualBRL > 0
    );

    const etfSupported: string[] = [];
    let etfDecomposed = false;

    if (etfPositions.length > 0) {
      const { stored, storedSources } = await loadFromGSheets();

      for (const pos of etfPositions) {
        const t = pos.ticker.toUpperCase();
        const tClean = t.replace(".SA", "");
        const keys = [t, tClean, pos.ticker];

        let holdings: Holding[] | null = null;
        for (const key of keys) {
          if (stored[key] && stored[key].length > 0) {
            holdings = stored[key];
            break;
          }
        }

        if (!holdings) {
          const result = await fetchHoldings(tClean);
          holdings = result.holdings;
        }

        if (!holdings || holdings.length === 0) continue;

        etfSupported.push(pos.ticker);
        etfDecomposed = true;

        const totalWeight = holdings.reduce((s, h) => s + h.weight_pct, 0);
        if (totalWeight <= 0) continue;

        for (const h of holdings) {
          if (h.ticker.startsWith("OUTROS.")) continue;
          const iso2 = inferCountryFromTicker(h.ticker);
          if (!iso2) continue;

          const valueBRL = (h.weight_pct / totalWeight) * pos.valorAtualBRL;
          if (!byCountry[iso2]) byCountry[iso2] = { directBRL: 0, etfBRL: 0, tickers: new Set(), etfSources: new Set() };
          byCountry[iso2].etfBRL += valueBRL;
          byCountry[iso2].etfSources.add(tClean);
        }
      }
    }

    // ── Assemble response ───────────────────────────────────────────────────
    const totalBRL = Object.values(byCountry).reduce((s, v) => s + v.directBRL + v.etfBRL, 0);

    const exposure: ExposureEntry[] = Object.entries(byCountry)
      .map(([iso2, d]) => ({
        countryPT: ISO2_TO_PT[iso2] ?? iso2,
        iso2,
        totalBRL: d.directBRL + d.etfBRL,
        pct: totalBRL > 0 ? ((d.directBRL + d.etfBRL) / totalBRL) * 100 : 0,
        tickers: [...d.tickers].slice(0, 8),
        directBRL: d.directBRL,
        etfBRL: d.etfBRL,
        etfSources: [...d.etfSources],
      }))
      .sort((a, b) => b.totalBRL - a.totalBRL);

    return NextResponse.json({ exposure, totalBRL, etfDecomposed, etfSupported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg, exposure: [] }, { status: 500 });
  }
}
