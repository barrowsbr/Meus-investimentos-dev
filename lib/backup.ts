import { promises as fs } from "fs";
import path from "path";
import { getDataStore } from "./data-store";

const MAX_BACKUPS_PER_TAB = 3;

function ts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

async function getBackupDir(): Promise<string> {
  const projectDir = path.join(process.cwd(), "backups");
  try {
    await fs.mkdir(projectDir, { recursive: true });
    await fs.access(projectDir, (await import("fs")).constants.W_OK);
    return projectDir;
  } catch {
    const tmp = "/tmp/backups";
    await fs.mkdir(tmp, { recursive: true });
    return tmp;
  }
}

export async function backupTab(tabName: string): Promise<{ backupName: string; rows: number }> {
  const store = getDataStore();
  const rows = await store.fetchTab(tabName);
  if (!rows || rows.length === 0) return { backupName: "", rows: 0 };

  // Snapshot PERSISTENTE numa aba da planilha (rollback real — o CSV em /tmp é
  // efêmero na Vercel). Best-effort: só acontece se a aba bkp_<tab> existir.
  await snapshotTabToSheet(tabName, rows).catch(() => {});

  const csv = tabToCsv(rows);
  const backupName = `bkp_${tabName}_${ts()}`;
  const dir = await getBackupDir();
  const filePath = path.join(dir, `${backupName}.csv`);

  await fs.writeFile(filePath, csv, "utf-8").catch(() => {});
  await pruneOldBackups(tabName, dir).catch(() => {});

  return { backupName, rows: rows.length };
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[_\s]/g, "");
}

/** Copia o conteúdo ATUAL de `tabName` para a aba `bkp_<tabName>` (se ela
 *  existir). É o ponto de rollback persistente — sobrescrito a cada backup,
 *  guardando o último estado bom ANTES da escrita. A SA não cria abas, então
 *  a aba de backup precisa existir (criada uma vez pelo dono). */
export async function snapshotTabToSheet(
  tabName: string,
  rows?: Record<string, unknown>[],
): Promise<boolean> {
  if (normName(tabName).startsWith("bkp")) return false; // não faz backup do backup
  const store = getDataStore();
  const bkpName = `bkp_${tabName}`;

  const { listSheetNames } = await import("./gsheets");
  let names: string[] = [];
  try { names = await listSheetNames(); } catch { return false; }
  if (!names.some((n) => normName(n) === normName(bkpName))) return false; // sem aba de backup → pula

  const data = rows ?? await store.fetchTab(tabName);
  if (!data || data.length === 0) return false;

  const headers = Object.keys(data[0]);
  const outRows = data.map((r) => headers.map((h) => (r[h] == null ? "" : String(r[h]))));
  await store.writeTab(bkpName, headers, outRows);
  return true;
}

/** Restaura `tabName` a partir do snapshot em `bkp_<tabName>`. */
export async function restoreTabFromSheet(tabName: string): Promise<{ ok: boolean; rows: number; error?: string }> {
  const store = getDataStore();
  const bkpName = `bkp_${tabName}`;
  const { listSheetNames } = await import("./gsheets");
  let names: string[] = [];
  try { names = await listSheetNames(); } catch { return { ok: false, rows: 0, error: "não foi possível listar abas" }; }
  if (!names.some((n) => normName(n) === normName(bkpName)))
    return { ok: false, rows: 0, error: `aba de backup "${bkpName}" não existe` };

  const data = await store.fetchTab(bkpName);
  if (!data || data.length === 0) return { ok: false, rows: 0, error: "backup vazio" };

  const headers = Object.keys(data[0]);
  const outRows = data.map((r) => headers.map((h) => (r[h] == null ? "" : String(r[h]))));
  await store.writeTab(tabName, headers, outRows);
  return { ok: true, rows: outRows.length };
}

async function pruneOldBackups(tabName: string, dir: string) {
  const prefix = `bkp_${tabName}_`;
  const files = (await fs.readdir(dir))
    .filter(f => f.startsWith(prefix) && f.endsWith(".csv"))
    .sort()
    .reverse();

  if (files.length <= MAX_BACKUPS_PER_TAB) return;

  const toDelete = files.slice(MAX_BACKUPS_PER_TAB);
  await Promise.all(toDelete.map(f => fs.unlink(path.join(dir, f)).catch(() => {})));
}

export function tabToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const vals = headers.map(h => {
      const v = row[h];
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    });
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

export async function downloadTabCsv(tabName: string): Promise<string> {
  const store = getDataStore();
  const rows = await store.fetchTab(tabName);
  return tabToCsv(rows);
}
