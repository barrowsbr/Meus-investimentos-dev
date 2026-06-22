"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CountryDossier — painel deslizante com 5 abas:
//   Resumo → Inteligência → Mercados → Notícias → Macro
// Fase 2 adicionou: Inteligência (AI Brief + Instability Index) e Notícias
// (country news + predictive signals).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import type {
  SelectedCountry, IndexData, CurrencyData, CountryMacro,
  InstabilityData, BriefData, CountryNewsResponse, SignalsResponse,
  TimelineResponse, ExposureResponse, SymbolTarget,
} from "@/lib/radar/types";
import { detectConvergence } from "@/lib/radar/convergence";
import DossierHeader from "./dossier/DossierHeader";
import ResumoTab from "./dossier/ResumoTab";
import InteligenciaTab from "./dossier/InteligenciaTab";
import MercadosTab from "./dossier/MercadosTab";
import MoedaTab from "./dossier/MoedaTab";
import NoticiasTab from "./dossier/NoticiasTab";
import MacroTab from "./dossier/MacroTab";
import PortfolioTab from "./dossier/PortfolioTab";

type Tab = "resumo" | "inteligencia" | "mercados" | "moeda" | "noticias" | "macro" | "portfolio";
const TABS: { key: Tab; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "inteligencia", label: "Intel" },
  { key: "mercados", label: "Mercados" },
  { key: "moeda", label: "Moeda" },
  { key: "noticias", label: "Notícias" },
  { key: "macro", label: "Macro" },
  { key: "portfolio", label: "Portfólio" },
];

interface Props {
  selected: SelectedCountry | null;
  indices: IndexData[];
  currency: CurrencyData | null;
  macro: CountryMacro | null;
  macroLoading: boolean;
  instability: InstabilityData | null;
  instabilityLoading: boolean;
  brief: BriefData | null;
  briefLoading: boolean;
  news: CountryNewsResponse | null;
  newsLoading: boolean;
  signals: SignalsResponse | null;
  signalsLoading: boolean;
  timeline: TimelineResponse | null;
  timelineLoading: boolean;
  exposure: ExposureResponse | null;
  exposureLoading: boolean;
  onOpenSymbol: (t: SymbolTarget) => void;
  symbolDetailOpen?: boolean;
  onClose: () => void;
}

export default function CountryDossier({
  selected, indices, currency, macro, macroLoading,
  instability, instabilityLoading, brief, briefLoading,
  news, newsLoading, signals, signalsLoading,
  timeline, timelineLoading,
  exposure, exposureLoading,
  onOpenSymbol,
  symbolDetailOpen,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("resumo");

  const convergence = useMemo(() => {
    if (!selected) return null;
    return detectConvergence({ instability, currency, indices, news, signals });
  }, [selected, instability, currency, indices, news, signals]);

  useEffect(() => { setTab("resumo"); }, [selected?.iso]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onClose]);

  const open = !!selected;

  return (
    <>
      {open && <div className={`fixed inset-0 z-[55] bg-black/40 md:absolute md:inset-0 md:z-30 ${symbolDetailOpen ? "pointer-events-none" : ""}`} onClick={symbolDetailOpen ? undefined : onClose} aria-hidden />}

      <aside
        className="fixed inset-0 z-[60] flex flex-col transition-transform duration-300 ease-out md:absolute md:right-0 md:top-0 md:left-auto md:z-40 md:h-full md:w-[380px]"
        style={{
          transform: open ? "translateX(0)" : "translateX(105%)",
          background: "rgba(10,12,18,0.99)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: open ? "-12px 0 40px rgba(0,0,0,0.5)" : "none",
          paddingTop: "env(safe-area-inset-top)",
        }}
        aria-hidden={!open}
      >
        {selected && (
          <>
            <DossierHeader
              country={selected}
              instability={instability}
              convergence={convergence}
              onClose={onClose}
            />

            {/* Tabs */}
            <div className="flex gap-0.5 overflow-x-auto border-b border-white/10 px-2 pt-2">
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className="relative shrink-0 px-2.5 py-2 text-xs font-semibold transition-colors"
                    style={{ color: active ? "#fff" : "#71717a" }}
                  >
                    {t.label}
                    {active && <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-blue-400" />}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" style={{ overscrollBehavior: "contain" }}>
              {tab === "resumo" && (
                <ResumoTab
                  indices={indices}
                  currency={currency}
                  macro={macro}
                  countryName={selected.name}
                  timeline={timeline}
                  timelineLoading={timelineLoading}
                  convergence={convergence}
                  exposure={exposure}
                />
              )}
              {tab === "inteligencia" && (
                <InteligenciaTab
                  instability={instability}
                  instabilityLoading={instabilityLoading}
                  brief={brief}
                  briefLoading={briefLoading}
                  convergence={convergence}
                />
              )}
              {tab === "mercados" && <MercadosTab indices={indices} timeline={timeline} onOpenSymbol={onOpenSymbol} />}
              {tab === "moeda" && <MoedaTab currency={currency} />}
              {tab === "noticias" && (
                <NoticiasTab
                  news={news}
                  newsLoading={newsLoading}
                  signals={signals}
                  signalsLoading={signalsLoading}
                />
              )}
              {tab === "macro" && <MacroTab macro={macro} loading={macroLoading} />}
              {tab === "portfolio" && selected && (
                <PortfolioTab
                  countryName={selected.name}
                  exposure={exposure}
                  exposureLoading={exposureLoading}
                  indices={indices}
                />
              )}
              <div className="md:hidden" style={{ height: "calc(76px + env(safe-area-inset-bottom))" }} aria-hidden />
            </div>
          </>
        )}
      </aside>
    </>
  );
}
