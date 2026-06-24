import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { buildPmFxRates, calcularCambioMetrics, buildFxDateMap } from "@/lib/cambio";
import { loadFromGSheets, fetchHoldings, type Holding } from "@/lib/etf-holdings";
import { computeCountryAllocation, getCountryInfo } from "@/lib/ticker-country";
import { isRendaVariavel } from "@/lib/sectors";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LOOKTHROUGH_SECTORS = new Set(["ETF USA", "ETF"]);

// Nome PT no PADRÃO DO RADAR (chave de COUNTRY_TO_ISO_NUM) por ISO-2. O dossiê
// casa a exposição por `countryPT === selected.name`, e o nome do país no Radar
// vem de COUNTRY_TO_ISO_NUM ("EUA", não "Estados Unidos") — então traduzimos o
// código ISO-2 canônico para o nome do Radar (com fallback ao nome canônico).
const ISO2_TO_RADAR_PT: Record<string, string> = {
  US: "EUA", BR: "Brasil", CA: "Canadá", MX: "México", AR: "Argentina",
  CL: "Chile", CO: "Colômbia", PE: "Peru",
  GB: "Reino Unido", DE: "Alemanha", FR: "França", NL: "Holanda", CH: "Suíça",
  IE: "Irlanda", DK: "Dinamarca", SE: "Suécia", FI: "Finlândia", NO: "Noruega",
  ES: "Espanha", IT: "Itália", PT: "Portugal", BE: "Bélgica", AT: "Áustria",
  PL: "Polônia", GR: "Grécia", CZ: "Tchéquia", HU: "Hungria", TR: "Turquia", RU: "Rússia",
  JP: "Japão", CN: "China", HK: "Hong Kong", KR: "Coreia do Sul", TW: "Taiwan",
  IN: "Índia", SG: "Singapura", ID: "Indonésia", TH: "Tailândia", MY: "Malásia",
  PH: "Filipinas", VN: "Vietnã",
  AU: "Austrália", NZ: "Nova Zelândia",
  IL: "Israel", SA: "Arábia Saudita", AE: "Emirados", QA: "Catar", KW: "Kuwait",
  ZA: "África do Sul", NG: "Nigéria", EG: "Egito",
};

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

    // ── Posições diretas (não-ETF) → motor canônico de país ───────────────────
    // Reusa `computeCountryAllocation` (lib/ticker-country) — a MESMA engine da
    // página de ETF — para look-through por empresa (FMP/factsheet/single-country),
    // não inferência crua pelo país de listagem.
    const directPositions = snapshot.positions
      .filter(p => !LOOKTHROUGH_SECTORS.has(p.setor) && p.valorAtualBRL > 0)
      .map(p => ({
        ticker: p.ticker,
        setor: p.setor,
        valorAtualBRL: p.valorAtualBRL,
        macro: isRendaVariavel(p.setor) ? "Renda Variável" : "Renda Fixa",
      }));

    const directAlloc = await computeCountryAllocation({}, directPositions);

    // ── ETFs → look-through canônico, POR ETF (para fontes precisas) ──────────
    const etfPositions = snapshot.positions.filter(
      p => LOOKTHROUGH_SECTORS.has(p.setor) && p.quantidade > 0 && p.valorAtualBRL > 0
    );

    const etfSupported: string[] = [];
    let etfDecomposed = false;

    // Acumulador por ISO-2: BRL via ETF + quais ETFs contribuíram.
    const etfByCode: Record<string, { etfBRL: number; sources: Set<string> }> = {};

    if (etfPositions.length > 0) {
      const { stored } = await loadFromGSheets();

      for (const pos of etfPositions) {
        const t = pos.ticker.toUpperCase();
        const tClean = t.replace(".SA", "");
        const keys = [t, tClean, pos.ticker];

        let holdings: Holding[] | null = null;
        for (const key of keys) {
          if (stored[key] && stored[key].length > 0) { holdings = stored[key]; break; }
        }
        if (!holdings) {
          const result = await fetchHoldings(tClean);
          holdings = result.holdings;
        }
        if (!holdings || holdings.length === 0) continue;

        const totalWeight = holdings.reduce((s, h) => s + h.weight_pct, 0);
        if (totalWeight <= 0) continue;

        etfSupported.push(pos.ticker);
        etfDecomposed = true;

        // Composição no formato da engine canônica. Look-through por empresa:
        // computeCountryAllocation aplica FMP country-weightings / factsheet /
        // single-country override e só então cai no infer-por-holding.
        const composition = {
          [tClean]: {
            valor_brl: pos.valorAtualBRL,
            components: holdings
              .filter(h => !h.ticker.startsWith("OUTROS."))
              .map(h => ({ ativo: h.ticker, peso: h.weight_pct / totalWeight })),
          },
        };

        const etfAlloc = await computeCountryAllocation(composition, []);
        for (const c of etfAlloc) {
          const code = c.country.code;
          if (!etfByCode[code]) etfByCode[code] = { etfBRL: 0, sources: new Set() };
          etfByCode[code].etfBRL += c.value_brl;
          etfByCode[code].sources.add(tClean);
        }
      }
    }

    // ── Merge direto + ETF por país ────────────────────────────────────────────
    const byCode: Record<string, { directBRL: number; etfBRL: number; tickers: Set<string>; etfSources: Set<string> }> = {};
    const ensure = (code: string) => {
      if (!byCode[code]) byCode[code] = { directBRL: 0, etfBRL: 0, tickers: new Set(), etfSources: new Set() };
      return byCode[code];
    };

    for (const c of directAlloc) {
      const e = ensure(c.country.code);
      e.directBRL += c.value_brl;
      for (const tk of c.tickers) e.tickers.add(tk.replace(".SA", ""));
    }
    for (const [code, d] of Object.entries(etfByCode)) {
      const e = ensure(code);
      e.etfBRL += d.etfBRL;
      for (const s of d.sources) e.etfSources.add(s);
    }

    const totalBRL = Object.values(byCode).reduce((s, v) => s + v.directBRL + v.etfBRL, 0);

    const exposure: ExposureEntry[] = Object.entries(byCode)
      .map(([iso2, d]) => {
        const total = d.directBRL + d.etfBRL;
        const info = getCountryInfo(iso2);
        return {
          countryPT: ISO2_TO_RADAR_PT[iso2] ?? info?.name ?? iso2,
          iso2,
          totalBRL: total,
          pct: totalBRL > 0 ? (total / totalBRL) * 100 : 0,
          tickers: [...d.tickers].slice(0, 8),
          directBRL: d.directBRL,
          etfBRL: d.etfBRL,
          etfSources: [...d.etfSources],
        };
      })
      .filter(e => e.totalBRL > 0)
      .sort((a, b) => b.totalBRL - a.totalBRL);

    return NextResponse.json({ exposure, totalBRL, etfDecomposed, etfSupported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg, exposure: [] }, { status: 500 });
  }
}
