import { fetchTab, appendRows, ensureTab } from "./gsheets";

const TAB = "twr_mensal";
const HEADERS = ["month", "return_pct", "return_pct_usd", "locked_at"];

interface LockedMonth {
  month: string;
  return_pct: number;
  return_pct_usd: number | null;
}

let _cache: LockedMonth[] | null = null;

export async function readLockedMonthly(): Promise<LockedMonth[]> {
  if (_cache) return _cache;
  try {
    const rows = await fetchTab(TAB);
    _cache = rows.map(r => ({
      month: String(r["month"] ?? ""),
      return_pct: Number(r["return_pct"] ?? 0),
      return_pct_usd: r["return_pct_usd"] != null && r["return_pct_usd"] !== "" ? Number(r["return_pct_usd"]) : null,
    })).filter(r => r.month.match(/^\d{4}-\d{2}$/));
    return _cache;
  } catch {
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

  await ensureTab(TAB, HEADERS);

  const rows = toLock.map(m => [
    m.month,
    m.return_pct.toFixed(6),
    usdMap.has(m.month) ? usdMap.get(m.month)!.toFixed(6) : "",
    now.toISOString(),
  ]);

  await appendRows(TAB, rows);
  _cache = null;
  return toLock.length;
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
