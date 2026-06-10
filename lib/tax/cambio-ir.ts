// ─────────────────────────────────────────────────────────────────────────────
// Ganho cambial nas LIQUIDAÇÕES para BRL (aba `cambio`) — PF Brasil
//
// Quando dólares voltam para reais (USD → BRL), pode haver fato gerador sobre a
// variação cambial. O enquadramento depende da ORIGEM dos dólares:
//
//  1. MOEDA EM ESPÉCIE (IN SRF 118/2000, mantida pela Lei 14.754/23):
//     isento se o total de alienações no ano-calendário ≤ US$ 5.000; acima disso,
//     ganho de TODO o ano tributado pela tabela progressiva de ganho de capital
//     (15% até R$5mi … 22,5% acima de R$30mi). DARF código 8523/4600 (GCAP).
//  2. CONTA-CORRENTE/CARTÃO NÃO REMUNERADOS no exterior: variação cambial ISENTA
//     (Lei 14.754/23, art. 5º).
//  3. VENDA DE APLICAÇÃO FINANCEIRA no exterior: o câmbio já está DENTRO do ganho
//     do ativo (custo pela PTAX da compra, venda pela PTAX da venda — 15% anual).
//     A conversão posterior para BRL NÃO gera novo imposto.
//
// O motor calcula o ganho pelo CUSTO MÉDIO do dólar (remessas BRL→USD) e expõe
// os três enquadramentos — o usuário/contador escolhe o aplicável.
// ─────────────────────────────────────────────────────────────────────────────

import { toNumber } from "../format";

type Row = Record<string, unknown>;

export interface LiquidacaoBRL {
  data: string;
  usdAlienado: number;
  recebidoBRL: number;
  taxaEfetiva: number;     // BRL por USD obtido na operação
  pmDolarNaData: number;   // custo médio do estoque de USD na data
  custoBRL: number;
  ganhoBRL: number;
}

export interface AnoCambial {
  ano: string;
  usdAlienado: number;       // total alienado no ano (limite US$ 5k)
  recebidoBRL: number;
  custoBRL: number;
  ganhoBRL: number;
  isentoEspecie: boolean;    // alienações ≤ US$5k → isento no regime "espécie"
  aliquotaEspecie: number;   // alíquota progressiva aplicável ao ganho do ano
  irEspecie: number;         // imposto SE tratado como moeda em espécie
  liquidacoes: LiquidacaoBRL[];
}

export interface CambioIr {
  anos: AnoCambial[];
  pmDolarFinal: number;
  usdEstoqueFinal: number;
  limiteIsencaoEspecieUSD: number;
}

// Tabela progressiva de ganho de capital (Lei 13.259/2016) — sobre o ganho.
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

/**
 * Processa a aba `cambio` em ordem cronológica mantendo o custo médio do dólar.
 * BRL→USD acumula custo; USD→BRL realiza ganho cambial contra o PM corrente.
 */
export function apurarCambioIr(cambioRows: Row[]): CambioIr {
  interface Op { data: string; orig: string; dest: string; valOrig: number; valDest: number }
  const ops: Op[] = [];
  for (const row of cambioRows) {
    const orig = String(fuzzy(row, "moeda_origem", "moeda origem", "de", "origem") ?? "BRL").toUpperCase().trim();
    const dest = String(fuzzy(row, "moeda_destino", "moeda destino", "para", "destino") ?? "USD").toUpperCase().trim();
    const valOrig = Math.abs(toNumber(fuzzy(row, "valor_origem", "valor total entrada", "valor entrada", "valor_entrada", "valor enviado", "enviado", "brl")) ?? 0);
    const valDest = Math.abs(toNumber(fuzzy(row, "valor_destino", "valor total saída", "valor total saida", "valor saída", "valor_saida", "valor saida", "valor recebido", "recebido", "usd")) ?? 0);
    const data = parseDate(fuzzy(row, "data", "date"));
    if (!data || (valOrig === 0 && valDest === 0)) continue;
    ops.push({ data, orig: orig || "BRL", dest: dest || "USD", valOrig, valDest });
  }
  ops.sort((a, b) => a.data.localeCompare(b.data));

  let usdEstoque = 0;
  let custoEstoqueBRL = 0;
  const liquidacoes: LiquidacaoBRL[] = [];

  for (const op of ops) {
    if (op.orig === "BRL" && op.dest === "USD") {
      // compra de dólares: entra no custo médio
      usdEstoque += op.valDest;
      custoEstoqueBRL += op.valOrig;
    } else if (op.orig === "USD" && op.dest === "BRL") {
      // liquidação para reais: realiza ganho contra o PM corrente
      const pm = usdEstoque > 0 ? custoEstoqueBRL / usdEstoque : 0;
      const usdAlienado = Math.min(op.valOrig, usdEstoque > 0 ? usdEstoque : op.valOrig);
      const custoBRL = usdAlienado * pm;
      const recebidoBRL = op.valDest;
      liquidacoes.push({
        data: op.data,
        usdAlienado: op.valOrig,
        recebidoBRL,
        taxaEfetiva: op.valOrig > 0 ? recebidoBRL / op.valOrig : 0,
        pmDolarNaData: pm,
        custoBRL,
        ganhoBRL: recebidoBRL - custoBRL,
      });
      usdEstoque = Math.max(0, usdEstoque - op.valOrig);
      custoEstoqueBRL = Math.max(0, custoEstoqueBRL - custoBRL);
    }
    // USD→EUR etc. reduz estoque pelo PM, sem fato gerador em BRL aqui
    else if (op.orig === "USD" && op.dest !== "USD") {
      const pm = usdEstoque > 0 ? custoEstoqueBRL / usdEstoque : 0;
      const usado = Math.min(op.valOrig, usdEstoque);
      usdEstoque -= usado;
      custoEstoqueBRL = Math.max(0, custoEstoqueBRL - usado * pm);
    }
  }

  // Agrega por ano-calendário (limite dos US$5k é anual)
  const anosMap = new Map<string, LiquidacaoBRL[]>();
  for (const l of liquidacoes) {
    const ano = l.data.slice(0, 4);
    if (!anosMap.has(ano)) anosMap.set(ano, []);
    anosMap.get(ano)!.push(l);
  }

  const anos: AnoCambial[] = [...anosMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ano, ls]) => {
    const usdAlienado = ls.reduce((s, l) => s + l.usdAlienado, 0);
    const recebidoBRL = ls.reduce((s, l) => s + l.recebidoBRL, 0);
    const custoBRL = ls.reduce((s, l) => s + l.custoBRL, 0);
    const ganhoBRL = recebidoBRL - custoBRL;
    const isentoEspecie = usdAlienado <= LIMITE_ESPECIE_USD;
    const aliquotaEspecie = aliquotaGcapProgressiva(Math.max(0, ganhoBRL));
    const irEspecie = !isentoEspecie && ganhoBRL > 0 ? ganhoBRL * aliquotaEspecie : 0;
    return { ano, usdAlienado, recebidoBRL, custoBRL, ganhoBRL, isentoEspecie, aliquotaEspecie, irEspecie, liquidacoes: ls };
  });

  return {
    anos,
    pmDolarFinal: usdEstoque > 0 ? custoEstoqueBRL / usdEstoque : 0,
    usdEstoqueFinal: usdEstoque,
    limiteIsencaoEspecieUSD: LIMITE_ESPECIE_USD,
  };
}
