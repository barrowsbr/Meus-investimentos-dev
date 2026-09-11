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
  /** NAV diário em moeda BASE (seção "Equity Summary in Base by Report Date").
   *  É o MESMO número que o PortfolioAnalyst usa para o TWR oficial. Vazio
   *  enquanto a seção não estiver habilitada na Flex query. */
  navDiario: { date: string; nav: number }[];
  /** Depósitos/retiradas em moeda base (CashTransaction type Deposits/Withdrawals)
   *  — os fluxos EXTERNOS que ficam FORA do retorno no TWR. */
  fluxosExternos: { date: string; valor: number }[];
  /** Seção "Change in NAV" (resumo do período), com o TWR oficial quando o
   *  campo Time Weighted Rate of Return está habilitado na query. */
  changeInNav: ChangeInNav | null;
  /** Cobranças da corretora no período (CashTransaction que NÃO é dividendo,
   *  imposto nem depósito): juros de margem pagos e taxas avulsas. Antes eram
   *  lidos e descartados — é o que responde "quanto a corretora me cobrou". */
  custosCorretora: { date: string; tipo: string; descricao: string; valor: number; moeda: string; valorBase: number }[];
  /** Composição do NAV dia a dia, em moeda base. A seção de NAV diário traz
   *  ~100 atributos por linha e o motor só usava `total`; aqui vêm as partes
   *  que dizem COMO o patrimônio estava alocado e o que havia a receber. */
  navComposicao: {
    date: string; total: number; caixa: number; acoes: number; fundos: number;
    dividendosAReceber: number; jurosAReceber: number; taxasAPagar: number;
  }[];
}

/** Decomposição do resultado do período direto do extrato — a "ponte" entre o
 *  NAV inicial e o final. A IBKR entrega ~56 campos aqui; estes são os que
 *  explicam o resultado de quem investe (o resto é para conta de assessor,
 *  cripto na Paxos, SLB etc. e fica de fora de propósito). */
