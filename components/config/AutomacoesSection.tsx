"use client";

// Extraído de app/configuracoes/page.tsx — seção "Automações (Cron & GitHub Actions)"
// (tudo que roda sozinho, com liga/desliga individual).

import { useState, useEffect } from "react";
import { Loader2, ExternalLink } from "lucide-react";

// ── Automações (Vercel Cron · GitHub Actions · rotinas do app) ───────────────

interface AutomacaoItem {
  chave: string; nome: string; descricao: string; agenda: string;
  tipo: "vercel" | "github" | "app"; link?: string; ativo: boolean;
}

const TIPO_LABEL: Record<AutomacaoItem["tipo"], string> = {
  vercel: "Vercel Cron",
  github: "GitHub Actions",
  app: "Rotinas do app",
};

export default function AutomacoesSection() {
  const [items, setItems] = useState<AutomacaoItem[] | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config/automacoes")
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setErro(d.error);
        else setItems(d.automacoes ?? []);
      })
      .catch(() => setErro("Falha ao carregar as automações"));
  }, []);

  const toggle = async (item: AutomacaoItem) => {
    setSalvando(item.chave); setErro(null);
    const novo = !item.ativo;
    try {
      const r = await fetch("/api/config/automacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: item.chave, ativo: novo }),
      });
      const d = await r.json();
      if (!r.ok || d?.error) { setErro(d?.error ?? `Erro ${r.status}`); return; }
      setItems((list) => (list ?? []).map((i) => (i.chave === item.chave ? { ...i, ativo: novo } : i)));
    } catch { setErro("Falha de rede ao salvar"); }
    finally { setSalvando(null); }
  };

  if (erro && !items) return <p className="text-xs text-red-400">{erro}</p>;
  if (!items) return <div className="flex items-center gap-2 py-6 justify-center text-zinc-500 text-xs"><Loader2 size={14} className="animate-spin" /> Carregando automações…</div>;

  const grupos: AutomacaoItem["tipo"][] = ["vercel", "github", "app"];

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Tudo que roda sozinho no projeto, num lugar só. Desligar aqui <span className="text-zinc-400">não remove o agendamento</span> —
        o cron/Action continua disparando, mas a execução é pulada até você religar. Alertas, resumo e histórico compartilham o
        interruptor com os cards deles (mudar aqui muda lá).
      </p>

      {grupos.map((tipo) => {
        const doGrupo = items.filter((i) => i.tipo === tipo);
        if (doGrupo.length === 0) return null;
        return (
          <div key={tipo} className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{TIPO_LABEL[tipo]}</p>
            {doGrupo.map((item) => (
              <div key={item.chave} className={`flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 ${salvando === item.chave ? "opacity-60" : ""}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-200">{item.nome}</p>
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-zinc-500">{item.agenda}</span>
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-cyan-400/80 hover:text-cyan-300">
                        workflow <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{item.descricao}</p>
                </div>
                <label className="flex items-center gap-2 select-none shrink-0 cursor-pointer">
                  <div
                    className={`rounded-full transition-colors relative ${item.ativo ? "bg-emerald-500" : "bg-zinc-600"}`}
                    style={{ width: 40, height: 22 }}
                    onClick={() => salvando == null && toggle(item)}
                  >
                    <div className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all" style={{ left: item.ativo ? 20 : 2 }} />
                  </div>
                  <span className={`text-xs font-mono font-bold w-7 ${item.ativo ? "text-emerald-400" : "text-zinc-500"}`}>
                    {salvando === item.chave ? <Loader2 size={12} className="animate-spin" /> : item.ativo ? "ON" : "OFF"}
                  </span>
                </label>
              </div>
            ))}
          </div>
        );
      })}

      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </div>
  );
}
