"use client";

import { useState } from "react";
import { Egg, Sparkles, Lock, Eye, EyeOff, Trophy, Gamepad2, Music } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const EGGS = [
  {
    icon: Sparkles,
    title: "HoloGlobe",
    desc: "Clique no logo da home para ciclar entre Terra, Saturno, Urano e... um buraco negro com lensing gravitacional real.",
    found: true,
    hint: "Logo na página inicial",
    color: "#60a5fa",
  },
  {
    icon: Trophy,
    title: "???",
    desc: null,
    found: false,
    hint: "Alcance um marco de patrimônio",
    color: "#f59e0b",
  },
  {
    icon: Gamepad2,
    title: "???",
    desc: null,
    found: false,
    hint: "Konami code em qualquer página",
    color: "#34d399",
  },
  {
    icon: Music,
    title: "???",
    desc: null,
    found: false,
    hint: "Tente um ticker que não existe",
    color: "#8b5cf6",
  },
];

export default function EasterEggsPage() {
  const [showHints, setShowHints] = useState(false);
  const found = EGGS.filter(e => e.found).length;

  return (
    <>
      <PageHeader
        title="Easter Eggs"
        description={`${found}/${EGGS.length} descobertos`}
      />

      <div className="glass-card p-6 mb-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
          <Egg size={14} className="text-amber-400" />
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
            {found}/{EGGS.length} encontrados
          </span>
        </div>
        <h2 className="text-lg font-bold text-zinc-200 mb-2">
          Segredos escondidos pelo app
        </h2>
        <p className="text-sm text-zinc-500 max-w-lg mx-auto mb-4">
          Explore o dashboard para encontrar easter eggs escondidos.
          Mais serão adicionados com o tempo.
        </p>
        <button
          onClick={() => setShowHints(h => !h)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50"
        >
          {showHints ? <EyeOff size={13} /> : <Eye size={13} />}
          {showHints ? "Esconder dicas" : "Mostrar dicas"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EGGS.map((egg, i) => (
          <div
            key={i}
            className={`glass-card p-5 transition-all ${egg.found ? "opacity-100" : "opacity-50"}`}
            style={egg.found ? { borderColor: `${egg.color}20` } : undefined}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="p-2.5 rounded-xl"
                style={{ background: egg.found ? `${egg.color}15` : "rgba(63,63,70,0.3)" }}
              >
                {egg.found ? (
                  <egg.icon size={20} style={{ color: egg.color }} />
                ) : (
                  <Lock size={20} className="text-zinc-600" />
                )}
              </div>
              <div>
                <h3 className={`text-sm font-semibold ${egg.found ? "text-zinc-200" : "text-zinc-600"}`}>
                  {egg.title}
                </h3>
                {egg.found && (
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Descoberto</span>
                )}
              </div>
            </div>
            {egg.found && egg.desc ? (
              <p className="text-xs text-zinc-400 leading-relaxed">{egg.desc}</p>
            ) : (
              <p className="text-xs text-zinc-600 italic">
                {showHints ? egg.hint : "Easter egg não descoberto"}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