export interface ChangeInNav {
  startingValue: number;
  endingValue: number;
  depositsWithdrawals: number;
  twr: number | null;
  /** Marcação a mercado das posições abertas (o ganho que ainda é "de papel"). */
  mtm: number;
  /** Resultado realizado nas vendas do período. */
  realized: number;
  /** Variação do não-realizado — complementa o mtm na leitura do período. */
  changeInUnrealized: number;
  dividendos: number;
  impostoRetido: number;
  juros: number;
  comissoes: number;
  outrasTaxas: number;
  /** Efeito de converter posições em outras moedas para a moeda base. É a
   *  linha que explica "o ativo subiu e mesmo assim rendi menos". */
  fxTranslation: number;
  /** Variação dos valores só PROVISIONADOS (ainda não pagos) no período. */
  variacaoDividendosAReceber: number;
  variacaoJurosAReceber: number;
  fromDate: string;
  toDate: string;
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
// Uma requisição em voo por vez: /api/cotacoes pede margem E caixa no mesmo
// request; sem isso, o cache frio dispara DOIS extratos Flex em paralelo.
let _flexInFlight: Promise<string> | null = null;

/** Teto rígido: promessa que rejeita se estourar o orçamento de tempo. */
function comPrazo<T>(p: Promise<T>, ms: number, oQue: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${oQue}: prazo de ${ms}ms esgotado`)), ms)),
  ]);
}

/**
 * XML do Flex com cache. TETO DE TEMPO obrigatório: o IBKR é um enriquecimento
 * (margem/caixa), não pode derrubar a rota principal — /api/cotacoes tem 30s de
 * orçamento e o Flex chegava a esperar 38s, estourando a função inteira (504).
 * Se a atualização falhar mas houver XML antigo em memória, devolve o ANTIGO:
 * dado levemente defasado é muito melhor que a página não carregar.
 */
export async function getFlexXmlCached(
  token: string,
  queryId: string,
  ttlMs = 1_800_000,
  budgetMs = 14_000,
): Promise<string> {
  if (_flexCache && Date.now() - _flexCache.at < ttlMs) return _flexCache.xml;
  if (!_flexInFlight) {
    _flexInFlight = fetchFlexStatement(token, queryId)
      .then((xml) => { _flexCache = { at: Date.now(), xml }; return xml; })
      .finally(() => { _flexInFlight = null; });
  }
  try {
    return await comPrazo(_flexInFlight, budgetMs, "IBKR Flex");
  } catch (e) {
    if (_flexCache) return _flexCache.xml; // stale-while-error
    throw e;
  }
}

// ── Fetch (SendRequest → poll GetStatement) ────────────────────────────────────

async function flexGet(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "meus-investimentos/1.0 (flex-sync)" },
    cache: "no-store",
    // sem isso, um socket pendurado do IBKR bloqueia a função até o limite da
    // Vercel e derruba a rota inteira com 504
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`IBKR Flex HTTP ${res.status}`);
  return res.text();
}

export async function fetchFlexStatement(
  token: string,
  queryId: string,
  opts: { maxWaitMs?: number; pollIntervalMs?: number } = {}
): Promise<string> {
  // 38s era MAIS que o orçamento da rota (/api/cotacoes: maxDuration 30) — a
  // função morria antes de o próprio Flex desistir. Tem que caber com folga.
  const maxWaitMs = opts.maxWaitMs ?? 12000;
  const pollIntervalMs = opts.pollIntervalMs ?? 3000;
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

  // Cash transactions → dividendos, imposto retido e depósitos/retiradas
  // (fluxos externos p/ o TWR). Juros/taxas seguem ignorados.
  const fluxosExternos: { date: string; valor: number }[] = [];
  const seenFluxo = new Set<string>();
  const custosCorretora: FlexParsed["custosCorretora"] = [];
  const seenCusto = new Set<string>();
  for (const a of extractElements(xml, "CashTransaction")) {
    const lod = (a.levelOfDetail ?? "").toUpperCase();
    if (lod === "SUMMARY") continue;
    const symbol = a.symbol ?? "";
    const amount = parseValor(a.amount ?? "0");
    if (amount === 0) continue;

    const type = (a.type ?? "").toLowerCase();

    // Depósito/retirada: sem symbol; converte p/ moeda base via fxRateToBase.
    if (type.includes("deposit") || type.includes("withdraw")) {
      const fxBase = parseValor(a.fxRateToBase ?? "1") || 1;
      const date = normalizeDate(a.reportDate ?? a.dateTime ?? a.settleDate ?? "");
      if (!date) continue;
      // A seção pode emitir cada lançamento 2× bit-idêntico (mesmo caso dos
      // proventos) — dedup por chave exata.
      const k = `${date}|${amount}|${a.currency ?? ""}`;
      if (seenFluxo.has(k)) continue;
      seenFluxo.add(k);
      fluxosExternos.push({ date, valor: amount * fxBase });
      continue;
    }

    const isImposto = type.includes("withholding") || type.includes("tax");
    const isDividend = type.includes("dividend") || type.includes("lieu");

    // O que NÃO é provento nem depósito é cobrança da corretora — juros de
    // margem ("Broker Interest Paid") e taxas ("Other Fees"). Antes isto caía
    // num `continue` e a informação se perdia; é justamente a resposta para
    // "quanto a corretora me cobrou no período".
    if (!isImposto && !isDividend) {
      const date = normalizeDate(a.reportDate ?? a.dateTime ?? a.settleDate ?? "");
      if (!date) continue;
      const moeda = (a.currency ?? "USD").toUpperCase();
      const fxBase = parseValor(a.fxRateToBase ?? "1") || 1;
      const k = `${date}|${amount}|${moeda}|${a.type ?? ""}`;
      if (seenCusto.has(k)) continue; // a seção pode emitir o lançamento 2×
      seenCusto.add(k);
      custosCorretora.push({
        date, tipo: a.type ?? "", descricao: a.description ?? "",
        valor: amount, moeda, valorBase: amount * fxBase,
      });
      continue;
    }

    if (!symbol) continue;

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

  // NAV diário em base — no Client Portal atual a seção chama-se
  // "Net Asset Value (NAV) in Base"; o XML historicamente sai como
  // EquitySummaryByReportDateInBase, mas aceitamos também os nomes novos.
  // Atributo `total`; dedup por data, last-wins.
  const navPorData = new Map<string, number>();
  for (const tag of ["EquitySummaryByReportDateInBase", "NetAssetValueInBase", "EquitySummaryInBase"]) {
    for (const a of extractElements(xml, tag)) {
      const date = normalizeDate(a.reportDate ?? a.date ?? "");
      const nav = parseValor(a.total ?? "0");
      if (date && nav !== 0) navPorData.set(date, nav);
    }
    if (navPorData.size > 0) break; // uma variante basta — não mistura seções
  }
  // Composição do dia: a MESMA linha do NAV já traz caixa, ações, fundos e os
  // valores provisionados (declarados e ainda não pagos). Só o `total` era lido.
  const compPorData = new Map<string, FlexParsed["navComposicao"][number]>();
  for (const tag of ["EquitySummaryByReportDateInBase", "NetAssetValueInBase", "EquitySummaryInBase"]) {
    for (const a of extractElements(xml, tag)) {
      const date = normalizeDate(a.reportDate ?? a.date ?? "");
      const total = parseValor(a.total ?? "0");
      if (!date || total === 0) continue;
      const n = (k: string) => parseValor(a[k] ?? "0");
      compPorData.set(date, {
        date, total,
        caixa: n("cash"),
        acoes: n("stock"),
        fundos: n("funds"),
        dividendosAReceber: n("dividendAccruals"),
        jurosAReceber: n("interestAccruals"),
        taxasAPagar: n("brokerFeesAccrualsComponent"),
      });
    }
    if (compPorData.size > 0) break;
  }
  const navComposicao = [...compPorData.values()].sort((a, b) => a.date.localeCompare(b.date));

  const navDiario = [...navPorData.entries()]
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Change in NAV (resumo do período) — traz o TWR OFICIAL quando habilitado.
  let changeInNav: FlexParsed["changeInNav"] = null;
  const cin = extractElements(xml, "ChangeInNAV")[0];
  if (cin) {
    const twrRaw = cin.twr ?? cin.timeWeightedRateOfReturn ?? "";
    const n = (k: string) => parseValor(cin[k] ?? "0");
    changeInNav = {
      startingValue: n("startingValue"),
      endingValue: n("endingValue"),
      depositsWithdrawals: n("depositsWithdrawals"),
      twr: twrRaw !== "" ? parseValor(twrRaw) : null,
      mtm: n("mtm"),
      realized: n("realized"),
      changeInUnrealized: n("changeInUnrealized"),
      dividendos: n("dividends"),
      // A IBKR emite o imposto retido como valor NEGATIVO (saída). Guardamos
      // como veio, para a soma da ponte fechar sem inverter sinal na leitura.
      impostoRetido: n("withholdingTax"),
      juros: n("interest"),
      comissoes: n("commissions"),
      outrasTaxas: n("otherFees") + n("brokerFees") + n("clientFees"),
      fxTranslation: n("fxTranslation"),
      variacaoDividendosAReceber: n("changeInDividendAccruals"),
      variacaoJurosAReceber: n("changeInInterestAccruals"),
      fromDate: normalizeDate(cin.fromDate ?? ""),
      toDate: normalizeDate(cin.toDate ?? ""),
    };
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

  return { proventos: proventosUnique, trades, cambio, positions, cashBalances, marginBalances, proventosDupsRemoved, exchangeBySymbol, navDiario, navComposicao, fluxosExternos, changeInNav, custosCorretora };
}
