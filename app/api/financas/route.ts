import { NextResponse } from "next/server";
import { fetchTab, writeTab } from "@/lib/gsheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const [pessoal, assinaturas, parcelamentos] = await Promise.allSettled([
      fetchTab("financas_pessoal"),
      fetchTab("financas_assinaturas"),
      fetchTab("financas_parcelamentos"),
    ]);

    return NextResponse.json({
      pessoal: pessoal.status === "fulfilled" ? pessoal.value : [],
      assinaturas: assinaturas.status === "fulfilled" ? assinaturas.value : [],
      parcelamentos: parcelamentos.status === "fulfilled" ? parcelamentos.value : [],
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
  try {
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
        await writeTab("financas_pessoal", headers, rows);
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
        await writeTab("financas_assinaturas", headers, rows);
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
        await writeTab("financas_parcelamentos", headers, rows);
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
