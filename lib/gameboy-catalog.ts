// Catálogo de jogos LIDO AO VIVO da pasta do Google Drive do dono (link
// aberto para leitura). Sem catálogo versionado — novos jogos que ele jogar na
// pasta aparecem sozinhos. Agrupa por CONSOLE (a subpasta: Gameboy,
// Supernintendo, Megadrive, ...). Server-only (usa GOOGLE_API_KEY).
//
// Estrutura tolerante: um nível "wrapper" (a pasta "Games") é atravessado; o
// console é a 1ª subpasta com jogos; ROMs podem estar direto nela ou numa
// subpasta ("jogos"). Download vai pelo proxy /api/gameboy/rom (same-origin).

import { JWT } from "google-auth-library";

const API = "https://www.googleapis.com/drive/v3/files";
// Raiz compartilhada pelo dono (env sobrepõe se ele mudar de pasta).
export const DRIVE_ROOT = process.env.GAMEBOY_DRIVE_FOLDER || "1qCpEyf_tdQ-AymStSHJ8lrOBoIQR82wR";

// Auth do Drive: preferimos o SERVICE ACCOUNT (token Bearer) — a GOOGLE_API_KEY
// costuma vir RESTRITA a Sheets/Gemini e o Drive volta 403 "are blocked". O SA
// (o mesmo do backup da planilha) não sofre essa restrição e lê a pasta pública.
let tokenCache: { token: string; exp: number } | null = null;

async function driveToken(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  try {
    const sa = JSON.parse(saJson);
    const jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
    const { access_token } = await jwt.authorize();
    if (!access_token) return null;
    tokenCache = { token: access_token, exp: Date.now() + 50 * 60 * 1000 };
    return access_token;
  } catch { return null; }
}

/** {url, headers} para uma chamada ao Drive — Bearer do SA, ou ?key= como fallback. */
async function driveReq(path: string, params: URLSearchParams): Promise<{ url: string; headers: HeadersInit }> {
  const token = await driveToken();
  if (token) return { url: `${API}${path}?${params}`, headers: { Authorization: `Bearer ${token}` } };
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("sem GOOGLE_SERVICE_ACCOUNT_JSON nem GOOGLE_API_KEY");
  params.set("key", key);
  return { url: `${API}${path}?${params}`, headers: {} };
}

export type Sistema = "gb" | "gbc" | "gba" | "snes" | "md";
export type Core = "gambatte" | "mgba" | "snes9x" | "genesis_plus_gx";

export interface JogoDrive {
  id: string;          // Drive fileId (o proxy baixa por ele)
  nome: string;        // nome limpo (sem extensão nem tags de região)
  sistema: Sistema;
  core: Core;
  tamanho: number;     // bytes
}
export interface ConsoleCatalogo {
  chave: string;       // slug do console (gameboy, snes, megadrive)
  nome: string;        // rótulo de exibição
  sistemaBase: Sistema;
  jogos: JogoDrive[];
}

const CORE_DE: Record<Sistema, Core> = {
  gb: "gambatte", gbc: "gambatte", gba: "mgba", snes: "snes9x", md: "genesis_plus_gx",
};

const EXT_SISTEMA: Record<string, Sistema> = {
  gb: "gb", gbc: "gbc", gba: "gba", sfc: "snes", smc: "snes",
  md: "md", gen: "md", smd: "md", bin: "md",
};

const ROM_EXT = new Set(Object.keys(EXT_SISTEMA));

/** Slug + sistema-base a partir do nome da pasta de console. */
function classificaConsole(nomePasta: string): { chave: string; nome: string; sistemaBase: Sistema } {
  const n = nomePasta.toLowerCase();
  if (/(snes|super\s*nintendo|supernintendo)/.test(n)) return { chave: "snes", nome: "Super Nintendo", sistemaBase: "snes" };
  if (/(mega\s*drive|megadrive|genesis|mega)/.test(n)) return { chave: "megadrive", nome: "Mega Drive", sistemaBase: "md" };
  if (/(game\s*boy\s*advance|gba|advance)/.test(n)) return { chave: "gba", nome: "Game Boy Advance", sistemaBase: "gba" };
  if (/(game\s*boy\s*color|gbc)/.test(n)) return { chave: "gbc", nome: "Game Boy Color", sistemaBase: "gbc" };
  if (/(game\s*boy|gameboy|\bgb\b)/.test(n)) return { chave: "gameboy", nome: "Game Boy", sistemaBase: "gb" };
  return { chave: n.replace(/[^a-z0-9]+/g, "-"), nome: nomePasta, sistemaBase: "gb" };
}

