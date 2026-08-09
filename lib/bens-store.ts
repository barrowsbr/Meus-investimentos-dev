// ── Bens dinâmicos — SERVER-ONLY (planilha, aba bens_lista) ──────────────────
// A config estática de lib/bens.ts vira SEMENTE: a aba `bens_lista` pode
// sobrescrever campos, DESATIVAR um bem (ativo=0) e adicionar bens novos pela
// UI da página Bens. Append-only com leitura last-wins por id (mesmo padrão de
// cartao_categorias) — remover é appendar uma linha com ativo=0.
//
// Foto própria por bem: aba `bens_fotos` guarda o JPEG (redimensionado no
// cliente) em base64 FATIADO em pedaços de 40k chars (limite de célula do
// Sheets é 50k). Prioridade de exibição: foto própria > fotoLocal (public/bens)
// > proxy Wikimedia (/api/bens/foto).

import { VEICULOS, type BemVeiculo } from "./bens";
import { fetchTab, ensureTab, appendRowsTyped, writeTab } from "./gsheets";

export const TAB_BENS = "bens_lista";
export const COLS_BENS = [
  "id", "nome", "detalhe", "cor", "codigo_fipe", "marca_busca",
  "modelo_busca", "ano_modelo", "ativo", "specs",
];

export const TAB_FOTOS = "bens_fotos";
export const COLS_FOTOS = ["id", "mime", "em", "parte", "total", "dados"];
const CHUNK = 40_000;

export interface BemDinamico extends BemVeiculo {
  custom: boolean;          // nasceu na planilha (não em lib/bens.ts)
  ativo: boolean;
}

const norm = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const str = (v: unknown) => String(v ?? "").trim();

function parseSpecs(raw: string): Array<[string, string]> {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => [String(p[0]), String(p[1])] as [string, string]);
  } catch { return []; }
}

/** Defaults de busca para um bem criado pela UI: 1º token do nome vira a marca,
 *  o resto vira os tokens de modelo — dá chance real ao caminho 2 da FIPE. */
function defaultsDoNome(nome: string): Pick<BemVeiculo, "marcaBusca" | "modeloBusca" | "fotoBusca" | "fotoRequer" | "fotoBonus"> {
  const tokens = norm(nome).split(/\s+/).filter(Boolean);
  return {
    marcaBusca: tokens[0] ?? "",
    modeloBusca: tokens.slice(1),
    fotoBusca: [nome],
    fotoRequer: tokens.length > 1 ? [tokens[1]] : [],
    fotoBonus: tokens.slice(2),
  };
}

/** Lista final: semente estática + linhas da planilha (last-wins por id),
 *  sem os desativados. Falha de leitura → só a semente (best-effort). */
export async function listarBens(): Promise<BemDinamico[]> {
  const map = new Map<string, BemDinamico>(
    VEICULOS.map((v) => [v.id, { ...v, custom: false, ativo: true }]),
  );
  let rows: Record<string, unknown>[] = [];
  try { rows = await fetchTab(TAB_BENS); } catch { /* aba ainda não existe */ }
  for (const r of rows) {
    const id = str(r["id"]);
    if (!id) continue;
    const base = map.get(id);
    const nome = str(r["nome"]) || base?.nome || id;
    const ano = Number(r["ano_modelo"]);
    const modeloTokens = str(r["modelo_busca"]).split(/\s+/).filter(Boolean);
    const novo: BemDinamico = {
      ...defaultsDoNome(nome),
      ...(base ?? {}),
      id,
      nome,
      detalhe: str(r["detalhe"]) || base?.detalhe || "",
      cor: str(r["cor"]) || base?.cor || "",
      codigoFipe: str(r["codigo_fipe"]) || base?.codigoFipe,
      anoModelo: Number.isFinite(ano) && ano > 1900 ? ano : (base?.anoModelo ?? 0),
      specs: str(r["specs"]) ? parseSpecs(str(r["specs"])) : (base?.specs ?? []),
      fotoLocal: base?.fotoLocal,
      custom: base ? base.custom : true,
      ativo: !/^(0|false|nao|não)$/i.test(str(r["ativo"]) || "1"),
    };
    if (modeloTokens.length > 0) novo.modeloBusca = modeloTokens;
    if (str(r["marca_busca"])) novo.marcaBusca = str(r["marca_busca"]);
    map.set(id, novo);
  }
  return [...map.values()].filter((v) => v.ativo);
}

export async function acharBem(id: string): Promise<BemDinamico | undefined> {
  return (await listarBens()).find((v) => v.id === id);
}

