// Resumo de estado para os CABEÇALHOS dos cards de Configurações — uma única
// chamada leve alimenta os chips de status (ver o estado sem abrir o card).
// Cada bloco é best-effort: falhou, vem null e o chip simplesmente não aparece.

import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { API_REGISTRY } from "@/lib/api-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [alertas, automacoes, historico, planilha, senha] = await Promise.allSettled([
    import("@/lib/alertas-store").then(async (m) => {
      const c = await m.readAlertasConfig();
      return { ativo: c.ativo, chatOk: !!c.chatId, resumoAtivo: c.resumoAtivo };
    }),
    import("@/lib/automacoes").then(async (m) => {
      const list = await m.readAutomacoes();
      const porChave: Record<string, boolean> = {};
      for (const a of list) porChave[a.chave] = a.ativo;
      return { ativas: list.filter((a) => a.ativo).length, total: list.length, porChave };
    }),
    import("@/lib/historico-store").then(async (m) => ({ ativo: (await m.readHistoricoConfig()).ativo })),
    import("@/lib/gsheets").then(async (m) => {
      const nomes = await m.listSheetNames();
      return { abas: nomes.filter((n) => n.trim() !== "" && !n.trim().toLowerCase().startsWith("bkp")).length };
    }),
    (async () => {
      const rows = await getDataStore().fetchTab("config").catch(() => [] as Record<string, unknown>[]);
      let senhaSet = false, loginEnabled = true;
      for (const r of rows) {
        const k = String(r["chave"] ?? r["key"] ?? "").toLowerCase().trim();
        const v = String(r["valor"] ?? r["value"] ?? "").trim();
        if (k === "senha" || k === "password") senhaSet = !!v;
        if (k === "exigir_login" || k === "login_habilitado" || k === "require_login") {
          const lv = v.toLowerCase();
          loginEnabled = !(lv === "0" || lv === "false" || lv === "nao" || lv === "não" || lv === "off");
        }
      }
      return { senhaSet, loginEnabled };
    })(),
  ]);

  const ok = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);

  return NextResponse.json({
    alertas: ok(alertas),
    automacoes: ok(automacoes),
    historico: ok(historico),
    planilha: ok(planilha),
    senha: ok(senha),
    apis: { total: API_REGISTRY.length },
  });
}
