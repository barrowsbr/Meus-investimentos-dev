import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { getServiceAccountAuth, listSheetNames, resetSheetNamesCache } from "@/lib/gsheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Anotações/rascunhos vinculados a um ativo. Persistidas na aba `ativos_notas`.
// Escrita herda assertNotDemo (via store) e backup automático (writeTab).
const TAB = "ativos_notas";
const HEADERS = ["id", "ticker", "data", "texto"];

interface Nota {
  id: string;
  ticker: string;
  data: string;
  texto: string;
}

function rowToNota(r: Record<string, unknown>): Nota {
  return {
    id: String(r["id"] ?? ""),
    ticker: String(r["ticker"] ?? "").toUpperCase(),
    data: String(r["data"] ?? ""),
    texto: String(r["texto"] ?? ""),
  };
}

function genId(): string {
  return `nota-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ── GET — lista notas, ou diagnóstico (?diag=1) ──────────────────────────────
export async function GET(req: Request) {
  try {
    const store = getDataStore();
    const params = new URL(req.url).searchParams;

    // Diagnóstico: roda em PRODUÇÃO (onde as credenciais existem) e devolve a
    // verdade do ambiente — SA presente? qual e-mail? aba existe? Se não existe,
    // TENTA criar e reporta o erro LITERAL do Google (sem paráfrase).
    if (params.get("diag")) {
      const auth = getServiceAccountAuth();
      let saEmail = "";
      try {
        const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "{}");
        saEmail = sa.client_email ?? "";
      } catch { /* sem json */ }

      resetSheetNamesCache();
      let tabs: string[] = [];
      let listErr = "";
      try { tabs = await listSheetNames(); } catch (e) { listErr = e instanceof Error ? e.message : String(e); }
      const tabExists = tabs.some((t) => t.toLowerCase().replace(/[_\s]/g, "") === "ativosnotas");

      let createTried = false;
      let createErr = "";
      let createOk = false;
      if (!tabExists) {
        createTried = true;
        try {
          await store.ensureTab(TAB, HEADERS);
          createOk = true;
        } catch (e) {
          createErr = e instanceof Error ? e.message : String(e);
        }
      }

      return NextResponse.json({
        saPresente: !!auth,
        saEmail,                       // confira se ESTE e-mail é Editor na planilha
        spreadsheetId: (process.env.SPREADSHEET_ID ?? "").slice(0, 6) + "…",
        abaExiste: tabExists,
        totalAbas: tabs.length,
        listarAbasErro: listErr || undefined,
        tentouCriar: createTried,
        criou: createOk,
        criarErroLiteral: createErr || undefined,   // ← a verdade do Google
      });
    }

    const ticker = params.get("ticker")?.trim().toUpperCase();

    const rows = await store.fetchTab(TAB).catch(() => []);
    let notas = rows.map(rowToNota).filter((n) => n.id && n.texto);
    if (ticker) notas = notas.filter((n) => n.ticker === ticker);
    notas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

    return NextResponse.json(notas);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// ── POST — cria nota { ticker, texto } ──
export async function POST(req: Request) {
  try {
    const store = getDataStore();
    const body = await req.json().catch(() => ({}));
    const ticker = String(body.ticker ?? "").trim().toUpperCase();
    const texto = String(body.texto ?? "").trim();

    if (!ticker) return NextResponse.json({ error: "ticker é obrigatório" }, { status: 400 });
    if (!texto) return NextResponse.json({ error: "texto é obrigatório" }, { status: 400 });
    if (texto.length > 5000) return NextResponse.json({ error: "texto muito longo (máx 5000)" }, { status: 400 });

    // Tenta garantir a aba. Criar aba (addSheet) é operação ESTRUTURAL e pode
    // falhar se a service account não tiver permissão para criar abas — nesse
    // caso seguimos mesmo assim: se a aba já existir, o append funciona (igual
    // às outras escritas do app). Só falha de verdade se a aba não existir E
    // não puder ser criada.
    let ensureErr = "";
    try {
      await store.ensureTab(TAB, HEADERS);
    } catch (e) {
      ensureErr = e instanceof Error ? e.message : String(e);
    }

    const nota: Nota = {
      id: genId(),
      ticker,
      // timestamp ISO completo (data + hora) para ordenar e exibir
      data: new Date().toISOString(),
      texto,
    };

    try {
      await store.appendRows(TAB, [[nota.id, nota.ticker, nota.data, nota.texto]]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const permissao = /permission|permiss|403|PERMISSION_DENIED/i.test(msg + ensureErr);
      return NextResponse.json({
        error: permissao
          ? `Não foi possível salvar: a aba "${TAB}" não existe e a conta de serviço não tem permissão para criá-la. Crie a aba "${TAB}" na planilha (colunas: ${HEADERS.join(", ")}) — depois disso as anotações salvam normalmente.`
          : `Falha ao salvar a anotação: ${msg}`,
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, nota });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// ── DELETE — remove nota por { id } (read + filter + reescrita com backup) ──
export async function DELETE(req: Request) {
  try {
    const store = getDataStore();
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    const rows = await store.fetchTab(TAB).catch(() => []);
    const all = rows.map(rowToNota).filter((n) => n.id);
    const kept = all.filter((n) => n.id !== id);

    if (kept.length === all.length) {
      // nada foi removido — id inexistente
      return NextResponse.json({ error: "nota não encontrada" }, { status: 404 });
    }

    const dataRows = kept.map((n) => [n.id, n.ticker, n.data, n.texto]);
    await store.writeTab(TAB, HEADERS, dataRows);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
