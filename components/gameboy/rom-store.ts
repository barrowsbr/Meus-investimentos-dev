// ROM do Pokémon persistida no APARELHO (IndexedDB) — compartilhada entre o
// console clássico (WasmBoy) e o modo EmulatorJS da página /gameboy.

export const ROM_DO_REPO = "/roms/pokegold-spaceworld-en.gb";

const IDB = { db: "mi_gameboy", store: "roms", chave: "rom" };

function idbAbrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB.db, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB.store);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function idbLerRom(chave: string = IDB.chave): Promise<{ nome: string; dados: Uint8Array } | null> {
  try {
    const db = await idbAbrir();
    return await new Promise((res) => {
      const req = db.transaction(IDB.store).objectStore(IDB.store).get(chave);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => res(null);
    });
  } catch { return null; }
}

export async function idbGravarRom(nome: string, dados: Uint8Array, chave: string = IDB.chave): Promise<void> {
  try {
    const db = await idbAbrir();
    await new Promise<void>((res) => {
      const tx = db.transaction(IDB.store, "readwrite");
      tx.objectStore(IDB.store).put({ nome, dados }, chave);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch { /* sem IndexedDB → só não persiste */ }
}

// Slot separado para o "Abrir arquivo" do modo EmulatorJS (.gb/.gbc/.gba) —
// não conflita com a ROM do Pokémon do console clássico.
export const CHAVE_ARQUIVO_EJS = "rom_ejs";

export function blobUrlDe(dados: Uint8Array): string {
  const copia = new Uint8Array(dados).slice().buffer as ArrayBuffer;
  return URL.createObjectURL(new Blob([copia]));
}

/** Core do EmulatorJS pela extensão do arquivo. */
export type CoreEjs = "gambatte" | "mgba" | "genesis_plus_gx" | "snes9x";

export function coreDoArquivo(nome: string): CoreEjs {
  if (/\.gba$/i.test(nome)) return "mgba";                     // Game Boy Advance
  if (/\.(sfc|smc)$/i.test(nome)) return "snes9x";             // Super Nintendo
  if (/\.(md|gen|smd|bin)$/i.test(nome)) return "genesis_plus_gx"; // Mega Drive
  return "gambatte";                                           // Game Boy/Color
}

/** URL tocável da ROM do Pokémon: repo (se commitada) ou blob da salva no aparelho. */
export async function urlRomPokemon(): Promise<string | null> {
  try {
    const r = await fetch(ROM_DO_REPO);
    if (r.ok && (r.headers.get("content-type") ?? "").includes("octet")) {
      const buf = await r.arrayBuffer();
      if (buf.byteLength > 0x8000) return URL.createObjectURL(new Blob([buf]));
    }
  } catch { /* não existe no repo */ }
  const salvo = await idbLerRom();
  if (salvo?.dados?.length) return blobUrlDe(salvo.dados);
  return null;
}