/** Nome limpo: tira extensão e tags entre parênteses/colchetes de região/dump. */
function limpaNome(titulo: string): string {
  return titulo
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[([].*?[)\]]/g, "")
    .replace(/\s+ROM\b/i, "")
    .replace(/\s{2,}/g, " ")
    .trim() || titulo;
}

interface DriveFile { id: string; name: string; mimeType: string; size?: string; fileExtension?: string }

async function listar(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken,files(id,name,mimeType,size,fileExtension)",
      pageSize: "1000",
      orderBy: "name",
      // arquivos públicos "qualquer um com o link" também aparecem para o SA
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const { url, headers } = await driveReq("", params);
    const r = await fetch(url, { headers, next: { revalidate: 300 } });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Drive ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

const ehPasta = (f: DriveFile) => f.mimeType === "application/vnd.google-apps.folder";
const extDe = (f: DriveFile) => (f.fileExtension || f.name.split(".").pop() || "").toLowerCase();
const ehRom = (f: DriveFile) => !ehPasta(f) && ROM_EXT.has(extDe(f));

// ── Walk recursivo, acumulando jogos por console ─────────────────────────────

async function walk(
  folderId: string,
  consoleLabel: string | null,
  mapa: Map<string, ConsoleCatalogo>,
  profundidade: number,
): Promise<void> {
  if (profundidade > 5) return;
  const filhos = await listar(folderId);
  const pastas = filhos.filter(ehPasta);
  const roms = filhos.filter(ehRom);

  if (consoleLabel) {
    const cls = classificaConsole(consoleLabel);
    const c = mapa.get(cls.chave) ?? { chave: cls.chave, nome: cls.nome, sistemaBase: cls.sistemaBase, jogos: [] };
    for (const f of roms) {
      const sistema = EXT_SISTEMA[extDe(f)] ?? cls.sistemaBase;
      c.jogos.push({ id: f.id, nome: limpaNome(f.name), sistema, core: CORE_DE[sistema], tamanho: Number(f.size) || 0 });
    }
    mapa.set(cls.chave, c);
  }

  // Wrapper (ex.: a pasta "Games"): 1 subpasta, 0 ROMs, ainda sem console →
  // atravessa sem virar console.
  const wrapper = consoleLabel === null && pastas.length === 1 && roms.length === 0;
  for (const p of pastas) {
    const label = consoleLabel ?? (wrapper ? null : p.name);
    await walk(p.id, label, mapa, profundidade + 1);
  }
}

// Cache em memória (o listing muda raramente; evita re-caminhar a árvore).
let cache: { em: number; dados: ConsoleCatalogo[] } | null = null;
const TTL = 5 * 60 * 1000;

export async function lerCatalogoDrive(force = false): Promise<ConsoleCatalogo[]> {
  if (!force && cache && Date.now() - cache.em < TTL) return cache.dados;
  const mapa = new Map<string, ConsoleCatalogo>();
  await walk(DRIVE_ROOT, null, mapa, 0);
  const ordem = ["gameboy", "gbc", "gba", "snes", "megadrive"];
  const dados = [...mapa.values()]
    .filter((c) => c.jogos.length > 0)
    .map((c) => ({ ...c, jogos: c.jogos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }))
    .sort((a, b) => {
      const ia = ordem.indexOf(a.chave), ib = ordem.indexOf(b.chave);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.nome.localeCompare(b.nome);
    });
  cache = { em: Date.now(), dados };
  return dados;
}

/** Baixa os bytes de um arquivo do Drive (usado pelo proxy /api/gameboy/rom).
 *  SA via Bearer quando disponível; senão o endpoint público keyless. */
export async function baixarRom(id: string): Promise<ArrayBuffer> {
  const token = await driveToken();
  if (token) {
    const r = await fetch(`${API}/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return r.arrayBuffer();
  }
  // Fallback keyless (arquivo público "qualquer um com o link"; ROMs pequenas
  // baixam direto, sem interstício de vírus).
  const r2 = await fetch(`https://drive.google.com/uc?export=download&id=${id}&confirm=t`);
  if (!r2.ok) throw new Error(`download ${r2.status}`);
  return r2.arrayBuffer();
}
