"use client";

// Card de Configurações — "Modo espaços (Game Select)". Interruptor MESTRE do
// modo novo: quando ligado, a tela inicial /inicio aparece pós-login E a sidebar
// mostra só as páginas da categoria atual. Quando desligado, volta ao antigo:
// sem tela inicial e sidebar com TODAS as páginas por seção. localStorage.

import { useState, useEffect } from "react";
import Link from "next/link";
import { Gamepad2, ExternalLink, Sparkles, Minus } from "lucide-react";
import { getHubAtivo, setHubAtivo, getHubEstilo, setHubEstilo, type HubEstilo } from "@/lib/hub-prefs";

export default function InicioSection() {
  const [ativo, setAtivo] = useState(false);
  const [estilo, setEstilo] = useState<HubEstilo>("vivo");

  useEffect(() => { setAtivo(getHubAtivo()); setEstilo(getHubEstilo()); }, []);

  const toggle = () => { const v = !ativo; setHubAtivo(v); setAtivo(v); };
  const escolherEstilo = (e: HubEstilo) => { setHubEstilo(e); setEstilo(e); };

  return (
    <div className="pt-3 border-t border-zinc-800/50 space-y-3">
      <div className="flex items-center gap-2">
        <Gamepad2 size={13} className="text-amber-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Modo espaços — tela inicial + sidebar por categoria</span>
      </div>
      <p className="text-xs text-zinc-500">
        <strong className="text-zinc-300">Ligado:</strong> a tela inicial estilo Game Boy
        (Investimentos · Finanças · Barroots · Config) aparece <strong className="text-zinc-300">após o
        login</strong> e, ao entrar numa categoria, a <strong className="text-zinc-300">sidebar mostra só as
        páginas dela</strong> (com &ldquo;← Início&rdquo; para trocar).<br />
        <strong className="text-zinc-300">Desligado:</strong> volta ao antigo — sem tela inicial e a
        sidebar com <strong className="text-zinc-300">todas as páginas</strong> agrupadas por seção. (A senha,
        quando exigida, sempre vem antes.)
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={toggle}
          role="switch"
          aria-checked={ativo}
          className="relative inline-flex items-center rounded-full transition-colors"
          style={{ width: 46, height: 26, background: ativo ? "rgba(232,163,61,0.85)" : "rgba(128,128,128,0.25)" }}
        >
          <span
            className="absolute rounded-full bg-white transition-transform"
            style={{ width: 20, height: 20, top: 3, left: 3, transform: ativo ? "translateX(20px)" : "translateX(0)" }}
          />
        </button>
        <span className="font-mono text-xs" style={{ color: ativo ? "#E8A33D" : "#a1a1aa", fontWeight: 700 }}>
          {ativo ? "ATIVADA" : "DESLIGADA"}
        </span>

        <Link
          href="/inicio"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{ border: "1px solid var(--line-strong)", color: "var(--muted)" }}
        >
          <ExternalLink size={12} /> Ver a tela agora
        </Link>
      </div>

      {ativo && (
        <div className="pt-2 space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Estilo da tela inicial</span>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            {([
              { id: "vivo" as HubEstilo, icon: Sparkles, titulo: "Vivo", desc: "HUD de vidro 3D, dados animados e fundo em movimento" },
              { id: "sobrio" as HubEstilo, icon: Minus, titulo: "Sóbrio", desc: "Estático, elegante e sem animações" },
            ]).map(({ id, icon: Icon, titulo, desc }) => {
              const on = estilo === id;
              return (
                <button
                  key={id}
                  onClick={() => escolherEstilo(id)}
                  className="flex flex-col gap-1 rounded-xl p-3 text-left transition-colors"
                  style={{
                    border: on ? "1px solid rgba(232,163,61,0.7)" : "1px solid var(--line, rgba(255,255,255,0.1))",
                    background: on ? "rgba(232,163,61,0.1)" : "rgba(255,255,255,0.02)",
                  }}
                  aria-pressed={on}
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: on ? "#E8A33D" : "var(--text)" }}>
                    <Icon size={13} /> {titulo}
                  </span>
                  <span className="text-[11px] leading-snug" style={{ color: "var(--muted)" }}>{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
