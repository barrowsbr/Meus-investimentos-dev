// ─────────────────────────────────────────────────────────────────────────────
// Parser da aba `historico_patrimonio` — histórico do patrimônio total.
//
// A aba é lida de forma ADAPTATIVA porque o layout pode variar:
//   • LONGO  → 1 linha por data/mês/ano, com uma coluna de total e (opcional)
//              colunas de composição (RV, RF, Exterior, Cripto, Caixa…).
//   • LARGO  → anos como colunas (estilo lb_historic); transposto para série.
//
// Saída canônica: série ordenada de pontos { ts, label, total, partes }.
// Esta aba é puramente HISTÓRICA/apresentacional — não recalcula portfólio.
// ─────────────────────────────────────────────────────────────────────────────

import { toNumber } from "./format";

export interface PontoHistorico {
  ts: number;                       // timestamp para ordenação/filtro
  label: string;                    // rótulo do eixo X (dd/mm, mmm/yy ou yyyy)
  total: number;                    // patrimônio total no ponto (BRL)
  partes: Record<string, number>;   // composição opcional (pode ser vazia)
}

export interface SerieHistorico {
  pontos: PontoHistorico[];
  partesKeys: string[];             // chaves de composição (ordenadas)
  formato: "day" | "month" | "year"; // granularidade dominante
}

type Row = Record<string, unknown>;

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function num(v: unknown): number {
  const n = toNumber(v);
  return n === null ? 0 : n;
}

function serialToTs(serial: number): number {
  const utcDays = Math.floor(serial - 25569);
  return utcDays * 86400 * 1000;
}

interface ParsedDate { ts: number; kind: "day" | "month" | "year" }

// Converte um valor de coluna em timestamp + granularidade, tolerando vários
// formatos (Date, ISO, dd/mm/yyyy, mmm/yy, mm/yyyy, ano puro, serial Excel).
function parseDate(v: unknown): ParsedDate | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return { ts: v.getTime(), kind: "day" };

  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= 1990 && v <= 2100) return { ts: Date.UTC(v, 11, 31), kind: "year" };
    if (v > 20000 && v < 80000) return { ts: serialToTs(v), kind: "day" };
    return null;
  }

  const s = String(v).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { ts: Date.UTC(+m[1], +m[2] - 1, +m[3]), kind: "day" };

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yyyy = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return { ts: Date.UTC(yyyy, +m[2] - 1, +m[1]), kind: "day" };
  }

  // mmm/yy ou mmm-yyyy (ex.: jan/25, dez/2024)
  m = s.match(/^([a-zç]{3,})[\/\-\s](\d{2,4})$/i);
  if (m) {
    const mes = m[1].slice(0, 3).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    let idx = MESES_PT.indexOf(mes);
    if (idx < 0) idx = MESES_EN.indexOf(mes);
    if (idx >= 0) {
      const yyyy = m[2].length === 2 ? 2000 + +m[2] : +m[2];
      return { ts: Date.UTC(yyyy, idx, 1), kind: "month" };
    }
  }

  // mm/yyyy
  m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) return { ts: Date.UTC(+m[2], +m[1] - 1, 1), kind: "month" };

  // ano puro
  m = s.match(/^(\d{4})$/);
  if (m) return { ts: Date.UTC(+m[1], 11, 31), kind: "year" };

  const t = Date.parse(s);
  if (!isNaN(t)) return { ts: t, kind: "day" };
  return null;
}

function labelFor(ts: number, kind: "day" | "month" | "year"): string {
  const d = new Date(ts);
  const yy = String(d.getUTCFullYear()).slice(2);
  if (kind === "year") return String(d.getUTCFullYear());
  if (kind === "month") return `${MESES_PT[d.getUTCMonth()]}/${yy}`;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${yy}`;
}

const RE_DATA = /(^|[\s_])(data|date|dia|mes|m[eê]s|ano|per[ií]odo|compet[eê]ncia|ref|referencia|refer[eê]ncia)([\s_]|$)/i;
const RE_TOTAL = /(total|patrim|saldo|l[ií]quido|liquido|net.?worth)/i;
const RE_IGNORE = /(percent|%|varia|cresc|rentab|taxa|cdi|ipca|obs|nota|coment)/i;

export function parseHistoricoPatrimonio(rows: Row[]): SerieHistorico {
  if (!rows || rows.length === 0) return { pontos: [], partesKeys: [], formato: "month" };

  const keys = Object.keys(rows[0]);
  const yearKeys = keys.filter((k) => /^\d{4}$/.test(k.trim())).sort();

  // ── Formato LARGO (anos como colunas) ─────────────────────────────────────
  if (yearKeys.length >= 2) {
    const labelKey = keys.find((k) => k === "" || (!/^\d{4}$/.test(k.trim()) && !RE_TOTAL.test(k))) ?? "";
    const partesSet = new Map<string, Record<string, number>>(); // ano → conta → valor
    for (const y of yearKeys) partesSet.set(y, {});
    for (const row of rows) {
      const nome = String(row[labelKey] ?? "").trim();
      if (!nome || /^total/i.test(nome)) continue;
      for (const y of yearKeys) {
        const v = num(row[y]);
        if (v) partesSet.get(y)![nome] = (partesSet.get(y)![nome] ?? 0) + v;
      }
    }
    const partesKeys = [...new Set(rows.map((r) => String(r[labelKey] ?? "").trim()).filter((n) => n && !/^total/i.test(n)))];
    const pontos: PontoHistorico[] = yearKeys.map((y) => {
      const partes = partesSet.get(y)!;
      const total = Object.values(partes).reduce((s, v) => s + v, 0);
      return { ts: Date.UTC(+y, 11, 31), label: y, total, partes };
    }).filter((p) => p.total !== 0);
    return { pontos, partesKeys, formato: "year" };
  }

  // ── Formato LONGO (1 linha por período) ───────────────────────────────────
  const dateKey = keys.find((k) => RE_DATA.test(k)) ?? keys[0];

  // Colunas numéricas candidatas (excluindo a data e colunas de %/variação).
  const numericKeys = keys.filter((k) => {
    if (k === dateKey || RE_IGNORE.test(k)) return false;
    let hits = 0, seen = 0;
    for (const r of rows) {
      const raw = r[k];
      if (raw === null || raw === undefined || raw === "") continue;
      seen++;
      if (toNumber(raw) !== null) hits++;
    }
    return seen > 0 && hits / seen >= 0.6;
  });

  const totalKey = numericKeys.find((k) => RE_TOTAL.test(k));
  const partesKeys = totalKey ? numericKeys.filter((k) => k !== totalKey) : numericKeys.slice();

  const dominant: Record<string, number> = {};
  const pontos: PontoHistorico[] = [];
  for (const row of rows) {
    const pd = parseDate(row[dateKey]);
    if (!pd) continue;
    dominant[pd.kind] = (dominant[pd.kind] ?? 0) + 1;
    const partes: Record<string, number> = {};
    for (const k of partesKeys) partes[k] = num(row[k]);
    const total = totalKey ? num(row[totalKey]) : Object.values(partes).reduce((s, v) => s + v, 0);
    if (total === 0 && Object.values(partes).every((v) => v === 0)) continue;
    pontos.push({ ts: pd.ts, label: labelFor(pd.ts, pd.kind), total, partes });
  }

  pontos.sort((a, b) => a.ts - b.ts);
  const formato = (Object.entries(dominant).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "month") as "day" | "month" | "year";
  // Recalcula labels conforme granularidade dominante (consistência do eixo).
  for (const p of pontos) p.label = labelFor(p.ts, formato);

  return { pontos, partesKeys, formato };
}
