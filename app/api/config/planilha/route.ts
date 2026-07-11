// Editor de planilha em Configurações — CRUD sobre as abas da gdados sem sair
// do app. Somente dono (bloqueado no modo demo); multiusuário segue a planilha
// da conta logada (activeSpreadsheetId). Toda alteração destrutiva passa por
// writeTab → backup automático (bkp_<aba> + CSV) antes de sobrescrever.

import { NextResponse } from "next/server";
import { listSheetNames, readTabRaw, writeTab, appendRows } from "@/lib/gsheets";
import { isDemoRequest } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Abas fora do editor: backups (bkp_*) e o golden source de preços (gigante e
// gerido pelo cron/card "Base de Cotações" — editar à mão só quebraria).
const isEditable = (name: string) => {
  const n = name.trim().toLowerCase();
  return n.length > 0 && !n.startsWith("bkp_") && n !== "db_cotacoes";
};

export async function GET(req: Request) {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab");
  try {
    if (!tab) {
      // TODAS as abas: as de dados são editáveis; backups (bkp_*) e o golden
      // source (db_cotacoes) entram como SOMENTE LEITURA — dá para conferir a
      // fotografia diária sem risco de editá-la.
      const nomes = (await listSheetNames()).filter((n) => n.trim() !== "");
      const tabs = [
        ...nomes.filter(isEditable).map((name) => ({ name, ro: false })),
        ...nomes.filter((n) => !isEditable(n)).map((name) => ({ name, ro: true })),
      ];
      return NextResponse.json({ tabs });
    }
    // Leitura liberada para qualquer aba existente (edição segue restrita no POST).
    const grid = await readTabRaw(tab);
    return NextResponse.json({ tab, readonly: !isEditable(tab), ...grid });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao ler planilha" }, { status: 500 });
  }
}

interface Body {
  tab?: string;
  action?: "update" | "delete" | "add";
  rowIndex?: number;      // índice na matriz de DADOS (0 = primeira linha após o header)
  values?: string[];      // update/add: os valores da linha
  expect?: string[];      // update/delete: a linha como o cliente a leu (lock otimista)
}

const rowEq = (a: string[], b: string[]) => {
  const w = Math.max(a.length, b.length);
  for (let i = 0; i < w; i++) if ((a[i] ?? "").trim() !== (b[i] ?? "").trim()) return false;
  return true;
};

export async function POST(req: Request) {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { tab, action, rowIndex, values, expect } = body;
  if (!tab || !isEditable(tab)) return NextResponse.json({ error: "Aba inválida" }, { status: 400 });

  try {
    if (action === "add") {
      if (!values || values.length === 0) return NextResponse.json({ error: "Linha vazia" }, { status: 400 });
      await appendRows(tab, [values.map((v) => v ?? "")]);
      return NextResponse.json({ ok: true });
    }

    if (action !== "update" && action !== "delete") {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
    if (rowIndex == null || rowIndex < 0 || !expect) {
      return NextResponse.json({ error: "rowIndex/expect obrigatórios" }, { status: 400 });
    }

    // Relê a aba AGORA e confere que a linha alvo ainda é a que o cliente viu —
    // se a planilha mudou por baixo (sync, outra aba do navegador), aborta em
    // vez de editar/apagar a linha errada.
    const { headers, rows } = await readTabRaw(tab);
    const atual = rows[rowIndex];
    if (!atual || !rowEq(atual, expect)) {
      return NextResponse.json({ error: "A aba mudou desde o carregamento — recarregue e tente de novo" }, { status: 409 });
    }

    const novas = rows.slice();
    if (action === "delete") novas.splice(rowIndex, 1);
    else novas[rowIndex] = Array.from({ length: Math.max(headers.length, values?.length ?? 0) }, (_, i) => (values?.[i] ?? ""));

    await writeTab(tab, headers, novas); // backup automático antes de sobrescrever
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao gravar" }, { status: 500 });
  }
}
