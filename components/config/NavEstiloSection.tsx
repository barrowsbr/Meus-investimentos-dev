"use client";

// Card de Configurações — estilo do MENU INFERIOR (mobile). Deixa escolher entre
// a barra atual (pill clássica) e o estilo PlayStation (barra curva com o item
// ativo iluminado + rótulo). localStorage, mesmo padrão dos outros prefs de UI.

import { useEffect, useState } from "react";
import { LayoutGrid, Check } from "lucide-react";
import { getNavEstilo, setNavEstilo, type NavEstilo } from "@/lib/nav-prefs";

const OPCOES: { id: NavEstilo; nome: string; desc: string }[] = [
  { id: "atual", nome: "Atual", desc: "Barra pill clássica — todos os ícones com rótulo curto." },
  { id: "playstation", nome: "PlayStation", desc: "Barra curva; só o item ativo acende com holofote e rótulo." },
];

// Miniatura vetorial de cada estilo (prévia sem depender do menu real).
function Preview({ estilo }: { estilo: NavEstilo }) {
  const ps = estilo === "playstation";
  return (
    <div
      className="relative mt-2 h-12 w-full overflow-hidden rounded-xl"
      style={{
        background: ps
          ? "radial-gradient(120% 90% at 50% 120%, rgba(232,163,61,0.20), transparent 60%), linear-gradient(180deg,#1b1b1e,#141416)"
          : "rgba(255,255,255,0.03)",
        border: "1px solid var(--line)",
        borderRadius: ps ? "14px 14px 10px 10px" : "12px",
      }}
    >
      <div className="flex h-full items-center justify-around px-3">
        {[0, 1, 2, 3, 4].map((i) => {
          const active = i === 1;
          return (
            <div key={i} className="relative flex flex-col items-center gap-1">
              {ps && active && (
                <span
                  className="absolute -bottom-1.5 h-6 w-8 rounded-full"
                  style={{ background: "radial-gradient(60% 100% at 50% 100%, rgba(232,163,61,0.9), transparent 65%)", filter: "blur(1px)" }}
                />
              )}
              <span
                className="relative rounded-md"
                style={{
                  width: active ? 11 : 9,
                  height: active ? 11 : 9,
                  background: active ? (ps ? "#fff" : "var(--accent)") : "var(--muted)",
                  opacity: active ? 1 : 0.55,
                  boxShadow: active && !ps ? "0 0 8px rgba(232,163,61,0.5)" : "none",
                }}
              />
              {(!ps || active) && (
                <span
                  className="rounded-full"
                  style={{ width: 12, height: 2, background: active ? (ps ? "#fff" : "var(--accent)") : "var(--faint)", opacity: ps && !active ? 0 : 0.7 }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NavEstiloSection() {
  const [estilo, setEstilo] = useState<NavEstilo>("atual");
  useEffect(() => { setEstilo(getNavEstilo()); }, []);

  const escolher = (e: NavEstilo) => { setNavEstilo(e); setEstilo(e); };

  return (
    <div className="pt-3 border-t border-zinc-800/50 space-y-3">
      <div className="flex items-center gap-2">
        <LayoutGrid size={13} className="text-amber-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Menu inferior (mobile)</span>
      </div>
      <p className="text-xs text-zinc-500">
        Escolha o visual da barra de navegação inferior no celular. O estilo
        <strong className="text-zinc-300"> PlayStation</strong> deixa só o item atual aceso, com holofote e
        rótulo, numa barra curva — como no app do console.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPCOES.map((o) => {
          const sel = estilo === o.id;
          return (
            <button
              key={o.id}
              onClick={() => escolher(o.id)}
              className="text-left rounded-xl p-3 transition-all"
              style={{
                border: sel ? "1px solid var(--accent)" : "1px solid var(--line)",
                background: sel ? "var(--accent-wash)" : "transparent",
                boxShadow: sel ? "0 0 0 1px var(--accent) inset" : "none",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: sel ? "var(--accent)" : "var(--fg)" }}>{o.nome}</span>
                {sel && <Check size={15} style={{ color: "var(--accent)" }} />}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{o.desc}</p>
              <Preview estilo={o.id} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
