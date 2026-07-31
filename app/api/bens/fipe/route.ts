// Valor FIPE dos veículos configurados em lib/bens.ts — via API parallelum
// (espelho público da tabela FIPE, sem chave). Resolução por BUSCA DE NOME
// (marca → modelo → ano), robusta a mudança de códigos. Cache CDN de 1 dia
// (a FIPE é mensal). ⚠️ A network policy do dev bloqueia o host — o resultado
// real aparece em produção (mesmo padrão das probes do api-registry).

import { NextResponse } from "next/server";
import { VEICULOS } from "@/lib/bens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

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

export async function GET() {
  const marcas = await j<Item[]>(`${BASE}/marcas`);
  const out: Array<{
    id: string; nome: string; detalhe: string; ok: boolean;
    valor?: string; valorNum?: number; fipeModelo?: string; codigoFipe?: string; mesReferencia?: string; erro?: string;
  }> = [];

  for (const v of VEICULOS) {
    // Caminho 1 — código FIPE pinado (v2, consulta direta; imune a grafia de
    // nome). Tenta os sufixos de combustível mais comuns (1=gasolina/flex, 3=diesel).
    if (v.codigoFipe) {
      let achou = false;
      for (const suf of ["1", "3"]) {
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

  const total = out.reduce((s, o) => s + (o.valorNum ?? 0), 0);
  const mesReferencia = out.find((o) => o.mesReferencia)?.mesReferencia ?? null;
  return NextResponse.json(
    { veiculos: out, total, mesReferencia, ok: out.some((o) => o.ok) },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" } },
  );
}
