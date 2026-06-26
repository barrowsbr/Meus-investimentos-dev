import { NextRequest, NextResponse } from "next/server";
import { resolveAssetMeta, resolveMultipleAssets, persistAssetMeta } from "@/lib/asset-meta";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/asset/validate?ticker=VOW3&moeda=EUR&corretora=IBKR
 *   → Resolve um ticker via Yahoo Finance e retorna metadados completos.
 *
 * POST /api/asset/validate
 *   body: { tickers: [{ ticker, moeda?, corretora? }], persist?: boolean }
 *   → Resolve múltiplos tickers em batch. Se persist=true, salva na aba ativos_meta.
 */

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim();
  if (!ticker) {
    return NextResponse.json({ error: "Parâmetro 'ticker' obrigatório" }, { status: 400 });
  }

  const moeda = req.nextUrl.searchParams.get("moeda")?.trim();
  const corretora = req.nextUrl.searchParams.get("corretora")?.trim();

  try {
    const meta = await resolveAssetMeta(ticker, { moeda: moeda || undefined, corretora: corretora || undefined });
    if (!meta) {
      return NextResponse.json(
        { error: `Ticker "${ticker}" não encontrado no Yahoo Finance`, ticker },
        { status: 404 },
      );
    }

    return NextResponse.json({ meta });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tickers: { ticker: string; moeda?: string; corretora?: string }[] = body.tickers ?? [];
    const shouldPersist = body.persist === true;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: "Campo 'tickers' obrigatório (array)" }, { status: 400 });
    }

    if (tickers.length > 50) {
      return NextResponse.json({ error: "Máximo de 50 tickers por request" }, { status: 400 });
    }

    const validTickers = tickers.filter(
      (t): t is { ticker: string; moeda?: string; corretora?: string } =>
        t != null && typeof t === "object" && typeof t.ticker === "string" && t.ticker.trim().length > 0,
    );
    if (validTickers.length === 0) {
      return NextResponse.json({ error: "Nenhum ticker válido no array" }, { status: 400 });
    }

    const results = await resolveMultipleAssets(validTickers);

    const resolved: Record<string, unknown> = {};
    const notFound: string[] = [];

    for (const t of validTickers) {
      const meta = results.get(t.ticker);
      if (meta) {
        resolved[t.ticker] = meta;
      } else {
        notFound.push(t.ticker);
      }
    }

    if (shouldPersist && results.size > 0) {
      await persistAssetMeta([...results.values()]);
    }

    return NextResponse.json({
      resolved,
      notFound,
      total: validTickers.length,
      resolvedCount: results.size,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
