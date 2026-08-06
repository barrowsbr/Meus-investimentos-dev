// Fontes do painel de Juros Futuros — SERVER-ONLY. Todas gratuitas e sem chave.
//
//  • Tesouro Direto (JSON público da B3) → curva nominal (Prefixado) e real (IPCA+).
//    É a melhor fonte ABERTA de juros futuros do Brasil: o DI Futuro da B3 não tem
//    API gratuita (só market data pago ou scraping frágil da página de ajustes).
//  • BCB Olinda / Focus → trajetória esperada da Selic, reunião a reunião do Copom.
//  • BCB SGS 432 → Selic meta de hoje (âncora do gráfico).
//
// PARSING TOLERANTE de propósito: o JSON do Tesouro usa nomes abreviados
// (anulInvstmtRate, mtrtyDt…) que podem mudar. Em vez de quebrar, tentamos várias
// grafias e caímos para busca profunda por chave. Qualquer falha → [] + aviso,
// nunca número inventado.

import type { Vertice, PontoSelic } from "./types";
import { anosAte } from "./analise";

const TIMEOUT = 15000;
const UA = "Mozilla/5.0 (compatible; MeusInvestimentos/1.0)";

// O host do Tesouro (B3) fica atrás de Akamai, que BLOQUEIA requisição de
// datacenter sem cara de navegador. Estes cabeçalhos imitam um Chrome real.
const HEADERS_NAVEGADOR: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  Referer: "https://www.tesourodireto.com.br/titulos/precos-e-taxas.htm",
  Origin: "https://www.tesourodireto.com.br",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

async function getJson<T = unknown>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/**
 * GET que REPORTA o motivo da falha (status HTTP / exceção) em vez de engolir.
 * Sem isso, um 403 do Akamai vira só "indisponível" e não dá para diagnosticar.
 * Tenta com cabeçalhos de navegador e, se falhar, uma vez sem eles (há WAF que
 * rejeita justamente o conjunto completo).
 */
async function getJsonDiag<T = unknown>(url: string): Promise<{ data: T | null; erro: string | null }> {
  const tentativas: Array<Record<string, string>> = [
    HEADERS_NAVEGADOR,
    { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
  ];
  let ultimo = "sem resposta";
  for (const headers of tentativas) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store", headers });
      if (r.ok) {
        try {
          return { data: (await r.json()) as T, erro: null };
        } catch {
          ultimo = "resposta não é JSON válido";
          continue;
        }
      }
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      ultimo = e instanceof Error ? (e.name === "TimeoutError" ? "tempo esgotado" : e.message) : String(e);
    }
  }
  return { data: null, erro: ultimo };
}

// ── helpers de leitura tolerante ─────────────────────────────────────────────
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null;

