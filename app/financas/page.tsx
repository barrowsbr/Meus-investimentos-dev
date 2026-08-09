"use client";

// Finanças — reescrita de ago/2026 (pedido do dono: "do zero").
// Duas áreas:
//   GASTOS → o dia a dia do cartão (OFX do Nubank) com categorias e gráficos,
//            + assinaturas e parcelamentos MESCLADOS (detectado no cartão ∪
//            cadastro manual, sem contagem dupla) e projeção de compromissos.
//   CUSTOS → o orçamento do mês: entradas, contas fixas, COMPROMISSOS
//            automáticos (assinaturas+parcelas da aba Gastos) e meta.
//
// Dados manuais seguem nas MESMAS abas da planilha (financas_pessoal,
// financas_assinaturas, financas_parcelamentos) via /api/financas, com o
// autosave debounced e a proteção contra regravar no F5 da página antiga.
// O cartão vive em cartao_transacoes via /api/financas/cartao.

import { useState, useEffect, useRef, useCallback } from "react";
import { Wallet, CreditCard, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import GastosTab from "@/components/financas/GastosTab";
import CustosTab from "@/components/financas/CustosTab";
import { SaveIndicator, type SaveStatus } from "@/components/financas/ui";
import {
  parseMensalRows, parseAssinaturas, parseParcelamentos,
  type RowMensal, type Assinatura, type Parcelamento,
} from "@/lib/financas/tipos";

export default function FinancasPage() {
  const [mensalRows, setMensalRows] = useState<RowMensal[]>([]);
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [parcelamentos, setParcelamentos] = useState<Parcelamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"gastos" | "custos">("gastos");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const initialLoaded = useRef(false);
  // O próprio load seta os 3 estados, o que dispararia o autosave e regravaria
  // (3 writeTab + 3 backups) a cada F5 — e sobrescreveria a aba com VAZIO se o
  // load viesse incompleto. O flag ignora o 1º disparo pós-load; só edições
  // reais do usuário salvam.
  const skipNextSave = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/financas")
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setMensalRows(parseMensalRows(data.pessoal ?? []));
        setAssinaturas(parseAssinaturas(data.assinaturas ?? []));
        setParcelamentos(parseParcelamentos(data.parcelamentos ?? []));
        initialLoaded.current = true;
      })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const doSave = useCallback(async (
    mensal: RowMensal[], ass: Assinatura[], parc: Parcelamento[],
  ) => {
    setSaveStatus("saving");
    try {
      const responses = await Promise.all([
        fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: "pessoal", data: mensal }) }),
        fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: "assinaturas", data: ass }) }),
        fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: "parcelamentos", data: parc }) }),
      ]);
      const bodies = await Promise.all(responses.map(r => r.json()));
      if (bodies.some(b => b.readonly)) { setSaveStatus("readonly"); return; }
      if (responses.some(r => !r.ok)) throw new Error("Falha ao salvar");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!initialLoaded.current) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("idle");
    saveTimer.current = setTimeout(() => {
      doSave(mensalRows, assinaturas, parcelamentos);
    }, 1500);
  }, [mensalRows, assinaturas, parcelamentos, doSave]);

  if (loading) return <LoadingSpinner />;

  const tabs = [
    { id: "gastos", label: "Gastos", icon: <CreditCard size={14} /> },
    { id: "custos", label: "Custos", icon: <Wallet size={14} /> },
  ] as const;

  return (
    <>
      <div className="flex items-start justify-between">
        <PageHeader title="Finanças" description="Gastos do dia a dia e custos do mês" />
        <div className="mt-1"><SaveIndicator status={saveStatus} /></div>
      </div>

      {loadError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 flex items-center gap-2">
          <AlertCircle size={14} />{loadError}
        </div>
      )}

      <div className="flex mb-5" style={{ borderBottom: "1px solid var(--line)" }}>
        {tabs.map(tab => {
          const on = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 font-mono uppercase whitespace-nowrap"
              style={{ padding: "9px 12px", marginBottom: -1, borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, color: on ? "var(--text)" : "var(--muted)", fontSize: 11, fontWeight: 600, letterSpacing: ".05em" }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="animate-fade-in">
        {activeTab === "gastos" && (
          <GastosTab
            assinaturas={assinaturas}
            setAssinaturas={setAssinaturas}
            parcelamentos={parcelamentos}
            setParcelamentos={setParcelamentos}
          />
        )}
        {activeTab === "custos" && (
          <CustosTab
            rows={mensalRows}
            setRows={setMensalRows}
            assinaturas={assinaturas}
            parcelamentos={parcelamentos}
          />
        )}
      </div>
    </>
  );
}
