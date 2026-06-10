import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "@/lib/cambio";
import { identificarSetor, isRendaFixa } from "@/lib/sectors";
import { getSetorEconomico, translateYahooSector } from "@/lib/gics-sectors";
import { toNumber } from "@/lib/format";
import { loadFromGSheets, type Holding } from "@/lib/etf-holdings";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type Row = Record<string, unknown>;

interface SectorInfo {
  sector?: string;
  industry?: string;
  longName?: string;
}

async function batchFetchSectors(
  symbols: string[],
): Promise<Record<string, SectorInfo>> {
  if (symbols.length === 0) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const YF: any = (await import("yahoo-finance2")).default;
  const yf = typeof YF === "function" ? new YF() : YF;
  const results: Record<string, SectorInfo> = {};
  const batchSize = 6;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(async (sym) => {
      try {
        const summary = await yf.quoteSummary(sym, {
          modules: ["assetProfile", "price"],
        });
        results[sym] = {
          sector: summary?.assetProfile?.sector ?? undefined,
          industry: summary?.assetProfile?.industry ?? undefined,
          longName:
            summary?.price?.longName ??
            summary?.price?.shortName ??
            undefined,
        };
      } catch {
        try {
          const q = await yf.quote(sym);
          results[sym] = {
            longName: q?.longName ?? q?.shortName ?? undefined,
          };
        } catch {
          // skip
        }
      }
    });
    await Promise.all(promises);
  }
  return results;
}

function getTicker(row: Row): string {
  return String(row["ticker"] ?? row["ativo"] ?? row["papel"] ?? "").trim();
}

function getMoeda(row: Row): string {
  return String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
}

