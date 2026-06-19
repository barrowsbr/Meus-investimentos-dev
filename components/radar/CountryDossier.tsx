"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CountryDossier — o painel deslizante que define a V2. Um clique no país abre a
// leitura completa daquele mercado: síntese → mercados → macro. O mapa permanece
// vivo atrás (Princípio I). Fase 1: cabeçalho + mercados locais + macro.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import type { SelectedCountry, IndexData, CurrencyData, CountryMacro } from "@/lib/radar/types";
import DossierHeader from "./dossier/DossierHeader";
import ResumoTab from "./dossier/ResumoTab";
import MercadosTab from "./dossier/MercadosTab";
import MacroTab from "./dossier/MacroTab";

type Tab = "resumo" | "mercados" | "macro";
const TABS: { key: Tab; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "mercados", label: "Mercados" },
  { key: "macro", label: "Macro" },
];

interface Props {
  selected: SelectedCountry | null;
  indices: IndexData[];
  currency: CurrencyData | null;
  macro: CountryMacro | null;
  macroLoading: boolean;
  onClose: () => void;
}

export default function CountryDossier({ selected, indices, currency, macro, macroLoading, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resumo");

  // Volta ao Resumo sempre que troca de país.
  useEffect(() => { setTab("resumo"); }, [selected?.iso]);

  // Fecha com ESC.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onClose]);

  const open = !!selected;

  return (
    <>
      {/* Backdrop só no mobile (no desktop o mapa fica visível ao lado) */}
      {open && <div className="absolute inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden />}

      <aside
        className="absolute right-0 top-0 z-40 flex h-full w-full flex-col transition-transform duration-300 ease-out md:w-[380px]"
        style={{
          transform: open ? "translateX(0)" : "translateX(105%)",
          background: "rgba(10,12,18,0.97)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: open ? "-12px 0 40px rgba(0,0,0,0.5)" : "none",
          backdropFilter: "blur(8px)",
        }}
        aria-hidden={!open}
      >
        {selected && (
          <>
            <DossierHeader country={selected} onClose={onClose} />

            {/* Tabs */}
            <div className="flex gap-1 border-b border-white/10 px-3 pt-2">
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className="relative px-3 py-2 text-xs font-semibold transition-colors"
                    style={{ color: active ? "#fff" : "#71717a" }}
                  >
                    {t.label}
                    {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-400" />}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "resumo" && <ResumoTab indices={indices} currency={currency} macro={macro} />}
              {tab === "mercados" && <MercadosTab indices={indices} currency={currency} />}
              {tab === "macro" && <MacroTab macro={macro} loading={macroLoading} />}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
