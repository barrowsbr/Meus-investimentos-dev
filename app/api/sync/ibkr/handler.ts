import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { backupTab } from "@/lib/backup";
import {
  IbkrEvent,
  IbkrTrade,
  normalizeDate,
  normalizeTicker,
  parseValor,
  buildTrade,
  buildProvento,
  findMissingProventos,
  findMissingTrades,
} from "@/lib/ibkr-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── IBKR CSV Parser ───────────────────────────────────────────────────────────
// (a dedup, os tipos e os builders vivem em lib/ibkr-sync.ts — fonte única,
//  compartilhada com o sync via Flex Web Service)

function parseIBKRCsv(content: string): { proventos: IbkrEvent[]; trades: IbkrTrade[] } {
  const lines = content.split(/\r?\n/);
  const proventos: IbkrEvent[] = [];
  const trades: IbkrTrade[] = [];

  for (const line of lines) {
    // IBKR CSV transaction header: "Histórico de transações,Data,..."
    if (!line.startsWith("Histórico de transações,")) continue;
    const parts = line.split(",");
    if (parts.length < 11) continue;

    const data = normalizeDate(parts[2]?.trim() ?? "");
    const descricao = parts[4]?.trim() ?? "";
    const tipo = parts[5]?.trim() ?? "";
    const simbolo = parts[6]?.trim() ?? "";
    const moedaPreco = (parts[9]?.trim() ?? "");
    const valorStr = parts[10]?.trim() ?? "";

    if (!data || !simbolo) continue;

    const ticker = normalizeTicker(simbolo);

    let moeda = "USD";
    const KNOWN = ["USD", "CAD", "EUR", "GBP", "JPY", "CHF", "AUD", "HKD", "SGD", "SEK", "NOK", "DKK", "NZD"];
    if (moedaPreco && moedaPreco !== "-" && KNOWN.includes(moedaPreco.toUpperCase())) {
      moeda = moedaPreco.toUpperCase();
    } else {
      for (const m of ["CAD", "EUR", "GBP", "JPY", "CHF", "AUD"]) {
        if (descricao.includes(m)) { moeda = m; break; }
      }
    }

    if (tipo === "Dividendo" || tipo === "Dividend") {
      const valor = parseValor(valorStr);
      proventos.push(buildProvento({ ticker, data, isImposto: false, valor, moeda }));
    } else if (tipo === "Retenção de imposto estrangeiro" || tipo.includes("Tax")) {
      const valor = parseValor(valorStr);
      proventos.push(buildProvento({ ticker, data, isImposto: true, valor, moeda }));
    } else if (["Compra", "Venda", "Buy", "Sell"].includes(tipo)) {
      const qtdStr = parts[7]?.trim() ?? "0";
      const precoStr = parts[8]?.trim() ?? "0";
      const comissaoStr = parts[11]?.trim() ?? "0";

      const qtd = Math.abs(parseValor(qtdStr));
      const preco = Math.abs(parseValor(precoStr));
      const comissao = Math.abs(parseValor(comissaoStr));
      let valorBruto = Math.abs(parseValor(valorStr));
      if (valorBruto === 0 && qtd > 0 && preco > 0) {
        valorBruto = Math.round(qtd * preco * 100) / 100;
      }
      const tipoNorm = ["Compra", "Buy"].includes(tipo) ? "Compra" : "Venda";
      trades.push(buildTrade({ data, tipo: tipoNorm, ticker, qtd, preco, valorBruto, comissao, moeda }));
    }
  }

  return { proventos, trades };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const store = getDataStore();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) ?? "proventos"; // "proventos" | "trades" | "both"
    const dryRun = formData.get("dry_run") === "true";

    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 400 });
    }

    const content = await file.text();
    const { proventos: parsedProventos, trades: parsedTrades } = parseIBKRCsv(content);

    const result: Record<string, unknown> = {
      parsed: {
        proventos: parsedProventos.length,
        trades: parsedTrades.length,
      },
    };

    if (["proventos", "both"].includes(mode) && parsedProventos.length > 0) {
      const existing = await store.fetchTab("meus_proventos");
      const missing = findMissingProventos(existing, parsedProventos);

      result.proventos = {
        total_csv: parsedProventos.length,
        faltantes: missing.length,
        preview: missing.slice(0, 5),
      };

      if (!dryRun && missing.length > 0) {
        await backupTab("meus_proventos").catch(() => {});
        const COLS = ["ticker", "data", "decisao", "mes", "ano", "lancamento", "categoria", "valor", "moeda"];
        const rows = missing.map(e => COLS.map(c => (e as unknown as Record<string, string>)[c] ?? ""));
        await store.appendRows("meus_proventos", rows);
        (result.proventos as Record<string, unknown>).inserted = missing.length;
      }
    }

    if (["trades", "both"].includes(mode) && parsedTrades.length > 0) {
      const existing = await store.fetchTab("meus_ativos");
      const allMissing = findMissingTrades(existing, parsedTrades);

      const trulyMissing = allMissing.filter(t => t.status_match === "MISSING");
      const potentialSplits = allMissing.filter(t => t.status_match === "POTENTIAL_SPLIT");

      result.trades = {
        total_csv: parsedTrades.length,
        existing_count: existing.length,
        faltantes: trulyMissing.length,
        potential_splits: potentialSplits.length,
        preview: allMissing.slice(0, 10).map(t => ({
          ...t,
          status_match: t.status_match,
          match_details: t.match_details,
        })),
      };

      if (!dryRun && trulyMissing.length > 0) {
        await backupTab("meus_ativos").catch(() => {});
        const COLS = ["Data", "Tipo de transação", "Símbolo", "Quantidade", "Preço", "Valor bruto", "Taxa de corretagem", "Valor líquido", "Moeda", "Corretora"];
        const rows = trulyMissing.map(t => COLS.map(c => (t as unknown as Record<string, string>)[c] ?? ""));
        await store.appendRows("meus_ativos", rows);
        (result.trades as Record<string, unknown>).inserted = trulyMissing.length;
      }
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
