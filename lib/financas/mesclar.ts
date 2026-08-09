// Mescla entradas MANUAIS (abas financas_assinaturas / financas_parcelamentos)
// com as DETECTADAS no OFX do cartão — PURO e testável.
//
// Regra de ouro: o que existe nas duas fontes aparece UMA vez (origem "ambos"),
// com o valor do CARTÃO valendo (é o cobrado de verdade) e os metadados do
// manual preservados (dia de cobrança, interruptor ativa, índice p/ editar).
// Nada de contagem dupla nos totais.

import type { Assinatura, ParcelamentoCalc } from "./tipos";
import type { AssinaturaDetectada, ParcelamentoDetectado } from "./categorias";

export type Origem = "cartao" | "manual" | "ambos";

const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Nomes "casam" se iguais ou um contém o outro (mínimo 4 chars p/ evitar
 *  lixo). Compara também SEM espaços: o dono escreve "YouTube Premium", o
 *  cartão imprime "google youtubepremium" — mesma assinatura. */
export function nomesCasam(a: string, b: string): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const contem = (x: string, y: string) => {
    const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
    return curto.length >= 4 && longo.includes(curto);
  };
  return contem(na, nb) || contem(na.replace(/ /g, ""), nb.replace(/ /g, ""));
}

// ── Assinaturas ──────────────────────────────────────────────────────────────

export interface AssinaturaMesclada {
  nome: string;
  valorMensal: number;
  origem: Origem;
  ativa: boolean;             // manual pode desligar; só-cartão é sempre ativa
  dia: number | null;         // do cadastro manual
  ultimaData: string | null;  // da detecção no cartão
  meses: number;              // meses distintos vistos no cartão (0 = só manual)
  manualIdx: number | null;   // índice em `manuais` p/ editar/remover
}

export function mesclarAssinaturas(
  manuais: Assinatura[],
  detectadas: AssinaturaDetectada[],
): AssinaturaMesclada[] {
  const usadas = new Set<number>();
  const out: AssinaturaMesclada[] = [];

  for (const d of detectadas) {
    const iManual = manuais.findIndex((m, i) => !usadas.has(i) && nomesCasam(m.nome, d.nome));
    if (iManual >= 0) {
      usadas.add(iManual);
      const m = manuais[iManual];
      out.push({
        nome: m.nome,                    // o nome que o dono escolheu
        valorMensal: d.valorMensal,      // o valor COBRADO vence o cadastrado
        origem: "ambos",
        ativa: m.ativa,
        dia: m.dia || null,
        ultimaData: d.ultimaData,
        meses: d.meses,
        manualIdx: iManual,
      });
    } else {
      out.push({
        nome: d.nome,
        valorMensal: d.valorMensal,
        origem: "cartao",
        ativa: true,
        dia: null,
        ultimaData: d.ultimaData,
        meses: d.meses,
        manualIdx: null,
      });
    }
  }

  manuais.forEach((m, i) => {
    if (usadas.has(i)) return;
    out.push({
      nome: m.nome, valorMensal: m.valor, origem: "manual", ativa: m.ativa,
      dia: m.dia || null, ultimaData: null, meses: 0, manualIdx: i,
    });
  });

  return out.sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.valorMensal - a.valorMensal);
}

// ── Parcelamentos ────────────────────────────────────────────────────────────

export interface ParcelamentoMesclado {
  nome: string;
  valorParcela: number;
  totalParcelas: number;
  parcelaAtual: number;
  restantes: number;
  valorTotal: number;
  valorRestante: number;
  fimPrevisto: string;        // yyyy-mm
  origem: Origem;
  quitado: boolean;
  manualIdx: number | null;
}

function fimDe(anoMes: string, restantes: number): string {
  const [y, m] = anoMes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + restantes, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function mesclarParcelamentos(
  manuais: ParcelamentoCalc[],
  detectados: ParcelamentoDetectado[],
  hoje = new Date(),
): ParcelamentoMesclado[] {
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const usadas = new Set<number>();
  const out: ParcelamentoMesclado[] = [];

  for (const d of detectados) {
    // Casa com manual por nome + (mesmo nº de parcelas OU parcela ~igual).
    const iManual = manuais.findIndex((m, i) =>
      !usadas.has(i) && nomesCasam(m.nome, d.nome) &&
      (m.parcelas === d.totalParcelas || Math.abs(m.valorParcela - d.valorParcela) < 1));
    if (iManual >= 0) usadas.add(iManual);
    const m = iManual >= 0 ? manuais[iManual] : null;
    out.push({
      nome: m?.nome ?? d.nome,
      valorParcela: d.valorParcela,     // o cobrado vence
      totalParcelas: d.totalParcelas,
      parcelaAtual: d.parcelaAtual,
      restantes: d.restantes,
      valorTotal: d.valorTotal,
      valorRestante: d.valorRestante,
      fimPrevisto: d.fimPrevisto,
      origem: m ? "ambos" : "cartao",
      quitado: d.restantes === 0,
      manualIdx: iManual >= 0 ? iManual : null,
    });
  }

  manuais.forEach((m, i) => {
    if (usadas.has(i)) return;
    out.push({
      nome: m.nome,
      valorParcela: m.valorParcela,
      totalParcelas: m.parcelas,
      parcelaAtual: m.parcelaAtual,
      restantes: m.restantes,
      valorTotal: m.valor_total,
      valorRestante: m.valorRestante,
      fimPrevisto: fimDe(mesAtual, m.quitado ? 0 : m.restantes),
      origem: "manual",
      quitado: m.quitado,
      manualIdx: i,
    });
  });

  return out.sort((a, b) => Number(a.quitado) - Number(b.quitado) || b.valorRestante - a.valorRestante);
}
