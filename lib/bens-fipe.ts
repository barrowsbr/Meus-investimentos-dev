// ── Valor FIPE dos bens — motor compartilhado (SERVER-ONLY) ──────────────────
// Usado pela rota /api/bens/fipe E pelo patrimônio da Home (computeHomePatrimonio):
// a "minha parte" (FRACAO_BENS — divisão de bens com a esposa) entra no
// patrimônio total. Resolução: código FIPE pinado (v2, direto) → busca por nome
// (v1). Cache de dados do Next (12h) segura a carga na API do parallelum.

import { VEICULOS, FRACAO_BENS } from "./bens";
import { lerEscopo } from "./app-config";

const BASE = "https://parallelum.com.br/fipe/api/v1/carros";
const BASE_V2 = "https://parallelum.com.br/fipe/api/v2";

const norm = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// Comparação SEM espaços/hífens: "t-cross", "T Cross" e "TCross" viram "tcross".
const strip = (v: string) => norm(v).replace(/ /g, "");

async function j<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(9000), next: { revalidate: 43200 } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

interface Item { nome: string; codigo: string }
interface FipeValor { Valor?: string; Modelo?: string; AnoModelo?: number; Combustivel?: string; CodigoFipe?: string; MesReferencia?: string }

function parseValor(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export interface BemFipe {
  id: string; nome: string; detalhe: string; ok: boolean;
  valor?: string; valorNum?: number; fipeModelo?: string; codigoFipe?: string; mesReferencia?: string; erro?: string;
  // Ajuste do dono sobre a tabela (app_config, escopo "bens", chave ajuste_<id>):
  // +5 = vale 5% acima da FIPE; -8 = 8% abaixo. valorFinalNum = FIPE × (1+pct/100).
  ajustePct?: number;
  valorFinalNum?: number;
}
export interface BensFipe {
  veiculos: BemFipe[];
  total: number;          // tabela cheia (100%), JÁ com os ajustes aplicados
  minhaParte: number;     // total × FRACAO_BENS — o que entra no patrimônio
  fracao: number;
  mesReferencia: string | null;
  ok: boolean;
}

/** Ajustes persistidos na planilha (escopo "bens": ajuste_<id> → pct). */
async function lerAjustes(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    for (const [chave, valor] of await lerEscopo("bens")) {
      if (!chave.startsWith("ajuste_")) continue;
      const pct = Number(String(valor).replace(",", "."));
      if (Number.isFinite(pct)) map.set(chave.slice("ajuste_".length), pct);
    }
  } catch { /* sem planilha → sem ajustes */ }
  return map;
}

