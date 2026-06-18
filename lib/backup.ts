import { promises as fs } from "fs";
import path from "path";
import { fetchTab } from "./gsheets";

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
  const rows = await fetchTab(tabName);
  if (!rows || rows.length === 0) return { backupName: "", rows: 0 };

  const csv = tabToCsv(rows);
  const backupName = `bkp_${tabName}_${ts()}`;
  const dir = await getBackupDir();
  const filePath = path.join(dir, `${backupName}.csv`);

  await fs.writeFile(filePath, csv, "utf-8");
  await pruneOldBackups(tabName, dir);

  return { backupName, rows: rows.length };
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
  const rows = await fetchTab(tabName);
  return tabToCsv(rows);
}
