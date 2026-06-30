import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getDataStore } from "@/lib/data-store";
import { getServiceAccountAuth } from "@/lib/gsheets";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const TAB = "fixa_aberta";
const CASH_TICKERS = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

function isCashTicker(ticker: string): boolean {
  const t = ticker.toUpperCase().trim();
  return CASH_TICKERS.has(t) || t.startsWith("CAIXA") || t.startsWith("SALDO") || t.startsWith("CASH");
}

function getAuthSheets() {
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON");
  return google.sheets({ version: "v4", auth });
}

// GET — return all cash positions from fixa_aberta
export async function GET() {
  try {
    const store = getDataStore();
    const rows = await store.fetchTab(TAB);
    let caixa: { ticker: string; atual: number; moeda: string }[] = [];
    const margin: { moeda: string; saldo: number; jurosAcruados: number; initMargin: number; maintMargin: number }[] = [];
    let updated = false;
    let ibkrSuccess = false;

    // 1. Ler os valores do Sheets
    for (const row of rows) {
      const ticker = String(row["ticker"] ?? row["ativo"] ?? "").trim();
      if (!ticker || !isCashTicker(ticker)) continue;
      const atual = Number(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"] ?? 0) || 0;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      caixa.push({ ticker, atual, moeda });
    }

    // 1b. Agrega múltiplas linhas de caixa da mesma moeda em uma só entrada.
    if (caixa.length > 1) {
      const aggregated = new Map<string, { ticker: string; atual: number; moeda: string }>();
      for (const item of caixa) {
        const existing = aggregated.get(item.moeda);
        if (existing) {
          existing.atual += item.atual;
        } else {
          aggregated.set(item.moeda, { ...item });
        }
      }
      caixa = [...aggregated.values()];
    }

    // 2. Buscar saldos do IBKR (se configurado)
    try {
      const token = process.env.IBKR_FLEX_TOKEN;
      const queryId = process.env.IBKR_FLEX_QUERY_ID;
      if (token && queryId) {
        // Import dinâmico para não quebrar dependências caso IBKR não seja usado
        const { getFlexXmlCached, parseFlexXml } = await import("@/lib/ibkr-flex");
        const xml = await getFlexXmlCached(token, queryId);
        const { cashBalances, marginBalances } = parseFlexXml(xml);

        // Agrega saldos da IBKR por moeda antes de atualizar o caixa local.
        const ibkrCashByCurrency = new Map<string, number>();
        for (const ibkr of cashBalances) {
          ibkrCashByCurrency.set(ibkr.moeda, (ibkrCashByCurrency.get(ibkr.moeda) ?? 0) + ibkr.saldo);
        }

        for (const [moeda, saldo] of ibkrCashByCurrency.entries()) {
          const existing = caixa.find(c => c.moeda === moeda);
          if (existing) {
            if (Math.abs(existing.atual - saldo) > 0.02) {
              existing.atual = saldo;
              updated = true;
            }
          } else {
            caixa.push({ ticker: "CAIXA", atual: saldo, moeda });
            updated = true;
          }
        }

        // 2b. Adiciona os saldos de margem (dívida) da IBKR
        for (const mb of marginBalances) {
          margin.push(mb);
        }
        ibkrSuccess = true;
      }
    } catch (e) {
      console.error("Erro ao buscar caixa da IBKR:", e);
    }

    // 3. Se houveram mudanças, salva automaticamente na planilha
    if (updated) {
      try {
        const sheets = getAuthSheets();
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: TAB,
          valueRenderOption: "UNFORMATTED_VALUE",
        });
        const allRows = res.data.values;
        if (allRows && allRows.length >= 1) {
          const header = allRows[0] as string[];
          const headerLower = header.map(h => String(h).trim().toLowerCase());
          const tickerIdx = headerLower.findIndex(h => h === "ticker" || h === "ativo");
          const atualIdx = headerLower.findIndex(h => ["atual", "valor_atual", "saldo", "valor atual"].includes(h));
          const moedaIdx = headerLower.findIndex(h => h === "moeda");

          if (tickerIdx >= 0 && atualIdx >= 0) {
            const nonCashRows = allRows.slice(1).filter(row => {
              const ticker = String(row[tickerIdx] ?? "").trim();
              return ticker && !isCashTicker(ticker);
            });

            const cashRows = caixa.filter(p => p.ticker.trim() && p.atual > 0).map(p => {
              const row: (string | number)[] = new Array(header.length).fill("");
              row[tickerIdx] = p.ticker.trim();
              row[atualIdx] = p.atual;
              if (moedaIdx >= 0) row[moedaIdx] = p.moeda || "BRL";
              return row;
            });

            await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: TAB });
            await sheets.spreadsheets.values.update({
              spreadsheetId: SPREADSHEET_ID,
              range: `${TAB}!A1`,
              valueInputOption: "USER_ENTERED",
              requestBody: { values: [header, ...nonCashRows, ...cashRows] },
            });
            // Opcional: invalidar o cache da aba no store, mas o frontend dará reload ou usará o array atualizado
          }
        }
      } catch (e) {
        console.error("Erro ao auto-salvar caixa:", e);
      }
    }
    return NextResponse.json({ caixa, margin, ibkrSynced: ibkrSuccess });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — save all cash positions (replace entire cash section in fixa_aberta)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const positions: { ticker: string; atual: number; moeda: string }[] = body.positions;
    if (!Array.isArray(positions)) {
      return NextResponse.json({ error: "Campo 'positions' (array) é obrigatório" }, { status: 400 });
    }

    const sheets = getAuthSheets();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: TAB,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const allRows = res.data.values;
    if (!allRows || allRows.length < 1) {
      return NextResponse.json({ error: "Aba fixa_aberta não encontrada ou vazia" }, { status: 404 });
    }

    const header = allRows[0] as string[];
    const headerLower = header.map((h: unknown) => String(h).trim().toLowerCase());
    const tickerIdx = headerLower.findIndex(h => h === "ticker" || h === "ativo");
    const atualIdx = headerLower.findIndex(h => ["atual", "valor_atual", "saldo", "valor atual"].includes(h));
    const moedaIdx = headerLower.findIndex(h => h === "moeda");

    if (tickerIdx < 0 || atualIdx < 0) {
      return NextResponse.json({ error: "Colunas ticker/atual não encontradas em fixa_aberta" }, { status: 500 });
    }

    // Keep non-cash rows unchanged
    const nonCashRows = allRows.slice(1).filter((row) => {
      const ticker = String(row[tickerIdx] ?? "").trim();
      return ticker && !isCashTicker(ticker);
    });

    // Build new cash rows matching the header structure
    const cashRows = positions
      .filter(p => p.ticker.trim() && p.atual > 0)
      .map(p => {
        const row: (string | number)[] = new Array(header.length).fill("");
        row[tickerIdx] = p.ticker.trim();
        row[atualIdx] = p.atual;
        if (moedaIdx >= 0) row[moedaIdx] = p.moeda || "BRL";
        return row;
      });

    // Clear and rewrite
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: TAB,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [header, ...nonCashRows, ...cashRows] },
    });

    return NextResponse.json({ ok: true, saved: cashRows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