/** Primeiro valor numérico entre as chaves candidatas (case-insensitive). */
function num(o: Obj, ...keys: string[]): number | null {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = lower.get(k.toLowerCase());
    if (real == null) continue;
    const v = o[real];
    const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
    if (isFinite(n)) return n;
  }
  return null;
}
/** Primeira string entre as chaves candidatas. */
function str(o: Obj, ...keys: string[]): string | null {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = lower.get(k.toLowerCase());
    if (real == null) continue;
    const v = o[real];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
/** Procura em profundidade o primeiro array cujo 1º item tenha alguma das chaves. */
function findList(root: unknown, marcadores: string[]): Obj[] {
  const visto = new Set<unknown>();
  const fila: unknown[] = [root];
  while (fila.length) {
    const cur = fila.shift();
    if (!isObj(cur) && !Array.isArray(cur)) continue;
    if (visto.has(cur)) continue;
    visto.add(cur);
    if (Array.isArray(cur)) {
      const first = cur.find(isObj) as Obj | undefined;
      if (first) {
        const keys = new Set(Object.keys(first).map((k) => k.toLowerCase()));
        const achatado = isObj(first) ? Object.values(first).find(isObj) : undefined;
        const keys2 = achatado ? new Set(Object.keys(achatado).map((k) => k.toLowerCase())) : new Set<string>();
        if (marcadores.some((m) => keys.has(m.toLowerCase()) || keys2.has(m.toLowerCase()))) return cur.filter(isObj) as Obj[];
      }
      fila.push(...cur);
    } else {
      fila.push(...Object.values(cur));
    }
  }
  return [];
}

const soData = (s: string | null): string | null => (s ? s.slice(0, 10) : null);

function classificar(nome: string, indexRaw: string | null): Vertice["indexador"] | null {
  const alvo = `${indexRaw ?? ""} ${nome}`.toUpperCase();
  if (alvo.includes("IPCA")) return "IPCA";
  if (alvo.includes("SELIC")) return "SELIC";
  if (alvo.includes("PREFIX")) return "PREFIXADO";
  return null;
}

// ── Tesouro Direto ───────────────────────────────────────────────────────────
const TD_URL = "https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json";

export interface TesouroResultado {
  vertices: Vertice[];
  fechamento: string | null;
  ok: boolean;
  erro?: string | null;
}

/**
 * Curva do Tesouro Direto. Exclui LFT (Selic — não tem taxa de curva) e os
 * produtos de anuidade (Renda+/Educa+), cujo prazo de conversão distorceria a
 * curva. `hojeISO` é injetável para teste.
 */
export function parseTesouro(raw: unknown, hojeISO: string): TesouroResultado {
  const lista = findList(raw, [
    "anulInvstmtRate", "mtrtyDt", "TrsrBd",           // grafia atual da B3
    "investmentRate", "maturityDate", "taxaCompra", "vencimento", // alternativas
  ]);
  const vertices: Vertice[] = [];

  for (const item of lista) {
    // o título pode vir direto ou aninhado em TrsrBd
    const bd: Obj = (isObj(item.TrsrBd) ? (item.TrsrBd as Obj) : item) as Obj;
    const nome = str(bd, "nm", "name", "nome");
    if (!nome) continue;
    if (/renda\+|educa\+/i.test(nome)) continue; // anuidades: fora da curva

    const idxObj = isObj(bd.FinIndxs) ? (bd.FinIndxs as Obj) : null;
    const indexador = classificar(nome, idxObj ? str(idxObj, "nm", "name") : null);
    if (!indexador || indexador === "SELIC") continue; // LFT não entra na curva

    const venc = soData(str(bd, "mtrtyDt", "maturityDate", "vencimento"));
    const taxa = num(bd, "anulInvstmtRate", "investmentRate", "taxaCompra");
    if (!venc || taxa == null || taxa <= 0) continue;

    const anos = anosAte(venc, hojeISO);
    if (anos <= 0) continue; // vencido

    vertices.push({
      titulo: nome,
      indexador,
      vencimento: venc,
      anos,
      taxa,
      taxaResgate: num(bd, "anulRedRate", "redemptionRate"),
      precoUnitario: num(bd, "untrInvstmtVal", "unitInvestmentValue"),
      juroSemestral: Boolean(bd.semiAnlIntrstInd ?? bd.semiannualInterest ?? /com juros semestrais|NTN-F/i.test(nome)),
    });
  }

  // data de referência do mercado, se vier
  let fechamento: string | null = null;
  const buscaFech = (o: unknown): void => {
    if (fechamento || !isObj(o)) return;
    const c = str(o as Obj, "clsgDtTm", "opngDtTm", "closingDateTime");
    if (c) { fechamento = soData(c); return; }
    for (const v of Object.values(o as Obj)) if (isObj(v)) buscaFech(v);
  };
  buscaFech(raw);

  vertices.sort((a, b) => a.anos - b.anos);
  return { vertices, fechamento, ok: vertices.length > 0 };
}

// Espelhos conhecidos do mesmo JSON — se o principal for barrado pelo WAF,
// tentamos o outro antes de desistir.
const TD_URLS = [
  TD_URL,
  "https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json?",
  "https://apitesourodireto.b3.com.br/treasury/api/v1/treasurybonds",
];

export async function fetchTesouro(hojeISO: string): Promise<TesouroResultado> {
  const motivos: string[] = [];
  for (const url of TD_URLS) {
    const { data, erro } = await getJsonDiag(url);
    if (data) {
      const r = parseTesouro(data, hojeISO);
      if (r.ok) return r;
      motivos.push(`${new URL(url).hostname}: resposta sem títulos reconhecidos`);
    } else if (erro) {
      motivos.push(`${new URL(url).hostname}: ${erro}`);
    }
  }
  return { vertices: [], fechamento: null, ok: false, erro: motivos.join(" · ") || "sem resposta" };
}

// ── Focus: trajetória da Selic por reunião do Copom ──────────────────────────
const OLINDA = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata";

/** Mantém só a coleta MAIS RECENTE de cada reunião e ordena por reunião. */
export function parseTrajetoriaSelic(rows: Obj[]): PontoSelic[] {
  const porReuniao = new Map<string, PontoSelic>();
  for (const r of rows) {
    const reuniao = str(r, "Reuniao", "reuniao");
    const data = soData(str(r, "Data", "data"));
    const mediana = num(r, "Mediana", "mediana");
    if (!reuniao || !data || mediana == null) continue;
    const atual = porReuniao.get(reuniao);
    if (!atual || data > atual.data) {
      porReuniao.set(reuniao, {
        reuniao,
        data,
        mediana,
        minimo: num(r, "Minimo", "minimo"),
        maximo: num(r, "Maximo", "maximo"),
      });
    }
  }
  // "R1/2027" → ordena por ano e depois por número da reunião
  const chave = (s: string) => {
    const m = s.match(/R(\d+)\s*\/\s*(\d{4})/i);
    return m ? Number(m[2]) * 100 + Number(m[1]) : 0;
  };
  return [...porReuniao.values()].sort((a, b) => chave(a.reuniao) - chave(b.reuniao));
}

export async function fetchTrajetoriaSelic(): Promise<PontoSelic[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - 30); // coletas do último mês; ficamos com a mais nova
  const filtro = `baseCalculo eq 0 and Data ge '${desde.toISOString().slice(0, 10)}'`;
  const url =
    `${OLINDA}/ExpectativasMercadoSelic?$format=json&$top=2000` +
    `&$select=Data,Reuniao,Mediana,Minimo,Maximo&$orderby=Data desc&$filter=${encodeURIComponent(filtro)}`;
  const j = await getJson<{ value?: Obj[] }>(url);
  const rows = Array.isArray(j?.value) ? j!.value! : [];
  return parseTrajetoriaSelic(rows);
}

// ── Selic meta de hoje (SGS 432) ─────────────────────────────────────────────
export async function fetchSelicMeta(): Promise<number | null> {
  const j = await getJson<Array<{ valor?: string }>>(
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json",
  );
  const v = Array.isArray(j) ? Number(String(j[0]?.valor ?? "").replace(",", ".")) : NaN;
  return isFinite(v) ? v : null;
}
