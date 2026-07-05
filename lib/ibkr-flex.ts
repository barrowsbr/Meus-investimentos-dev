/**
 * IBKR Flex Web Service — busca o extrato (Activity Flex Query) via 2 chamadas
 * HTTPS, SEM gateway/TWS. Token + Query ID configurados no Client Portal.
 *
 *   1. SendRequest?t=TOKEN&q=QUERY_ID  → ReferenceCode
 *   2. GetStatement?t=TOKEN&q=REF      → XML do extrato (poll: 1019 = gerando)
 *
 * O XML é mapeado para os MESMOS objetos do import por arquivo (lib/broker-import.ts),
 * então flui pela MESMA dedup/filtros — inclusive forex → aba câmbio.
 */

import {
  ProventoRow,
  TradeRow,
  CambioRow,
  makeProvento,
  makeTradeRow,
  makeCambioRow,
  normalizeDate,
  normalizeTicker,
  parseValor,
  isForexSymbol,
} from "./broker-import";

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
  proventos: ProventoRow[];
  trades: TradeRow[];
  cambio: CambioRow[];
  positions: IbkrPosition[];
  cashBalances: { moeda: string; saldo: number }[];
  marginBalances: { moeda: string; saldo: number; jurosAcruados: number; initMargin: number; maintMargin: number }[];
  proventosDupsRemoved: number;
  /** Bolsa de listagem por ticker (atributo listingExchange do Flex) — pista
   *  determinística para a grafia Yahoo (TSE→.TO, AEB→.AS, IBIS→.DE…). */
  exchangeBySymbol: Record<string, string>;
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

/** Extrai os atributos de cada `<Tag ...>`. O `\b` evita casar Trade com Trades. */
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

export interface FlexMeta {
  accountId: string;
  fromDate: string;
  toDate: string;
}

/** Metadados do extrato (conta, período coberto). */
export function parseFlexMeta(xml: string): FlexMeta {
  const m = xml.match(/<FlexStatement\b([^>]*)>/);
  const a = m ? parseAttrs(m[1]) : {};
  return {
    accountId: a.accountId ?? "",
    fromDate: normalizeDate(a.fromDate ?? ""),
    toDate: normalizeDate(a.toDate ?? ""),
  };
}

