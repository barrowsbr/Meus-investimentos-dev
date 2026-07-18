"use client";

// Extraído de app/configuracoes/page.tsx — seção "Histórico patrimonial (GitHub Action)"
// (liga/desliga a gravação 3×/dia e botão "Registrar agora").

import { useState, useEffect } from "react";
import { Loader2, Play, ExternalLink } from "lucide-react";
import { ToggleRow } from "@/components/config/shared";

// ── Histórico patrimonial (GitHub Action) ───────────────────────────────────

export default function HistoricoSection() {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [reg, setReg] = useState<{ loading: boolean; ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/config/historico")
      .then((r) => r.json())
      .then((d) => setAtivo(d?.ativo !== false))
      .catch(() => setAtivo(true));
  }, []);

  const toggle = async () => {
    if (ativo === null || saving) return;
    const novo = !ativo;
    setSaving(true);
    setAtivo(novo);
    try {
      await fetch("/api/config/historico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novo }),
      });
    } catch {
      setAtivo(!novo); // desfaz em erro
    } finally {
      setSaving(false);
    }
  };

  const registrarAgora = async () => {
    setReg({ loading: true, ok: false, msg: "" });
    try {
      const r = await fetch("/api/config/historico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrar: true }),
      }).then((res) => res.json());
      if (r?.written) {
        const v = typeof r.patrimonio_total === "number" ? `R$ ${r.patrimonio_total.toLocaleString("pt-BR")}` : "";
        setReg({ loading: false, ok: true, msg: `Registrado ${r.data} ${r.hora}h · ${v}` });
      } else {
        setReg({ loading: false, ok: false, msg: r?.skipped || r?.error || "Não gravou" });
      }
    } catch {
      setReg({ loading: false, ok: false, msg: "Erro de rede" });
    }
  };

  return (
    <div className="space-y-4">
      {ativo === null ? (
        <div className="flex h-16 items-center justify-center"><Loader2 size={16} className="animate-spin text-zinc-500" /></div>
      ) : (
        <ToggleRow
          title="Gravar histórico do patrimônio"
          desc="Quando ligado, a rotina do GitHub Actions grava um ponto do patrimônio 3×/dia (dias úteis) na aba historico_patrimonio, que alimenta a página Patrimônio."
          on={ativo}
          onToggle={toggle}
          disabled={saving}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={registrarAgora}
          disabled={reg?.loading}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/16 disabled:opacity-50"
        >
          {reg?.loading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          Registrar agora
        </button>
        <a
          href="https://github.com/barrowsbr/meus-investimentos-dev/actions/workflows/historico.yml"
          target="_blank"
          rel="noopener noreferrer"
          title="Abre o workflow no GitHub — clique em 'Run workflow' para testar"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-700/50"
        >
          <ExternalLink size={13} /> Testar workflow (GitHub)
        </a>
        {reg && !reg.loading && (
          <span className={`text-xs ${reg.ok ? "text-emerald-400" : "text-amber-400"}`}>{reg.msg}</span>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-[11px] leading-relaxed text-zinc-500">
        <p className="mb-1 font-semibold text-zinc-400">Como a rotina roda</p>
        <p>
          Um GitHub Action (<code className="rounded bg-zinc-800/60 px-1 text-[10px] text-zinc-400">.github/workflows/historico.yml</code>)
          chama <code className="rounded bg-zinc-800/60 px-1 text-[10px] text-zinc-400">/api/cron/historico</code> às 10h, 14h e 18h (BRT), dias úteis.
          Não usa cron da Vercel porque o plano Hobby só permite 1×/dia.
        </p>
        <p className="mt-1.5">
          Para o Action funcionar, no GitHub: <span className="text-zinc-400">Settings → Secrets and variables → Actions</span> →
          adicione o <b>secret</b> <code className="rounded bg-zinc-800/60 px-1 text-[10px] text-zinc-400">CRON_SECRET</code> (mesmo valor da Vercel).
          Opcional: a <b>var</b> <code className="rounded bg-zinc-800/60 px-1 text-[10px] text-zinc-400">APP_URL</code> se o domínio mudar.
        </p>
        <p className="mt-1.5">
          <b>Registrar agora</b> grava um ponto na hora (não depende do GitHub). <b>Testar workflow</b> abre o
          Action no GitHub — lá clique em <span className="text-zinc-400">“Run workflow”</span> para rodar a rotina
          (precisa do secret acima configurado).
        </p>
      </div>
    </div>
  );
}
