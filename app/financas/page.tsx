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
import { Wallet, CreditCard, CalendarDays, AlertCircle, Scale } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import GastosTab from "@/components/financas/GastosTab";
import CustosTab from "@/components/financas/CustosTab";
import MesesTab from "@/components/financas/MesesTab";
import AcertoTab from "@/components/financas/AcertoTab";
import { useCartao } from "@/components/financas/useCartao";
import { calcularAcerto, construirProximaFatura, serieSobras, type TransacaoAcerto } from "@/lib/financas/acerto";
import { nomesCasam } from "@/lib/financas/mesclar";
import { compactBRL } from "@/lib/format";
import { SaveIndicator, type SaveStatus } from "@/components/financas/ui";
import {
  parseMensalRows, parseAssinaturas, parseParcelamentos, parseMeses,
  type RowMensal, type Assinatura, type Parcelamento, type MesRegistro,
} from "@/lib/financas/tipos";

export default function FinancasPage() {
  const [mensalRows, setMensalRows] = useState<RowMensal[]>([]);
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [parcelamentos, setParcelamentos] = useState<Parcelamento[]>([]);
  const [meses, setMeses] = useState<MesRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"acerto" | "gastos" | "custos" | "meses">("acerto");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const { cartao } = useCartao(); // aba Acerto (cache de módulo — Gastos reusa)

  // Faixa-ponte: os 3 números do modelo, vivos em TODAS as abas (editar Custos
  // muda a sobra na hora; importar OFX muda a fatura). Mesma conta do Acerto.
  const ponte = (() => {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const ymAtual = hojeISO.slice(0, 7);
    const diaFechamento = cartao?.fechamentoDia ?? 28;
    const dets = cartao?.assinaturas ?? [];
    const trans: TransacaoAcerto[] = (cartao?.transacoes ?? []).map(t => ({
      data: t.data, valor: t.valor, parcela: t.parcela,
      assinatura: dets.some(a => nomesCasam(a.nome, t.estabelecimento)),
    }));
    const acerto = calcularAcerto({ mensal: mensalRows, trans, ymAtual, diaFechamento });
    const prox = construirProximaFatura({
      trans, hoje: hojeISO, diaFechamento,
      assinaturasMensais: dets.reduce((s2, a) => s2 + a.valorMensal, 0),
      parcelasRestantes: (cartao?.parcelamentos ?? []).map(pc => ({ valorParcela: pc.valorParcela, restantes: pc.restantes })),
    });
    const sobras = serieSobras(meses.map(m => ({ mes: m.mes, entradas: m.entradas, fixas: m.fixas, cartao: m.cartao, fechado: m.fechado })));
    return { acerto, prox, acumulado: sobras.length ? sobras[sobras.length - 1].acumulado : 0 };
  })();

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
        setMeses(parseMeses(data.meses ?? []));
        initialLoaded.current = true;
      })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const doSave = useCallback(async (
    mensal: RowMensal[], ass: Assinatura[], parc: Parcelamento[], mss: MesRegistro[],
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
        fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: "meses", data: mss }) }),
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
      doSave(mensalRows, assinaturas, parcelamentos, meses);
    }, 1500);
  }, [mensalRows, assinaturas, parcelamentos, meses, doSave]);

  if (loading) return <LoadingSpinner />;

  const tabs = [
    { id: "acerto", label: "Acerto", icon: <Scale size={14} /> },
    { id: "gastos", label: "Gastos", icon: <CreditCard size={14} /> },
    { id: "custos", label: "Custos", icon: <Wallet size={14} /> },
    { id: "meses", label: "Meses", icon: <CalendarDays size={14} /> },
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

      {/* ── Faixa-ponte do modelo (viva em todas as abas) ── */}
      {!loading && (
        <button onClick={() => setActiveTab("acerto")}
          className="mb-4 flex w-full flex-wrap items-center gap-x-5 gap-y-1 rounded-xl px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
          style={{ border: "1px solid var(--line)", background: "rgba(255,255,255,0.02)" }}>
          <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
            sobra do mês{" "}
            <b className={ponte.acerto.sobra >= 0 ? "text-emerald-400" : "text-red-400"}>
              {ponte.acerto.sobra >= 0 ? "+" : "−"}{compactBRL(Math.abs(ponte.acerto.sobra))}
            </b>
          </span>
          <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
            próxima fatura <b className="text-zinc-200">{compactBRL(ponte.prox.totalPrevisto)}</b> em construção
          </span>
          <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
            acumulado{" "}
            <b className={ponte.acumulado >= 0 ? "text-emerald-400" : "text-red-400"}>
              {ponte.acumulado >= 0 ? "+" : "−"}{compactBRL(Math.abs(ponte.acumulado))}
            </b>
          </span>
          <span className="ml-auto font-mono text-[10px]" style={{ color: "var(--faint)" }}>Acerto ›</span>
        </button>
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
        {activeTab === "acerto" && (
          <AcertoTab
            mensalRows={mensalRows}
            meses={meses}
            cartao={cartao}
            tetoCartao={(() => {
              const ym = new Date().toISOString().slice(0, 7);
              return meses.find(m => m.mes === ym)?.tetoCartao ?? 0;
            })()}
          />
        )}

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
        {activeTab === "meses" && (
          <MesesTab
            meses={meses}
            setMeses={setMeses}
            mensalRows={mensalRows}
            assinaturas={assinaturas}
            parcelamentos={parcelamentos}
          />
        )}
      </div>
    </>
  );
}