/** Adiciona um bem novo (append). Devolve o id gerado. */
export async function adicionarBem(dados: {
  nome: string; detalhe?: string; cor?: string; codigoFipe?: string;
  anoModelo: number; marcaBusca?: string; modeloBusca?: string;
}): Promise<string> {
  const existentes = new Set((await listarBens()).map((v) => v.id));
  let id = norm(dados.nome).replace(/[^a-z0-9]+/g, "").slice(0, 24) || "bem";
  while (existentes.has(id)) id += "2";
  await ensureTab(TAB_BENS, COLS_BENS);
  await appendRowsTyped(TAB_BENS, [[
    id, dados.nome, dados.detalhe ?? "", dados.cor ?? "",
    dados.codigoFipe ?? "", dados.marcaBusca ?? "", dados.modeloBusca ?? "",
    dados.anoModelo, "1", "",
  ]]);
  return id;
}

/** Remove (desativa) um bem — vale para os estáticos e os da planilha. */
export async function removerBem(id: string): Promise<void> {
  await ensureTab(TAB_BENS, COLS_BENS);
  await appendRowsTyped(TAB_BENS, [[id, "", "", "", "", "", "", "", "0", ""]]);
}

// ── Foto própria (bens_fotos) ────────────────────────────────────────────────

/** id → timestamp `em` da foto própria (para montar a URL com cache-buster). */
export async function listarFotosMeta(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    for (const r of await fetchTab(TAB_FOTOS)) {
      const id = str(r["id"]);
      if (id && Number(r["parte"]) === 1) map.set(id, str(r["em"]));
    }
  } catch { /* aba ainda não existe */ }
  return map;
}

export async function lerFotoPropria(id: string): Promise<{ mime: string; buf: Buffer } | null> {
  let rows: Record<string, unknown>[] = [];
  try { rows = await fetchTab(TAB_FOTOS); } catch { return null; }
  const partes = rows
    .filter((r) => str(r["id"]) === id)
    .sort((a, b) => Number(a["parte"]) - Number(b["parte"]));
  if (partes.length === 0) return null;
  const b64 = partes.map((r) => str(r["dados"])).join("");
  try {
    return { mime: str(partes[0]["mime"]) || "image/jpeg", buf: Buffer.from(b64, "base64") };
  } catch { return null; }
}

/** Regrava a foto de UM bem, preservando as dos demais (writeTab faz backup). */
export async function gravarFotoPropria(id: string, mime: string, b64: string): Promise<void> {
  let atuais: Record<string, unknown>[] = [];
  try { atuais = await fetchTab(TAB_FOTOS); } catch { /* 1ª foto — aba nova */ }
  const outras = atuais
    .filter((r) => str(r["id"]) && str(r["id"]) !== id)
    .map((r) => COLS_FOTOS.map((c) => str(r[c])));
  const em = new Date().toISOString();
  const total = Math.ceil(b64.length / CHUNK) || 1;
  const novas: string[][] = [];
  for (let i = 0; i < total; i++) {
    novas.push([id, mime, em, String(i + 1), String(total), b64.slice(i * CHUNK, (i + 1) * CHUNK)]);
  }
  await ensureTab(TAB_FOTOS, COLS_FOTOS);
  // RAW: base64 pode terminar em "=" ou conter "+" — sem raw o Sheets tentaria
  // interpretar como fórmula/número e corromperia o dado.
  await writeTab(TAB_FOTOS, COLS_FOTOS, [...outras, ...novas], { raw: true });
}

export async function removerFotoPropria(id: string): Promise<void> {
  let atuais: Record<string, unknown>[] = [];
  try { atuais = await fetchTab(TAB_FOTOS); } catch { return; }
  const outras = atuais
    .filter((r) => str(r["id"]) && str(r["id"]) !== id)
    .map((r) => COLS_FOTOS.map((c) => str(r[c])));
  await ensureTab(TAB_FOTOS, COLS_FOTOS);
  await writeTab(TAB_FOTOS, COLS_FOTOS, outras, { raw: true });
}

/** URL de exibição da foto de um bem (prioridade: própria > local > Wikimedia). */
export function fotoUrl(bem: BemVeiculo, fotoEm?: string): string {
  if (fotoEm) return `/api/bens/foto-propria?id=${encodeURIComponent(bem.id)}&v=${encodeURIComponent(fotoEm)}`;
  return bem.fotoLocal ?? `/api/bens/foto?id=${encodeURIComponent(bem.id)}`;
}
