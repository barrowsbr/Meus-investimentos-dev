// Backup em CSV — FORA da planilha (a v1 fotografava em abas bkp_diario_*
// dentro do próprio arquivo, o que não protege contra perda/corrompimento da
// planilha). Agora:
//
// - GET ?export=all (Bearer CRON_SECRET) → JSON com o CSV de TODAS as abas de
//   dados; consumido pelo workflow backup.yml, que sobrescreve os arquivos na
//   branch `backups` do repositório (1×/dia).
// - GET ?csv=<aba> → download do CSV da aba (backup manual / cópia pré-restauração).
// - POST {action:"restore-csv", tab, csv} → restaura a aba a partir de um CSV
//   (upload no card). writeTab faz o snapshot pré-escrita antes.

import { NextResponse } from "next/server";
import { readTabRaw, writeTab, listSheetNames } from "@/lib/gsheets";
import { isDemoRequest } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // exporta ~20 abas (leitura cada)

const elegivel = (name: string) => {
  const n = name.trim().toLowerCase();
  return n.length > 0 && !n.startsWith("bkp"); // db_cotacoes ENTRA (golden source importa no desastre)
};

// ── CSV ───────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function gridToCsv(headers: string[], rows: string[][]): string {
  const w = headers.length;
  const line = (r: string[]) => Array.from({ length: w }, (_, i) => esc(r[i] ?? "")).join(",");
  return [line(headers), ...rows.map(line)].join("\n");
}

// Parser de CSV com aspas (campos com vírgula/quebra de linha/aspas).
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  const src = text.replace(/^﻿/, ""); // BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) out.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) out.push(row);
  return out;
}

// ── Rotas ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Export completo — auth por CRON_SECRET (dados financeiros; só o workflow).
  if (searchParams.get("export") === "all") {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const names = (await listSheetNames()).filter(elegivel);
    const tabs: Array<{ tab: string; linhas: number; csv: string }> = [];
    for (const tab of names) {
      try {
        const { headers, rows } = await readTabRaw(tab);
        if (headers.length === 0) continue;
        tabs.push({ tab, linhas: rows.length, csv: gridToCsv(headers, rows) });
      } catch { /* uma aba falhou — segue as outras */ }
    }
    return NextResponse.json({ geradoEm: new Date().toISOString(), tabs });
  }

  // Download de UMA aba como CSV (backup manual / cópia pré-restauração).
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  const tab = searchParams.get("csv");
  if (!tab) return NextResponse.json({ error: "Use ?csv=<aba> ou ?export=all" }, { status: 400 });
  try {
    const { headers, rows } = await readTabRaw(tab);
    if (headers.length === 0) return NextResponse.json({ error: "Aba vazia ou inexistente" }, { status: 404 });
    const nome = `${tab}_${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(gridToCsv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao exportar" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  let body: { action?: string; tab?: string; csv?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  try {
    if (body.action === "restore-csv") {
      const tab = (body.tab ?? "").trim();
      if (!tab || !elegivel(tab) || tab.toLowerCase() === "db_cotacoes") {
        return NextResponse.json({ error: "Aba inválida para restauração" }, { status: 400 });
      }
      const grid = parseCsv(body.csv ?? "");
      if (grid.length < 1 || grid[0].every((h) => !h.trim())) {
        return NextResponse.json({ error: "CSV vazio ou sem cabeçalho" }, { status: 400 });
      }
      const [headers, ...rows] = grid;
      // writeTab faz o snapshot pré-escrita do estado atual — restauração reversível.
      await writeTab(tab, headers, rows);
      return NextResponse.json({ ok: true, tab, linhas: rows.length });
    }
    // Ações da v1 (abas bkp_diario_*) foram descontinuadas — clientes antigos
    // em cache recebem no-op em vez de erro.
    if (body.action === "daily") return NextResponse.json({ ran: false, skipped: "backup agora é via GitHub Action (CSVs na branch backups)" });
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro no backup" }, { status: 500 });
  }
}
