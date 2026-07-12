import { getDataStore } from "./data-store";

const TAB = "twr_mensal";
const HEADERS = ["month", "return_pct", "return_pct_usd", "locked_at", "version"];
const CURRENT_VERSION = 2; // v2: chained monthly returns (prev month end as base)

interface LockedMonth {
  month: string;
  return_pct: number;
  return_pct_usd: number | null;
}

let _cache: LockedMonth[] | null = null;

// ── Normalização do campo `month` ────────────────────────────────────────────
// Bug histórico: as linhas eram gravadas com USER_ENTERED e o Google parseava
// "2025-01" como DATA → a leitura (UNFORMATTED_VALUE) devolvia o serial do
// Excel (ex.: 45658) e o regex descartava TODAS as linhas: nenhum mês era
// travado e o lock re-anexava os mesmos meses a cada carga (aba duplicando).
// Agora: leitura tolerante (serial/ISO/Date → "YYYY-MM") + escrita RAW.
function normalizeMonth(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.floor(v - 25569) * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})/); // "01/2025" ou "01/01/2025"
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  return null;
}

export async function readLockedMonthly(): Promise<LockedMonth[]> {
  if (_cache) return _cache;
  try {
    const store = getDataStore();
    const rows = await store.fetchTab(TAB);
    const out: LockedMonth[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (Number(r["version"] ?? 1) !== CURRENT_VERSION) continue;
      const month = normalizeMonth(r["month"]);
      if (!month) continue;
      if (seen.has(month)) continue; // dedup: vale a PRIMEIRA fotografia do mês
      const pct = Number(r["return_pct"]);
      // Sanidade: um mês além de ±500% só pode ser linha corrompida (parse de
      // locale) — melhor recomputar do que exibir lixo travado.
      if (!Number.isFinite(pct) || Math.abs(pct) > 500) continue;
      const usdRaw = r["return_pct_usd"];
      const usd = usdRaw != null && usdRaw !== "" ? Number(usdRaw) : null;
      seen.add(month);
      out.push({
        month,
        return_pct: pct,
        return_pct_usd: usd != null && Number.isFinite(usd) && Math.abs(usd) <= 500 ? usd : null,
      });
    }
    _cache = out;
    console.log(`[twr-lock] read ${out.length} locked months from ${TAB} (${rows.length} rows)`);
    return out;
  } catch (e) {
    console.warn(`[twr-lock] failed to read ${TAB}:`, e instanceof Error ? e.message : e);
    return [];
  }
}

export async function lockNewMonths(
  computed: Array<{ month: string; return_pct: number }>,
  computedUsd: Array<{ month: string; return_pct: number }> | null,
): Promise<number> {
  const now = new Date();
  const curMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const existing = await readLockedMonthly();
  const existingSet = new Set(existing.map(r => r.month));

  const usdMap = new Map<string, number>();
  if (computedUsd) {
    for (const u of computedUsd) usdMap.set(u.month, u.return_pct);
  }

  const toLock = computed.filter(m => m.month < curMonth && !existingSet.has(m.month));
  if (toLock.length === 0) return 0;

  const store = getDataStore();
  const created = await store.ensureTab(TAB, HEADERS);
  // Aba v1 tinha 4 colunas — sem reescrever o header, a coluna "version" não
  // existe na linha 1 e o fetchTab a descarta: nenhuma linha v2 seria lida e o
  // lock re-anexaria os mesmos meses para sempre.
  if (!created) await store.syncHeaders(TAB, HEADERS);

  // RAW (appendRowsTyped): month fica TEXTO ("2025-01" nunca vira data) e os
  // percentuais entram como número — imune ao locale da planilha.
  const rows: (string | number)[][] = toLock.map(m => [
    m.month,
    Math.round(m.return_pct * 1e6) / 1e6,
    usdMap.has(m.month) ? Math.round(usdMap.get(m.month)! * 1e6) / 1e6 : "",
    now.toISOString(),
    CURRENT_VERSION,
  ]);

  await store.appendRowsTyped(TAB, rows);
  console.log(`[twr-lock] locked ${toLock.length} new months: ${toLock.map(m => m.month).join(", ")}`);
  _cache = null;
  return toLock.length;
}

