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

const norm = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

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
    if (!marcas) { out.push({ id: v.id, nome: v.nome, detalhe: v.detalhe, ok: false, erro: "FIPE inacessível" }); continue; }
    const marca = marcas.find((m) => norm(m.nome).includes(norm(v.marcaBusca)));
    if (!marca) { out.push({ id: v.id, nome: v.nome, detalhe: v.detalhe, ok: false, erro: "marca não encontrada" }); continue; }

    const modelos = await j<{ modelos: Item[] }>(`${BASE}/marcas/${marca.codigo}/modelos`);
    const tokens = v.modeloBusca.map(norm);
    const candidatos = (modelos?.modelos ?? []).filter((m) => { const n = norm(m.nome); return tokens.every((t) => n.includes(t)); });
    // Vários candidatos (ex.: variações de motor): fica com o nome mais curto —
    // costuma ser a versão "canônica" da busca.
    const modelo = candidatos.sort((a, b) => a.nome.length - b.nome.length)[0];
    if (!modelo) { out.push({ id: v.id, nome: v.nome, detalhe: v.detalhe, ok: false, erro: "modelo não encontrado" }); continue; }

    const anos = await j<Item[]>(`${BASE}/marcas/${marca.codigo}/modelos/${modelo.codigo}/anos`);
    const ano = (anos ?? []).find((a) => a.codigo.startsWith(`${v.anoModelo}-`)) ?? (anos ?? [])[0];
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
