// ─────────────────────────────────────────────────────────────────────────────
// Ganho cambial nas LIQUIDAÇÕES para BRL (aba `cambio`) — PF Brasil
// Multi-moeda: rastreia estoque e PM separado por moeda (USD, EUR, CAD, GBP…).
//
// Quando moeda estrangeira volta para reais (FX → BRL), pode haver fato gerador
// sobre a variação cambial. O enquadramento depende da ORIGEM da moeda:
//
//  1. MOEDA EM ESPÉCIE (IN SRF 118/2000, mantida pela Lei 14.754/23):
//     isento se o total de alienações no ano-calendário ≤ equivalente a
//     US$ 5.000; acima, ganho tributado pela tabela progressiva de ganho de
//     capital (15% até R$5mi … 22,5% acima de R$30mi). DARF código 8523/4600.
//  2. CONTA-CORRENTE/CARTÃO NÃO REMUNERADOS: variação cambial ISENTA
//     (Lei 14.754/23, art. 5º).
//  3. VENDA DE APLICAÇÃO FINANCEIRA no exterior: o câmbio já está DENTRO do
//     ganho do ativo (custo pela PTAX compra, venda pela PTAX venda — 15% anual).
//     Conversão posterior NÃO gera novo imposto.
//
// O motor calcula o ganho pelo CUSTO MÉDIO da moeda (remessas BRL→FX) e expõe
// os três enquadramentos — o usuário/contador escolhe o aplicável.
// ─────────────────────────────────────────────────────────────────────────────

import { toNumber } from "../format";

type Row = Record<string, unknown>;

export interface LiquidacaoBRL {
  data: string;
  moeda: string;
  fxAlienado: number;        // quantidade alienada na moeda
  recebidoBRL: number;
  taxaEfetiva: number;       // BRL por unidade da moeda obtido na operação
  pmNaData: number;           // custo médio do estoque na data
  custoBRL: number;
  ganhoBRL: number;
}

export interface AnoCambial {
  ano: string;
  moeda: string;
  fxAlienado: number;         // total alienado no ano (para limite de isenção)
  recebidoBRL: number;
  custoBRL: number;
  ganhoBRL: number;
  isentoEspecie: boolean;
  aliquotaEspecie: number;
  irEspecie: number;
  liquidacoes: LiquidacaoBRL[];
}

export interface EstoqueMoeda {
  moeda: string;
  estoque: number;
  pmBRL: number;              // custo médio por unidade em BRL
}

export interface CambioIr {
  anos: AnoCambial[];
  estoques: EstoqueMoeda[];
  limiteIsencaoEspecieUSD: number;
  // Compat com UI existente (USD-only view)
  pmDolarFinal: number;
  usdEstoqueFinal: number;
}

export function aliquotaGcapProgressiva(ganhoBRL: number): number {
  if (ganhoBRL <= 5_000_000) return 0.15;
  if (ganhoBRL <= 10_000_000) return 0.175;
  if (ganhoBRL <= 30_000_000) return 0.20;
  return 0.225;
}

const LIMITE_ESPECIE_USD = 5000;

function parseDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return s.slice(0, 10);
}

