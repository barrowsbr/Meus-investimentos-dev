/**
 * IBKR Flex Web Service — busca o extrato (Activity Flex Query) via 2 chamadas
 * HTTPS, SEM gateway/TWS. Token + Query ID configurados no Client Portal.
 *
 *   1. SendRequest?t=TOKEN&q=QUERY_ID  → ReferenceCode
 *   2. GetStatement?t=TOKEN&q=REF      → XML do extrato (poll: 1019 = gerando)
 *
 * O XML é mapeado para os MESMOS objetos do parser de CSV (buildTrade/
 * buildProvento de lib/ibkr-sync.ts), então flui pela mesma dedup e gravação.
 */

import {
  IbkrEvent,
  IbkrTrade,
  buildTrade,
  buildProvento,
  normalizeDate,
  normalizeTicker,
  parseValor,
} from "./ibkr-sync";

const FLEX_BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";

export interface IbkrPosition {
  ticker: string;
  moeda: string;
  assetClass: string;
  quantidade: number;
  markPrice: number;
  custoPreco: number;
  custoTotal: number;
}

export interface FlexParsed {
  proventos: IbkrEvent[];
  trades: IbkrTrade[];
  positions: IbkrPosition[];
}

// ── XML helpers (formato Flex é plano: elementos auto-fechados com atributos) ──

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    attrs[m[1]] = decodeXmlEntities(m[2]);
  }
  return attrs;
}

/** Extrai os atributos de cada `<Tag .../>`. O `\b` evita casar Trade com Trades. */
function extractElements(xml: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(parseAttrs(m[1]));
  }
  return out;
}

function getTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Fetch (SendRequest → poll GetStatement) ────────────────────────────────────

async function flexGet(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "meus-investimentos/1.0 (flex-sync)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`IBKR Flex HTTP ${res.status}`);
  return res.text();
}

export async function fetchFlexStatement(
  token: string,
  queryId: string,
  opts: { maxWaitMs?: number; pollIntervalMs?: number } = {}
): Promise<string> {
  const maxWaitMs = opts.maxWaitMs ?? 38000;
  const pollIntervalMs = opts.pollIntervalMs ?? 4000;
  const t = encodeURIComponent(token);

  // 1. SendRequest → ReferenceCode
  const reqXml = await flexGet(`${FLEX_BASE}/SendRequest?t=${t}&q=${encodeURIComponent(queryId)}&v=3`);
  if (getTag(reqXml, "Status") !== "Success") {
    const code = getTag(reqXml, "ErrorCode") ?? "?";
    const msg = getTag(reqXml, "ErrorMessage") ?? "SendRequest falhou";
    throw new Error(`IBKR Flex SendRequest: [${code}] ${msg}`);
  }
  const referenceCode = getTag(reqXml, "ReferenceCode");
  const baseUrl = getTag(reqXml, "Url") ?? `${FLEX_BASE}/GetStatement`;
  if (!referenceCode) throw new Error("IBKR Flex: ReferenceCode ausente na resposta");

  // 2. GetStatement → poll (ErrorCode 1019 = extrato ainda em geração)
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const xml = await flexGet(`${baseUrl}?t=${t}&q=${encodeURIComponent(referenceCode)}&v=3`);
    if (xml.includes("<FlexQueryResponse")) return xml;

    const code = getTag(xml, "ErrorCode");
    const status = getTag(xml, "Status");
    if (code === "1019" || status === "Warn") {
      if (Date.now() >= deadline) {
        throw new Error("IBKR Flex: tempo esgotado aguardando a geração do extrato");
      }
      await sleep(pollIntervalMs);
      continue;
    }
    const msg = getTag(xml, "ErrorMessage") ?? "GetStatement retornou resposta inesperada";
    throw new Error(`IBKR Flex GetStatement: [${code ?? "?"}] ${msg}`);
  }
}

// ── Parser: XML → objetos internos ─────────────────────────────────────────────

export function parseFlexXml(xml: string): FlexParsed {
  const proventos: IbkrEvent[] = [];
  const trades: IbkrTrade[] = [];
  const positions: IbkrPosition[] = [];

  // Trades (compra/venda). Ignora linhas de agregação (Symbol/Asset Summary).
  for (const a of extractElements(xml, "Trade")) {
    const lod = (a.levelOfDetail ?? "").toUpperCase();
    if (lod === "SYMBOL_SUMMARY" || lod === "ASSET_SUMMARY") continue;
    const symbol = a.symbol ?? "";
    const buySell = (a.buySell ?? "").toUpperCase();
    if (!symbol || (buySell !== "BUY" && buySell !== "SELL")) continue;

    const qtd = Math.abs(parseValor(a.quantity ?? "0"));
    const preco = Math.abs(parseValor(a.tradePrice ?? "0"));
    const comissao = Math.abs(parseValor(a.ibCommission ?? "0"));
    let valorBruto = Math.abs(parseValor(a.tradeMoney ?? "0"));
    if (valorBruto === 0 && qtd > 0 && preco > 0) valorBruto = Math.round(qtd * preco * 100) / 100;

    trades.push(buildTrade({
      data: normalizeDate(a.tradeDate ?? a.dateTime ?? ""),
      tipo: buySell === "BUY" ? "Compra" : "Venda",
      ticker: normalizeTicker(symbol),
      qtd, preco, valorBruto, comissao,
      moeda: (a.currency ?? "USD").toUpperCase(),
    }));
  }

  // Cash transactions → só dividendos e imposto retido (ignora juros, taxas, etc.)
  for (const a of extractElements(xml, "CashTransaction")) {
    const lod = (a.levelOfDetail ?? "").toUpperCase();
    if (lod === "SUMMARY") continue;
    const symbol = a.symbol ?? "";
    const amount = parseValor(a.amount ?? "0");
    if (!symbol || amount === 0) continue;

    const type = (a.type ?? "").toLowerCase();
    const isImposto = type.includes("withholding") || type.includes("tax");
    const isDividend = type.includes("dividend") || type.includes("lieu");
    if (!isImposto && !isDividend) continue;

    proventos.push(buildProvento({
      ticker: normalizeTicker(symbol),
      data: normalizeDate(a.reportDate ?? a.dateTime ?? a.settleDate ?? ""),
      isImposto,
      valor: amount,
      moeda: (a.currency ?? "USD").toUpperCase(),
    }));
  }

  // Open positions — foto atual (para reconciliação; NÃO é gravada na planilha,
  // pois as posições de RV são derivadas das transações via FIFO).
  for (const a of extractElements(xml, "OpenPosition")) {
    const symbol = a.symbol ?? "";
    if (!symbol) continue;
    positions.push({
      ticker: normalizeTicker(symbol),
      moeda: (a.currency ?? "USD").toUpperCase(),
      assetClass: a.assetCategory ?? "",
      // OpenPosition usa o atributo `position` para a quantidade (não `quantity`).
      quantidade: parseValor(a.position ?? a.quantity ?? "0"),
      markPrice: parseValor(a.markPrice ?? "0"),
      custoPreco: parseValor(a.costBasisPrice ?? "0"),
      custoTotal: parseValor(a.costBasisMoney ?? "0"),
    });
  }

  return { proventos, trades, positions };
}
