import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth-server";
import { getDataStore } from "@/lib/data-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const store = getDataStore();
    const [pessoal, assinaturas, parcelamentos, meses] = await Promise.allSettled([
      store.fetchTab("financas_pessoal"),
      store.fetchTab("financas_assinaturas"),
      store.fetchTab("financas_parcelamentos"),
      store.fetchTab("financas_meses"),
    ]);

    return NextResponse.json({
      pessoal: pessoal.status === "fulfilled" ? pessoal.value : [],
      assinaturas: assinaturas.status === "fulfilled" ? assinaturas.value : [],
      parcelamentos: parcelamentos.status === "fulfilled" ? parcelamentos.value : [],
      // Aba pode ainda não existir — o parse do cliente é estrito (exige YYYY-MM).
      meses: meses.status === "fulfilled" ? meses.value : [],
      errors: {
        pessoal: pessoal.status === "rejected" ? String(pessoal.reason) : null,
        assinaturas: assinaturas.status === "rejected" ? String(assinaturas.reason) : null,
        parcelamentos: parcelamentos.status === "rejected" ? String(parcelamentos.reason) : null,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const store = getDataStore();
    const body = await request.json();
    const { tab, data } = body;

    if (!tab || !Array.isArray(data)) {
      return NextResponse.json({ error: "tab e data são obrigatórios" }, { status: 400 });
    }

    switch (tab) {
      case "pessoal": {
        const headers = ["Categoria", "Nome", "Valor"];
        const rows = (data as Record<string, unknown>[]).map(r => [
          String(r.categoria ?? ""),
          String(r.nome ?? ""),
          String(Number(r.valor ?? 0)),
        ]);
        await store.writeTab("financas_pessoal", headers, rows);
        break;
      }
      case "assinaturas": {
        const headers = ["Nome", "Valor", "Dia", "Ativa"];
        const rows = (data as Record<string, unknown>[]).map(r => [
          String(r.nome ?? ""),
          String(Number(r.valor ?? 0)),
          String(Number(r.dia ?? 0)),
          r.ativa === false ? "FALSE" : "TRUE",
        ]);
        await store.writeTab("financas_assinaturas", headers, rows);
        break;
      }
      case "parcelamentos": {
        const headers = ["Nome", "Valor_Total", "Parcelas", "Data_Compra"];
        const rows = (data as Record<string, unknown>[]).map(r => [
          String(r.nome ?? ""),
          String(Number(r.valor_total ?? 0)),
          String(Number(r.parcelas ?? 1)),
          String(r.data_compra ?? ""),
        ]);
        await store.writeTab("financas_parcelamentos", headers, rows);
        break;
      }
      case "meses": {
        // ⚠️ ensureTab ANTES do write: sem a aba exata, o resolveTabName
        // difuso do writeTab casaria "financas_meses" com "financas" e
        // LIMPARIA a aba errada.
        const headers = ["Mes", "Fechado", "Entradas", "Fixas", "Compromissos", "Cartao", "Avaliacao", "Notas", "Teto_Cartao", "Meta_Aporte", "Plano"];
        const { ensureTab } = await import("@/lib/gsheets");
        await ensureTab("financas_meses", headers);
        const rows = (data as Record<string, unknown>[])
          .filter(r => /^\d{4}-\d{2}$/.test(String(r.mes ?? "")))
          .map(r => [
            String(r.mes),
            r.fechado ? "TRUE" : "FALSE",
            String(Number(r.entradas ?? 0)),
            String(Number(r.fixas ?? 0)),
            String(Number(r.compromissos ?? 0)),
            String(Number(r.cartao ?? 0)),
            String(Number(r.avaliacao ?? 0)),
            String(r.notas ?? ""),
            String(Number(r.tetoCartao ?? 0)),
            String(Number(r.metaAporte ?? 0)),
            String(r.plano ?? ""),
          ]);
        await store.writeTab("financas_meses", headers, rows);
        break;
      }
      default:
        return NextResponse.json({ error: "Tab inválida" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    if (message.includes("GOOGLE_SERVICE_ACCOUNT_JSON")) {
      return NextResponse.json({
        error: "Salvamento requer service account",
        hint: "Configure GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente",
        readonly: true,
      }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