// ── Compactação da aba ───────────────────────────────────────────────────────
// Reescreve a twr_mensal só com as linhas VÁLIDAS (mesmos critérios da
// leitura): v2, month normalizável, pct sã (±500%), 1 linha por mês (a
// primeira fotografia). Remove as duplicatas do bug do re-append e as linhas
// corrompidas por locale ("0.755853" → 755853). Escrita RAW via writeTab
// (backup automático antes). Meses que só tinham linha corrompida voltam a
// travar frescos na próxima carga da Performance.
export async function compactLockTab(): Promise<{ antes: number; depois: number; removidas: number }> {
  const store = getDataStore();
  const rows = await store.fetchTab(TAB);
  const antes = rows.length;

  const seen = new Set<string>();
  const out: string[][] = [];
  for (const r of rows) {
    if (Number(r["version"] ?? 1) !== CURRENT_VERSION) continue;
    const month = normalizeMonth(r["month"]);
    if (!month || seen.has(month)) continue;
    const pct = Number(r["return_pct"]);
    if (!Number.isFinite(pct) || Math.abs(pct) > 500) continue;
    const usdRaw = r["return_pct_usd"];
    const usd = usdRaw != null && usdRaw !== "" ? Number(usdRaw) : null;
    seen.add(month);
    out.push([
      month,
      String(Math.round(pct * 1e6) / 1e6),
      usd != null && Number.isFinite(usd) && Math.abs(usd) <= 500 ? String(Math.round(usd * 1e6) / 1e6) : "",
      String(r["locked_at"] ?? ""),
      String(CURRENT_VERSION),
    ]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const { writeTab } = await import("./gsheets");
  await writeTab(TAB, HEADERS, out, { raw: true }); // backup automático antes
  _cache = null;
  return { antes, depois: out.length, removidas: antes - out.length };
}

// Corrige a fotografia de UM mês (divergência lock × recalculado apontada no
// heatmap): reescreve a aba compactada com o valor novo — writeTab faz backup
// automático antes. USD do mês é preservado se existir.
export async function corrigirMesLock(month: string, pct: number): Promise<{ ok: boolean }> {
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(pct) || Math.abs(pct) > 500) {
    throw new Error("mês/percentual inválido");
  }
  const store = getDataStore();
  const rows = await store.fetchTab(TAB);
  const seen = new Set<string>();
  const out: string[][] = [];
  let achou = false;
  for (const r of rows) {
    if (Number(r["version"] ?? 1) !== CURRENT_VERSION) continue;
    const m = normalizeMonth(r["month"]);
    if (!m || seen.has(m)) continue;
    const pctRow = Number(r["return_pct"]);
    if (m !== month && (!Number.isFinite(pctRow) || Math.abs(pctRow) > 500)) continue;
    seen.add(m);
    const usdRaw = r["return_pct_usd"];
    const usd = usdRaw != null && usdRaw !== "" ? Number(usdRaw) : null;
    const valor = m === month ? pct : pctRow;
    if (m === month) achou = true;
    out.push([
      m,
      String(Math.round(valor * 1e6) / 1e6),
      usd != null && Number.isFinite(usd) && Math.abs(usd) <= 500 ? String(Math.round(usd * 1e6) / 1e6) : "",
      m === month ? new Date().toISOString() : String(r["locked_at"] ?? ""),
      String(CURRENT_VERSION),
    ]);
  }
  if (!achou) out.push([month, String(Math.round(pct * 1e6) / 1e6), "", new Date().toISOString(), String(CURRENT_VERSION)]);
  out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const { writeTab } = await import("./gsheets");
  await writeTab(TAB, HEADERS, out, { raw: true });
  _cache = null;
  return { ok: true };
}

export function mergeWithLocked(
  locked: LockedMonth[],
  computed: Array<{ month: string; return_pct: number }>,
  mode: "brl" | "usd" = "brl",
): Array<{ month: string; return_pct: number }> {
  const lockedMap = new Map<string, number>();
  for (const l of locked) {
    const val = mode === "usd" ? l.return_pct_usd : l.return_pct;
    if (val != null) lockedMap.set(l.month, val);
  }

  return computed.map(m => ({
    month: m.month,
    return_pct: lockedMap.has(m.month) ? lockedMap.get(m.month)! : m.return_pct,
  }));
}
