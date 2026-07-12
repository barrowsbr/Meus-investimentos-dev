"use client";

// Card "Notícias — Perfil de interesses" (Configurações). Define os temas que
// o feed "Para você" prioriza e o filtro anti-briga política. Salvo em
// localStorage (lib/news/perfil); o NoticiasPanel reage na hora via evento.

import { useEffect, useState } from "react";
import { Check, ShieldOff } from "lucide-react";
import { TEMAS_PERFIL, type Tema } from "@/lib/news/temas";
import { getPerfilNoticias, setPerfilNoticias, type PerfilNoticias } from "@/lib/news/perfil";

export default function NoticiasPerfilCard() {
  const [perfil, setPerfil] = useState<PerfilNoticias | null>(null);

  useEffect(() => { setPerfil(getPerfilNoticias()); }, []);
  if (!perfil) return null;

  const salvar = (p: PerfilNoticias) => { setPerfil(p); setPerfilNoticias(p); };

  const toggleTema = (t: Tema) => {
    const tem = perfil.interesses.includes(t);
    const interesses = tem ? perfil.interesses.filter((x) => x !== t) : [...perfil.interesses, t];
    if (interesses.length === 0) return; // pelo menos 1 tema
    salvar({ ...perfil, interesses });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Os temas marcados ganham prioridade no feed <span className="text-zinc-300">&ldquo;Para você&rdquo;</span> da página de Notícias.
        O ranking combina interesse + impacto + recência + <span className="text-zinc-400">preferência por notícia com imagem</span>,
        com curadoria por IA no topo do feed. Vale na hora, sem recarregar.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {TEMAS_PERFIL.map((t) => {
          const on = perfil.interesses.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggleTema(t.id)}
              className="relative rounded-lg p-3 text-left transition-all hover:scale-[1.01]"
              style={{
                background: on ? "rgba(96,165,250,0.08)" : "rgba(8,15,20,0.5)",
                border: on ? "2px solid rgba(96,165,250,0.5)" : "2px solid rgba(128,128,128,0.18)",
              }}
            >
              {on && <Check size={13} className="absolute top-2.5 right-2.5 text-sky-300" />}
              <p className={`text-sm font-semibold ${on ? "text-sky-200" : "text-zinc-300"}`}>{t.label}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{t.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <ShieldOff size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-zinc-200">Filtrar briga política</p>
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
              Esconde picuinha e bastidor (&ldquo;fulano rebate sicrano&rdquo;, farpas, bate-boca). Geopolítica de verdade
              — guerras, sanções, decisões que movem o mundo — continua passando.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 select-none shrink-0 cursor-pointer">
          <div
            className={`rounded-full transition-colors relative ${perfil.semBriga ? "bg-emerald-500" : "bg-zinc-600"}`}
            style={{ width: 40, height: 22 }}
            onClick={() => salvar({ ...perfil, semBriga: !perfil.semBriga })}
          >
            <div className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all" style={{ left: perfil.semBriga ? 20 : 2 }} />
          </div>
          <span className={`text-xs font-mono font-bold ${perfil.semBriga ? "text-emerald-400" : "text-zinc-500"}`}>{perfil.semBriga ? "ON" : "OFF"}</span>
        </label>
      </div>
    </div>
  );
}
