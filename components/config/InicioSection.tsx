"use client";

// Card de Configurações — "Tela inicial (Game Select)". Liga/desliga o hub
// pós-login: quando ativo, o AuthGate direciona para /inicio logo após o login
// (a senha, quando exigida, sempre vem antes). Preferência local (localStorage).

import { useState, useEffect } from "react";
import Link from "next/link";
import { Gamepad2, ExternalLink } from "lucide-react";
import { getHubAtivo, setHubAtivo } from "@/lib/hub-prefs";

export default function InicioSection() {
  const [ativo, setAtivo] = useState(false);

  useEffect(() => { setAtivo(getHubAtivo()); }, []);

  const toggle = () => { const v = !ativo; setHubAtivo(v); setAtivo(v); };

  return (
    <div className="pt-3 border-t border-zinc-800/50 space-y-3">
      <div className="flex items-center gap-2">
        <Gamepad2 size={13} className="text-amber-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Tela inicial — Game Select</span>
      </div>
      <p className="text-xs text-zinc-500">
        Uma tela de entrada estilo cartucho de Game Boy com 4 botões
        (Investimentos · Finanças · Barroots · Config) sobre um fundo 3D. Quando
        ligada, ela aparece <strong className="text-zinc-300">logo após o login</strong> — a
        senha, se exigida, sempre vem antes.
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
    </div>
  );
}