export async function computeBensFipe(): Promise<BensFipe> {
  const [marcas, ajustes] = await Promise.all([j<Item[]>(`${BASE}/marcas`), lerAjustes()]);
  const out: BemFipe[] = [];

  for (const v of VEICULOS) {
    // Caminho 1 — código FIPE pinado (v2, consulta direta; imune a grafia de
    // nome). Sufixos de combustível: 5=Flex (diagnóstico ago/2026 provou que os
    // dois carros usam "-5"; só "1"/"3" deixava este caminho morto), 1=gasolina,
    // 3=diesel.
    if (v.codigoFipe) {
      let achou = false;
      for (const suf of ["5", "1", "3"]) {
        const val = await j<{ price?: string; model?: string; codeFipe?: string; referenceMonth?: string }>(
          `${BASE_V2}/cars/${encodeURIComponent(v.codigoFipe)}/years/${v.anoModelo}-${suf}`,
        );
        const num = parseValor(val?.price);
        if (val && num != null) {
          out.push({
            id: v.id, nome: v.nome, detalhe: v.detalhe, ok: true,
            valor: val.price, valorNum: num, fipeModelo: val.model,
            codigoFipe: val.codeFipe ?? v.codigoFipe, mesReferencia: val.referenceMonth,
          });
          achou = true;
          break;
        }
      }
      if (achou) continue;
      // sem resultado no código pinado → cai para a busca por nome abaixo
    }
    if (!marcas) { out.push({ id: v.id, nome: v.nome, detalhe: v.detalhe, ok: false, erro: "FIPE inacessível" }); continue; }
    const marca = marcas.find((m) => norm(m.nome).includes(norm(v.marcaBusca)));
    if (!marca) { out.push({ id: v.id, nome: v.nome, detalhe: v.detalhe, ok: false, erro: "marca não encontrada" }); continue; }

    const modelos = await j<{ modelos: Item[] }>(`${BASE}/marcas/${marca.codigo}/modelos`);
    const lista = modelos?.modelos ?? [];
    const tokens = v.modeloBusca.map(strip);
    // 1º passe: TODOS os tokens no nome (comparação sem espaços/hífens — a FIPE
    // ora escreve "T-Cross", ora "T Cross"/"TCROSS").
    let candidatos = lista.filter((m) => { const n = strip(m.nome); return tokens.every((t) => n.includes(t)); });
    // 2º passe (relaxado): só o 1º token (o modelo em si), rankeado por quantos
    // dos demais tokens aparecem — melhor um match parcial que nenhum.
    if (candidatos.length === 0 && tokens.length > 0) {
      const score = (nome: string) => tokens.slice(1).filter((t) => strip(nome).includes(t)).length;
      candidatos = lista.filter((m) => strip(m.nome).includes(tokens[0]))
        .sort((a, b) => score(b.nome) - score(a.nome) || a.nome.length - b.nome.length);
    }
    // Vários candidatos (ex.: variações de motor): fica com o nome mais curto —
    // costuma ser a versão "canônica" da busca.
    const modelo = candidatos.sort((a, b) => a.nome.length - b.nome.length)[0];
    if (!modelo) { out.push({ id: v.id, nome: v.nome, detalhe: v.detalhe, ok: false, erro: "modelo não encontrado na FIPE" }); continue; }

    const anos = await j<Item[]>(`${BASE}/marcas/${marca.codigo}/modelos/${modelo.codigo}/anos`);
    // Ano-modelo exato → Zero KM (código 32000) → o mais novo disponível.
    const ano = (anos ?? []).find((a) => a.codigo.startsWith(`${v.anoModelo}-`))
      ?? (anos ?? []).find((a) => a.codigo.startsWith("32000"))
      ?? (anos ?? [])[0];
    if (!ano) { out.push({ id: v.id, nome: v.nome, detalhe: v.detalhe, ok: false, erro: "ano não encontrado" }); continue; }

    const val = await j<FipeValor>(`${BASE}/marcas/${marca.codigo}/modelos/${modelo.codigo}/anos/${ano.codigo}`);
    const num = parseValor(val?.Valor);
    if (!val || num == null) { out.push({ id: v.id, nome: v.nome, detalhe: v.detalhe, ok: false, erro: "valor indisponível" }); continue; }

    out.push({
      id: v.id, nome: v.nome, detalhe: v.detalhe, ok: true,
      valor: val.Valor, valorNum: num, fipeModelo: val.Modelo,
      codigoFipe: val.CodigoFipe, mesReferencia: val.MesReferencia,
    });
  }

  // Aplica o ajuste do dono sobre a tabela; totais usam o valor FINAL.
  for (const o of out) {
    const pct = ajustes.get(o.id) ?? 0;
    o.ajustePct = pct;
    if (o.valorNum != null) o.valorFinalNum = Math.round(o.valorNum * (1 + pct / 100) * 100) / 100;
  }

  const total = out.reduce((s, o) => s + (o.valorFinalNum ?? o.valorNum ?? 0), 0);
  return {
    veiculos: out,
    total,
    minhaParte: Math.round(total * FRACAO_BENS * 100) / 100,
    fracao: FRACAO_BENS,
    mesReferencia: out.find((o) => o.mesReferencia)?.mesReferencia ?? null,
    ok: out.some((o) => o.ok),
  };
}