// Cache em memória do XML — a geração do extrato leva ~10s; evita refetch a cada
// abertura de página. TTL padrão 30 min (o extrato muda no máximo 1×/dia).
let _flexCache: { at: number; xml: string } | null = null;
export async function getFlexXmlCached(token: string, queryId: string, ttlMs = 1_800_000): Promise<string> {
  if (_flexCache && Date.now() - _flexCache.at < ttlMs) return _flexCache.xml;
  const xml = await fetchFlexStatement(token, queryId);
  _flexCache = { at: Date.now(), xml };
  return xml;
}

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
  for (; ;) {
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
  const proventos: ProventoRow[] = [];
  const trades: TradeRow[] = [];
  const cambio: CambioRow[] = [];
  const positions: IbkrPosition[] = [];
  const cashBalances: { moeda: string; saldo: number }[] = [];
  const marginBalances: { moeda: string; saldo: number; jurosAcruados: number; initMargin: number; maintMargin: number }[] = [];
  const exchangeBySymbol: Record<string, string> = {};
  const noteExchange = (symbol: string, attrs: Record<string, string>) => {
    const ex = (attrs.listingExchange ?? attrs.exchange ?? "").trim();
    const tk = normalizeTicker(symbol);
    if (ex && tk && !exchangeBySymbol[tk]) exchangeBySymbol[tk] = ex;
  };

  for (const a of extractElements(xml, "Trade")) {
    const lod = (a.levelOfDetail ?? "").toUpperCase();
    if (lod === "SYMBOL_SUMMARY" || lod === "ASSET_SUMMARY") continue;
    const symbol = a.symbol ?? "";
    const buySell = (a.buySell ?? "").toUpperCase();
    if (!symbol || (buySell !== "BUY" && buySell !== "SELL")) continue;

    const date = normalizeDate(a.tradeDate ?? a.dateTime ?? "");
    const absQty = Math.abs(parseValor(a.quantity ?? "0"));
    const preco = Math.abs(parseValor(a.tradePrice ?? "0"));

    // Forex (USD.CAD, EUR.USD…) → aba câmbio (com filtro de micro-ajustes).
    const fx = symbol.toUpperCase().match(/^([A-Z]{3})\.([A-Z]{3})$/);
    if (isForexSymbol(symbol) && fx) {
      const row = makeCambioRow({
        date,
        base: fx[1],
        quote: fx[2],
        signedQty: buySell === "BUY" ? absQty : -absQty,
        price: preco,
        corretora: "IBKR",
      });
      if (row) cambio.push(row);
      continue;
    }

    const comissao = Math.abs(parseValor(a.ibCommission ?? "0"));
    let valorBruto = Math.abs(parseValor(a.tradeMoney ?? "0"));
    if (valorBruto === 0 && absQty > 0 && preco > 0) valorBruto = Math.round(absQty * preco * 100) / 100;

    noteExchange(symbol, a);
    trades.push(makeTradeRow({
      data: date,
      tipo: buySell === "BUY" ? "Compra" : "Venda",
      ticker: normalizeTicker(symbol),
      qtd: absQty,
      preco,
      valorBruto,
      comissao,
      moeda: (a.currency ?? "USD").toUpperCase(),
      corretora: "IBKR",
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

    noteExchange(symbol, a);
    proventos.push(makeProvento(
      normalizeTicker(symbol),
      normalizeDate(a.reportDate ?? a.dateTime ?? a.settleDate ?? ""),
      isImposto ? "IMPOSTO" : "Dividendo",
      amount,
      (a.currency ?? "USD").toUpperCase(),
      "Ação Internacional",
    ));
  }

  // Open positions — foto atual (reconciliação; NÃO gravada na planilha).
  for (const a of extractElements(xml, "OpenPosition")) {
    const symbol = a.symbol ?? "";
    if (!symbol) continue;
    noteExchange(symbol, a);
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

  // Cash balances — tag <CashReportCurrency>
  const cashBalancesMap = new Map<string, number>();
  const marginBalancesMap = new Map<string, { moeda: string; saldo: number; jurosAcruados: number; initMargin: number; maintMargin: number }>();

  for (const a of extractElements(xml, "CashReportCurrency")) {
    const currency = (a.currency ?? "").toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(currency)) continue; // ignora totais/resumos como BASE SUMMARY
    const saldo = parseValor(a.endingCash ?? "0");

    if (saldo < -0.001) {
      // Saldo negativo = margem (alavancagem)
      const existing = marginBalancesMap.get(currency) ?? {
        moeda: currency,
        saldo: 0,
        jurosAcruados: 0,
        initMargin: 0,
        maintMargin: 0,
      };
      existing.saldo += Math.abs(saldo);
      marginBalancesMap.set(currency, existing);
    } else if (saldo > 0.001) {
      cashBalancesMap.set(currency, (cashBalancesMap.get(currency) ?? 0) + saldo);
    }
  }

  for (const [currency, saldo] of cashBalancesMap.entries()) {
    cashBalances.push({ moeda: currency, saldo });
  }

  for (const mb of marginBalancesMap.values()) {
    marginBalances.push(mb);
  }

  // Interest Accruals (Juros acruados de margem)
  for (const a of extractElements(xml, "InterestAccrualsCurrency")) {
    const currency = (a.currency ?? "").toUpperCase();
    if (!currency) continue;
    const accrued = Math.abs(parseValor(a.accruedInterest ?? "0"));
    const mb = marginBalances.find(m => m.moeda === currency);
    if (mb) {
      mb.jurosAcruados = accrued;
    }
  }

  // Margin Report (Requisitos de margem)
  for (const a of extractElements(xml, "MarginReport")) {
    const currency = (a.currency ?? "").toUpperCase();
    if (!currency || currency === "BASE_SUMMARY") continue;
    const mb = marginBalances.find(m => m.moeda === currency);
    if (mb) {
      mb.initMargin = parseValor(a.initialMarginRequirement ?? "0");
      mb.maintMargin = parseValor(a.maintenanceMarginRequirement ?? "0");
    }
  }

  // A seção Cash Transactions da Flex pode emitir cada lançamento 2× (bit-idêntico)
  // — colapsa as duplicatas. Pares dividendo+imposto NÃO são duplicata (decisao/
  // valor diferentes), então são preservados.
  const seenProv = new Set<string>();
  let proventosDupsRemoved = 0;
  const proventosUnique: ProventoRow[] = [];
  for (const p of proventos) {
    const k = `${p.data}|${p.ticker}|${p.decisao}|${p.valor}|${p.moeda}`;
    if (seenProv.has(k)) { proventosDupsRemoved++; continue; }
    seenProv.add(k);
    proventosUnique.push(p);
  }

  return { proventos: proventosUnique, trades, cambio, positions, cashBalances, marginBalances, proventosDupsRemoved, exchangeBySymbol };
}