function fuzzy(row: Row, ...keys: string[]): unknown {
  const lower = new Map(Object.keys(row).map(k => [k.toLowerCase().trim(), row[k]]));
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function normalizeCurrency(s: string): string {
  const u = s.toUpperCase().trim();
  if (!u || u === "REAL" || u === "R$" || u === "REAIS") return "BRL";
  if (u === "DÓLAR" || u === "DOLAR" || u === "US$" || u === "DOLLAR") return "USD";
  if (u === "EURO" || u === "€") return "EUR";
  return u;
}

interface FxStock { estoque: number; custoBRL: number; }

export function apurarCambioIr(cambioRows: Row[]): CambioIr {
  interface Op { data: string; orig: string; dest: string; valOrig: number; valDest: number }
  const ops: Op[] = [];
  for (const row of cambioRows) {
    const orig = normalizeCurrency(String(fuzzy(row, "moeda_origem", "moeda origem", "de", "origem") ?? "BRL"));
    const dest = normalizeCurrency(String(fuzzy(row, "moeda_destino", "moeda destino", "para", "destino") ?? "USD"));
    const valOrig = Math.abs(toNumber(fuzzy(row, "valor_origem", "valor total entrada", "valor entrada", "valor_entrada", "valor enviado", "enviado", "brl")) ?? 0);
    const valDest = Math.abs(toNumber(fuzzy(row, "valor_destino", "valor total saída", "valor total saida", "valor saída", "valor_saida", "valor saida", "valor recebido", "recebido", "usd")) ?? 0);
    const data = parseDate(fuzzy(row, "data", "date"));
    if (!data || (valOrig === 0 && valDest === 0)) continue;
    ops.push({ data, orig, dest, valOrig, valDest });
  }
  ops.sort((a, b) => a.data.localeCompare(b.data));

  const stocks = new Map<string, FxStock>();
  const getStock = (m: string): FxStock => {
    if (!stocks.has(m)) stocks.set(m, { estoque: 0, custoBRL: 0 });
    return stocks.get(m)!;
  };

  const liquidacoes: LiquidacaoBRL[] = [];

  for (const op of ops) {
    if (op.orig === "BRL" && op.dest !== "BRL") {
      // BRL → FX: acumula no estoque da moeda destino
      const st = getStock(op.dest);
      st.estoque += op.valDest;
      st.custoBRL += op.valOrig;

    } else if (op.orig !== "BRL" && op.dest === "BRL") {
      // FX → BRL: realiza ganho cambial contra o PM corrente
      const st = getStock(op.orig);
      const pm = st.estoque > 0 ? st.custoBRL / st.estoque : 0;
      const alienado = Math.min(op.valOrig, st.estoque > 0 ? st.estoque : op.valOrig);
      const custoBRL = alienado * pm;
      const recebidoBRL = op.valDest;

      liquidacoes.push({
        data: op.data,
        moeda: op.orig,
        fxAlienado: op.valOrig,
        recebidoBRL,
        taxaEfetiva: op.valOrig > 0 ? recebidoBRL / op.valOrig : 0,
        pmNaData: pm,
        custoBRL,
        ganhoBRL: recebidoBRL - custoBRL,
      });

      st.estoque = Math.max(0, st.estoque - op.valOrig);
      st.custoBRL = Math.max(0, st.custoBRL - custoBRL);

    } else if (op.orig !== "BRL" && op.dest !== "BRL") {
      // FX → FX (ex: USD → EUR): reduz estoque da origem pelo PM, sem fato gerador BRL.
      // O custo em BRL transfere proporcionalmente para a moeda destino.
      const stOrig = getStock(op.orig);
      const pm = stOrig.estoque > 0 ? stOrig.custoBRL / stOrig.estoque : 0;
      const usado = Math.min(op.valOrig, stOrig.estoque);
      const custoTransferido = usado * pm;
      stOrig.estoque -= usado;
      stOrig.custoBRL = Math.max(0, stOrig.custoBRL - custoTransferido);

      const stDest = getStock(op.dest);
      stDest.estoque += op.valDest;
      stDest.custoBRL += custoTransferido;
    }
  }

  // Agrega por (ano, moeda) — isenção é avaliada POR MOEDA por ano
  const anosKey = (ano: string, moeda: string) => `${ano}:${moeda}`;
  const anosMap = new Map<string, LiquidacaoBRL[]>();
  for (const l of liquidacoes) {
    const k = anosKey(l.data.slice(0, 4), l.moeda);
    if (!anosMap.has(k)) anosMap.set(k, []);
    anosMap.get(k)!.push(l);
  }

  const anos: AnoCambial[] = [...anosMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, ls]) => {
      const [ano, moeda] = key.split(":");
      const fxAlienado = ls.reduce((s, l) => s + l.fxAlienado, 0);
      const recebidoBRL = ls.reduce((s, l) => s + l.recebidoBRL, 0);
      const custoBRL = ls.reduce((s, l) => s + l.custoBRL, 0);
      const ganhoBRL = recebidoBRL - custoBRL;
      const isentoEspecie = fxAlienado <= LIMITE_ESPECIE_USD;
      const aliquotaEspecie = aliquotaGcapProgressiva(Math.max(0, ganhoBRL));
      const irEspecie = !isentoEspecie && ganhoBRL > 0 ? ganhoBRL * aliquotaEspecie : 0;
      return { ano, moeda, fxAlienado, recebidoBRL, custoBRL, ganhoBRL, isentoEspecie, aliquotaEspecie, irEspecie, liquidacoes: ls };
    });

  const estoques: EstoqueMoeda[] = [...stocks.entries()]
    .filter(([, st]) => st.estoque > 0.01)
    .map(([moeda, st]) => ({
      moeda,
      estoque: st.estoque,
      pmBRL: st.estoque > 0 ? st.custoBRL / st.estoque : 0,
    }))
    .sort((a, b) => a.moeda.localeCompare(b.moeda));

  const usdSt = stocks.get("USD");

  return {
    anos,
    estoques,
    limiteIsencaoEspecieUSD: LIMITE_ESPECIE_USD,
    pmDolarFinal: usdSt && usdSt.estoque > 0 ? usdSt.custoBRL / usdSt.estoque : 0,
    usdEstoqueFinal: usdSt?.estoque ?? 0,
  };
}