const CASH_TICKERS = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lookthrough = searchParams.get("lookthrough") === "true";

  try {
    const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows] =
      await Promise.all([
        fetchTab("meus_ativos"),
        fetchTab("meus_proventos"),
        fetchTab("fixa_aberta"),
        fetchTab("cambio").catch(() => []),
        fetchTab("p_tax").catch(() => []),
      ]);

    // Portfolio snapshot
    const tickerSet = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const ticker = String(
        row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "",
      )
        .toUpperCase()
        .trim();
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
    const snapshot = calcularSnapshot(
      transacoes,
      proventos,
      fixaAberta,
      cotacoes.quotes,
      fxAtual,
      fxCusto,
      fxByDate,
    );

    // Build Yahoo symbol map for sector lookup
    const yahooSymbols: string[] = [];
    const tickerToYahoo = new Map<string, string>();
    for (const p of snapshot.positions) {
      if (p.quantidade <= 0 || p.valorAtualBRL <= 0) continue;
      if (isRendaFixa(p.setor)) continue;
      const info = tickerSet.get(p.ticker);
      const ySym = yahooTicker(
        p.ticker,
        info?.moeda ?? "BRL",
        info?.corretora ?? "",
      );
      tickerToYahoo.set(p.ticker, ySym);
      if (!yahooSymbols.includes(ySym)) yahooSymbols.push(ySym);
    }

    // Batch-fetch sector info from Yahoo
    const sectorInfo = await batchFetchSectors(yahooSymbols);

    // Build position list with sectors
    interface PosWithSector {
      ticker: string;
      nome: string;
      setor: string;
      setorEconomico: string;
      industry: string;
      valorBRL: number;
      custoTotalBRL: number;
      lucroBRL: number;
      lucroPct: number;
      moeda: string;
      tipo: string;
    }

    const positions: PosWithSector[] = [];
    const usd = fxAtual.USDBRL;
    const fxMap: Record<string, number> = {
      BRL: 1,
      USD: usd,
      EUR: fxAtual.EURBRL ?? usd,
      CAD: fxAtual.CADBRL ?? usd,
      GBP: fxAtual.GBPBRL ?? usd,
    };

    for (const p of snapshot.positions) {
      if (p.quantidade <= 0 || p.valorAtualBRL <= 0) continue;

      const ySym = tickerToYahoo.get(p.ticker);
      const info = ySym ? sectorInfo[ySym] : undefined;
      const apiSector = info?.sector;
      const se = getSetorEconomico(p.ticker, p.setor, apiSector);

      positions.push({
        ticker: p.ticker.replace(/\.SA$/, ""),
        nome:
          info?.longName ??
          (cotacoes.quotes[ySym ?? ""]?.name || p.ticker.replace(/\.SA$/, "")),
        setor: p.setor,
        setorEconomico: se,
        industry: info?.industry ?? "",
        valorBRL: p.valorAtualBRL,
        custoTotalBRL: p.custoTotalBRL,
        lucroBRL: p.lucroBRL ?? 0,
        lucroPct: p.lucroPct ?? 0,
        moeda: p.moeda,
        tipo: "RV",
      });
    }

    // Add RF positions from fixa_aberta
    const usedTickers = new Set(positions.map(p => p.ticker));
    for (const row of fixaAberta) {
      const rawTicker = getTicker(row);
      if (!rawTicker) continue;
      const valor =
        toNumber(
          row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"],
        ) ?? 0;
      if (valor <= 0) continue;
      const moeda = getMoeda(row);
      const isCaixa = CASH_TICKERS.has(rawTicker.toUpperCase());
      const setor = isCaixa ? "Caixa/Liquidez" : "Renda Fixa";
      const fxRate = fxMap[moeda] ?? fxMap.USD ?? 1;
      const valorBRL = valor * fxRate;

      // Disambiguate duplicate tickers (e.g. "Caixa" in BRL and USD)
      let ticker = rawTicker;
      if (usedTickers.has(ticker)) ticker = `${rawTicker} (${moeda})`;
      usedTickers.add(ticker);

      positions.push({
        ticker,
        nome: rawTicker,
        setor,
        setorEconomico: isCaixa ? "Caixa/Liquidez" : "Renda Fixa",
        industry: "",
        valorBRL,
        custoTotalBRL: valorBRL,
        lucroBRL: 0,
        lucroPct: 0,
        moeda,
        tipo: isCaixa ? "Caixa" : "RF",
      });
    }

    // ── Look-through: explode ETFs into underlying holdings ──
    let lookThroughMeta: { supported: string[]; unsupported: string[]; sources: Record<string, string> } | undefined;

    if (lookthrough) {
      const ETF_SECTORS = new Set(["ETF USA", "ETF"]);
      const etfPositions = positions.filter(p => ETF_SECTORS.has(p.setor));

      if (etfPositions.length > 0) {
        const { stored } = await loadFromGSheets();

        const resolveHoldings = async (ticker: string): Promise<Holding[] | null> => {
          const keys = [ticker.toUpperCase(), ticker.replace(/\.SA$/, "").toUpperCase()];
          for (const k of keys) {
            if (stored[k]?.length > 0) return stored[k];
          }
          const { holdings } = await (await import("@/lib/etf-holdings")).fetchHoldings(ticker);
          return holdings;
        };

        const supportedETFs: string[] = [];
        const unsupportedETFs: string[] = [];
        const etfSources: Record<string, string> = {};
        const virtualPositions: PosWithSector[] = [];

        for (const etfPos of etfPositions) {
          const holdings = await resolveHoldings(etfPos.ticker);
          if (!holdings || holdings.length === 0) {
            unsupportedETFs.push(etfPos.ticker);
            continue;
          }

          supportedETFs.push(etfPos.ticker);
          etfSources[etfPos.ticker] = "stored";
          const totalWeight = holdings.reduce((s, h) => s + h.weight_pct, 0);
          if (totalWeight <= 0) continue;

          // Remove original ETF position
          const idx = positions.indexOf(etfPos);
          if (idx >= 0) positions.splice(idx, 1);

          for (const h of holdings) {
            if (h.ticker.startsWith("OUTROS.")) continue;
            const valueBRL = (h.weight_pct / totalWeight) * etfPos.valorBRL;
            const costBRL = (h.weight_pct / totalWeight) * etfPos.custoTotalBRL;
            const cleanTicker = h.ticker.replace(/\.SA$/, "").replace(/\.(L|DE|TO|AS)$/, "");
            const se = getSetorEconomico(cleanTicker, "Ações Internacional");

            virtualPositions.push({
              ticker: cleanTicker,
              nome: h.name,
              setor: "Ações Internacional",
              setorEconomico: se,
              industry: "",
              valorBRL: valueBRL,
              custoTotalBRL: costBRL,
              lucroBRL: valueBRL - costBRL,
              lucroPct: costBRL > 0 ? ((valueBRL - costBRL) / costBRL) * 100 : 0,
              moeda: etfPos.moeda,
              tipo: "RV",
            });
          }

          // Add tail bucket for uncovered weight
          const coveredPct = holdings.filter(h => !h.ticker.startsWith("OUTROS.")).reduce((s, h) => s + h.weight_pct, 0);
          const uncoveredBRL = etfPos.valorBRL * Math.max(0, (100 - coveredPct) / 100);
          if (uncoveredBRL > 1) {
            virtualPositions.push({
              ticker: `Outros (${etfPos.ticker})`,
              nome: `Demais ativos de ${etfPos.ticker}`,
              setor: "ETF USA",
              setorEconomico: "Outros",
              industry: "",
              valorBRL: uncoveredBRL,
              custoTotalBRL: uncoveredBRL,
              lucroBRL: 0,
              lucroPct: 0,
              moeda: etfPos.moeda,
              tipo: "RV",
            });
          }
        }

        // Merge virtual positions with existing direct positions (same ticker)
        for (const vp of virtualPositions) {
          const existing = positions.find(
            p => p.ticker === vp.ticker && p.tipo === "RV"
          );
          if (existing) {
            const combinedCost = existing.custoTotalBRL + vp.custoTotalBRL;
            existing.valorBRL += vp.valorBRL;
            existing.custoTotalBRL = combinedCost;
            existing.lucroBRL = existing.valorBRL - combinedCost;
            existing.lucroPct = combinedCost > 0
              ? ((existing.valorBRL - combinedCost) / combinedCost) * 100
              : 0;
          } else {
            positions.push(vp);
          }
        }

        lookThroughMeta = {
          supported: supportedETFs,
          unsupported: unsupportedETFs,
          sources: etfSources,
        };
      }
    }

    // Aggregate by sector
    const totalBRL = positions.reduce((s, p) => s + p.valorBRL, 0);

    interface SectorAgg {
      setor: string;
      valorBRL: number;
      pct: number;
      posicoes: PosWithSector[];
    }

    const sectorMap = new Map<string, SectorAgg>();
    for (const p of positions) {
      const existing = sectorMap.get(p.setorEconomico);
      if (existing) {
        existing.valorBRL += p.valorBRL;
        existing.posicoes.push(p);
      } else {
        sectorMap.set(p.setorEconomico, {
          setor: p.setorEconomico,
          valorBRL: p.valorBRL,
          pct: 0,
          posicoes: [p],
        });
      }
    }

    const sectors = [...sectorMap.values()]
      .map((s) => ({ ...s, pct: totalBRL > 0 ? (s.valorBRL / totalBRL) * 100 : 0 }))
      .sort((a, b) => b.valorBRL - a.valorBRL);

    for (const s of sectors) {
      s.posicoes.sort((a, b) => b.valorBRL - a.valorBRL);
    }

    return NextResponse.json({
      totalBRL,
      rvBRL: snapshot.rvPatrimonioBRL,
      rfBRL: snapshot.rfPatrimonioBRL,
      sectors,
      positions: positions.sort((a, b) => b.valorBRL - a.valorBRL),
      fx: fxAtual,
      timestamp: cotacoes.timestamp,
      ...(lookThroughMeta ? { lookthrough: lookThroughMeta } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
