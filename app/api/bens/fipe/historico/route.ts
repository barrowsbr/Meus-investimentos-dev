// Histórico FIPE de um veículo — página Bens (card + popup).
//
// VERDADE ESTABELECIDA POR DIAGNÓSTICO REAL (GitHub Actions, ago/2026):
//   1. O sufixo de ano dos dois carros na v2 é "-5" (Flex) — as tentativas
//      antigas com "1"/"3" davam 404 SEMPRE (o histórico nunca funcionou).
//      Agora o código de ano vem de /v2/cars/{codigo}/years (sem chute).
//   2. A API gratuita só abre ~3 referências (mês atual + 2). Referência mais
//      antiga → HTTP 402 "apenas assinantes pagos podem acessar o histórico
//      estendido". 402 é FIM DEFINITIVO da janela grátis, não erro transitório.
//
// Então o histórico profundo é construído como GOLDEN SOURCE PRÓPRIA (mesma
// filosofia do db_cotacoes): a aba `fipe_historico` da planilha guarda o valor
// de cada mês; a leitura mescla planilha + janela grátis, e o mês corrente é
// gravado automaticamente (lazy) quando falta — o histórico cresce sozinho
// daqui pra frente, de graça. Em modo demo a escrita falha e é ignorada.

import { NextRequest, NextResponse } from "next/server";
import { fetchTab, ensureTab, appendRowsTyped } from "@/lib/gsheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const BASE_V2 = "https://parallelum.com.br/fipe/api/v2";
const TAB = "fipe_historico";
const TAB_COLS = ["mes", "codigo", "mes_ref", "valor"]; // mes = yyyy-mm

type Busca<T> = { status: "ok"; data: T } | { status: "ausente" } | { status: "pago" } | { status: "falha" };

async function buscar<T>(url: string): Promise<Busca<T>> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000), next: { revalidate: 43200 } });
      if (r.ok) return { status: "ok", data: (await r.json()) as T };
      if (r.status === 402) return { status: "pago" };          // paywall — definitivo
      if (r.status === 404 || r.status === 400) return { status: "ausente" };
      // 429/5xx → transitório
    } catch { /* rede/timeout → transitório */ }
    await new Promise((res) => setTimeout(res, 400));
  }
  return { status: "falha" };
}

const parseValor = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// "agosto/2026" (ou "agosto de 2026") → "2026-08" — chave de mês da planilha.
const MES_NUM: Record<string, string> = {
  janeiro: "01", fevereiro: "02", "março": "03", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};
function chaveMes(label: string): string | null {
  const m = label.toLowerCase().match(/([a-zç]+)\s*(?:de\s*)?\/?\s*(\d{4})/);
  if (!m) return null;
  const num = MES_NUM[m[1]];
  return num ? `${m[2]}-${num}` : null;
}

interface Ref { code: string; month: string }
interface Ponto { mes: string; valor: string; valorNum: number }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const codigo = sp.get("codigo") ?? "";
  const ano = Number(sp.get("ano")) || 0;
  if (!/^\d{6}-\d$/.test(codigo) || !ano) {
    return NextResponse.json({ error: "codigo/ano inválidos" }, { status: 400 });
  }

  const cacheCurto = { "Cache-Control": "public, s-maxage=300" };
  const cacheLongo = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" };
  let houveFalha = false;

  // ── 1. Código de ano REAL do veículo (nada de chutar sufixo) ───────────────
  const anosBusca = await buscar<Array<{ code: string }>>(`${BASE_V2}/cars/${encodeURIComponent(codigo)}/years`);
  let anoCode: string | null = null;
  if (anosBusca.status === "ok") {
    anoCode = anosBusca.data.find((a) => a.code.startsWith(`${ano}-`))?.code ?? null;
  } else {
    houveFalha = true;
  }

  // ── 2. Janela grátis: caminha do mês atual para trás até o 402 ─────────────
  const janela: Array<Ponto & { chave: string }> = [];
  if (anoCode) {
    const refsBusca = await buscar<Ref[]>(`${BASE_V2}/references`);
    if (refsBusca.status === "ok") {
      for (const ref of refsBusca.data.slice(0, 6)) {   // janela real ~3; 6 é folga
        const b = await buscar<{ price?: string }>(
          `${BASE_V2}/cars/${encodeURIComponent(codigo)}/years/${anoCode}?reference=${ref.code}`,
        );
        if (b.status === "pago") break;                  // fim da janela grátis
        if (b.status === "falha") { houveFalha = true; break; }
        if (b.status === "ausente") continue;
        const num = parseValor(b.data.price);
        const chave = chaveMes(ref.month);
        if (num != null && chave) janela.push({ mes: ref.month, valor: b.data.price!, valorNum: num, chave });
      }
    } else {
      houveFalha = true;
    }
  }

  // ── 3. Golden source própria (aba fipe_historico) ──────────────────────────
  const daPlanilha = new Map<string, Ponto & { chave: string }>();
  try {
    for (const row of await fetchTab(TAB)) {
      if (String(row["codigo"] ?? "").trim() !== codigo) continue;
      const chave = String(row["mes"] ?? "").trim();
      const num = Number(row["valor"]);
      if (!/^\d{4}-\d{2}$/.test(chave) || !Number.isFinite(num) || num <= 0) continue;
      daPlanilha.set(chave, {
        chave,
        mes: String(row["mes_ref"] ?? chave),
        valor: `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        valorNum: num,
      });
    }
  } catch { /* aba pode não existir ainda — só a janela grátis então */ }

  // ── 4. Lazy write: meses da janela grátis que faltam na planilha ──────────
  const faltantes = janela.filter((p) => !daPlanilha.has(p.chave));
  if (faltantes.length > 0) {
    try {
      await ensureTab(TAB, TAB_COLS);
      await appendRowsTyped(TAB, faltantes.map((p) => [p.chave, codigo, p.mes, p.valorNum]));
    } catch { /* modo demo / sem service account — segue só lendo */ }
  }

  // ── 5. Mescla (janela grátis vence no mesmo mês) e ordena ─────────────────
  const porMes = new Map<string, Ponto & { chave: string }>(daPlanilha);
  for (const p of janela) porMes.set(p.chave, p);
  const pontos = [...porMes.values()]
    .sort((a, b) => a.chave.localeCompare(b.chave))
    .map(({ mes, valor, valorNum }) => ({ mes, valor, valorNum }));

  return NextResponse.json(
    // fonteLimitada: a FIPE gratuita só abre ~3 meses — o resto vem da nossa
    // planilha, que acumula um mês por visita daqui pra frente.
    { pontos, ok: pontos.length > 0, fonteLimitada: true },
    { headers: houveFalha ? cacheCurto : cacheLongo },
  );
}
