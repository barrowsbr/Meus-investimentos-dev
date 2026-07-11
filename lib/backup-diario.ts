// Backup DIÁRIO rotativo da planilha — fotografia de cada aba de dados em
// `bkp_diario_<aba>`, sobrescrita 1×/dia na primeira abertura do app (ping do
// shell → /api/config/planilha/backup {action:"daily"}). Complementa o snapshot
// pré-escrita já existente (bkp_<aba>, lib/backup.ts): este aqui é a foto "de
// ontem de manhã", aquele é o estado imediatamente antes da última alteração.
//
// Rollback: restaura a aba a partir da fotografia diária. O writeTab da
// restauração faz o snapshot pré-escrita do estado atual — ou seja, dá para
// desfazer o próprio rollback.

import { readTabRaw, writeTab, ensureTab, listSheetNames, resetSheetNamesCache } from "./gsheets";

const PREFIX = "bkp_diario_";
const META_TAB = "bkp_diario_meta";
const META_HEADERS = ["tab", "data", "hora_utc", "linhas"];

export interface BackupTabStatus { tab: string; data: string; linhas: number }
export interface BackupStatus { ultimaData: string | null; tabs: BackupTabStatus[] }

const hoje = () => {
  // Data no fuso de Brasília (o "dia" do dono).
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const elegivel = (name: string) => {
  const n = name.trim().toLowerCase();
  return n.length > 0 && !n.startsWith("bkp") && n !== "db_cotacoes";
};

export async function backupStatus(): Promise<BackupStatus> {
  try {
    const { rows } = await readTabRaw(META_TAB);
    const tabs = rows
      .filter((r) => (r[0] ?? "").trim() !== "")
      .map((r) => ({ tab: r[0], data: r[1] ?? "", linhas: parseInt(r[3] ?? "0", 10) || 0 }));
    const ultimaData = tabs.reduce<string | null>((max, t) => (t.data && (!max || t.data > max) ? t.data : max), null);
    return { ultimaData, tabs };
  } catch {
    return { ultimaData: null, tabs: [] };
  }
}

// Trava simples contra corrida (2 abas do navegador pingando juntas na mesma
// lambda quente). Entre lambdas diferentes o dedup é pela data no meta.
let _emAndamento: Promise<{ ran: boolean; tabs: number }> | null = null;

export async function runDailyBackup(opts: { force?: boolean } = {}): Promise<{ ran: boolean; tabs: number }> {
  if (_emAndamento) return _emAndamento;
  _emAndamento = (async () => {
    try {
      if (!opts.force) {
        const st = await backupStatus();
        if (st.ultimaData === hoje()) return { ran: false, tabs: st.tabs.length };
      }

      const names = (await listSheetNames()).filter(elegivel);
      const agora = new Date();
      const meta: string[][] = [];
      let count = 0;

      for (const tab of names) {
        try {
          const { headers, rows } = await readTabRaw(tab);
          if (headers.length === 0) continue; // aba vazia — nada a fotografar
          const bkp = `${PREFIX}${tab}`;
          await ensureTab(bkp, headers);
          await writeTab(bkp, headers, rows); // sobrescreve a foto do dia anterior
          meta.push([tab, hoje(), agora.toISOString().slice(11, 16), String(rows.length)]);
          count++;
        } catch { /* uma aba falhou — segue as outras */ }
      }

      await ensureTab(META_TAB, META_HEADERS);
      await writeTab(META_TAB, META_HEADERS, meta);
      resetSheetNamesCache();
      return { ran: true, tabs: count };
    } finally {
      _emAndamento = null;
    }
  })();
  return _emAndamento;
}

export async function rollbackTab(tab: string): Promise<{ ok: boolean; linhas: number; dataBackup: string | null; error?: string }> {
  if (!elegivel(tab)) return { ok: false, linhas: 0, dataBackup: null, error: "Aba não elegível para rollback" };
  const bkp = `${PREFIX}${tab}`;
  const names = await listSheetNames();
  const norm = (s: string) => s.trim().toLowerCase();
  if (!names.some((n) => norm(n) === norm(bkp))) {
    return { ok: false, linhas: 0, dataBackup: null, error: `Sem fotografia diária desta aba ainda (${bkp}) — rode um backup primeiro` };
  }

  const { headers, rows } = await readTabRaw(bkp);
  if (headers.length === 0) return { ok: false, linhas: 0, dataBackup: null, error: "Fotografia vazia" };

  const st = await backupStatus();
  const dataBackup = st.tabs.find((t) => norm(t.tab) === norm(tab))?.data ?? null;

  // writeTab faz o snapshot pré-escrita (bkp_<aba>) do estado ATUAL antes de
  // sobrescrever — o rollback é reversível.
  await writeTab(tab, headers, rows);
  return { ok: true, linhas: rows.length, dataBackup };
}
