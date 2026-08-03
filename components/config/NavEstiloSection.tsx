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
  if (ps) {
    // Barra full-bleed com horizonte convexo, ícones na curva, bloom no ativo
    // (canto esquerdo) e rótulo centralizado embaixo — como o app do console.
    return (
      <div className="relative mt-2 h-14 w-full overflow-hidden rounded-lg" style={{ background: "#0b0b0d", border: "1px solid var(--line)" }}>
        <span className="absolute" style={{ left: "50%", top: 8, transform: "translateX(-50%)", width: "220%", height: 120, borderRadius: "100% 100% 0 0 / 60px 60px 0 0", background: "linear-gradient(180deg,#232328,#141417)", boxShadow: "0 -1px 0 rgba(255,255,255,0.08)" }} />
        <div className="absolute left-0 right-0 flex items-center justify-around" style={{ top: 12, height: 20 }}>
          {[0, 1, 2, 3, 4].map((i) => {
            const active = i === 0;
            const t = (i - 2) / 2;
            return (
              <span key={i} className="relative flex items-center justify-center" style={{ transform: `translateY(${Math.round(5 * t * t)}px)` }}>
                {active && (
                  <span className="absolute" style={{ top: 2, left: "50%", transform: "translateX(-50%)", width: 34, height: 34, filter: "blur(4px)", background: "radial-gradient(52% 78% at 50% 100%, rgba(232,163,61,0.85), transparent 72%)" }} />
                )}
                <span className="relative rounded-[3px]" style={{ width: active ? 10 : 8, height: active ? 10 : 8, background: active ? "#fff" : "#77777e" }} />
              </span>
            );
          })}
        </div>
        <span className="absolute left-0 right-0 text-center" style={{ bottom: 4, fontSize: 8, fontWeight: 600, color: "#fff" }}>Início</span>
      </div>
    );
  }
  return (
    <div className="relative mt-2 h-14 w-full rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
      <div className="flex h-full items-center justify-around px-3">
        {[0, 1, 2, 3, 4].map((i) => {
          const active = i === 1;
          return (
            <div key={i} className="relative flex flex-col items-center gap-1">
              <span
                className="rounded-md"
                style={{
                  width: active ? 11 : 9,
                  height: active ? 11 : 9,
                  background: active ? "var(--accent)" : "var(--muted)",
                  opacity: active ? 1 : 0.55,
                  boxShadow: active ? "0 0 8px rgba(232,163,61,0.5)" : "none",
                }}
              />
              <span className="rounded-full" style={{ width: 12, height: 2, background: active ? "var(--accent)" : "var(--faint)", opacity: 0.7 }} />
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
