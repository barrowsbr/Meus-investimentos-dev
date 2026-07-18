"use client";

// Extraído de app/configuracoes/page.tsx — seção "Tickers × Yahoo (Verificador)"
// (audita a grafia dos símbolos contra o Yahoo e corrige com um clique).

import { useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { bumpDataVersion } from "@/lib/data-version";
import { API_URL } from "@/components/config/shared";

// ── Ticker Audit Section (grafia Yahoo) ─────────────────────────────────────

interface TickerAuditResult {
  error?: string;
  total?: number;
  ok?: number;
  ajustes?: { ticker: string; sugestao: string; nome: string; exchange: string; ocorrencias: { ativos: number; proventos: number } }[];
  desconhecidos?: { ticker: string; ocorrencias: { ativos: number; proventos: number } }[];
  ignorados?: string[];
}

export default function TickerAuditSection() {
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<TickerAuditResult | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, string>>({});

  async function run() {
    setLoading(true);
    setAudit(null);
    setApplied({});
    try {
      const res = await fetch(`${API_URL}/api/sync/tickers`);
      setAudit(await res.json());
    } catch (e) {
      setAudit({ error: e instanceof Error ? e.message : "Erro de conexão" });
    } finally {
      setLoading(false);
    }
  }

  async function fix(de: string, para: string) {
    setApplying(de);
    try {
      const res = await fetch(`${API_URL}/api/sync/tickers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ de, para }),
      });
      const data = await res.json();
      if (data?.ok) {
        const n = (data.atualizados?.meus_ativos ?? 0) + (data.atualizados?.meus_proventos ?? 0);
        setApplied(prev => ({ ...prev, [de]: `✓ ${n} linha${n === 1 ? "" : "s"} corrigida${n === 1 ? "" : "s"} → ${data.ticker}` }));
        bumpDataVersion();
      } else {
        setApplied(prev => ({ ...prev, [de]: `✕ ${data?.error ?? "falha"}` }));
      }
    } catch (e) {
      setApplied(prev => ({ ...prev, [de]: `✕ ${e instanceof Error ? e.message : "erro"}` }));
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Confere se cada ticker de <strong className="text-zinc-400">meus_ativos</strong> e{" "}
        <strong className="text-zinc-400">meus_proventos</strong> está na <strong className="text-zinc-400">grafia exata que o
        Yahoo Finance resolve</strong> — B3 com .SA (CMIG4.SA, VALE3.SA), internacionais com o sufixo da bolsa (DPM.TO, VOW3.DE)
        e EUA sem sufixo (AAPL). Os sincronizadores (arquivo, API e cron) já validam antes de gravar; aqui você audita o
        histórico e corrige conflitos com um clique (correção cirúrgica, com backup automático).
      </p>

      <button onClick={run} disabled={loading} className="btn-primary text-sm px-4 py-2 disabled:opacity-40">
        {loading
          ? <><RefreshCw size={14} className="animate-spin inline mr-1" />Auditando tickers no Yahoo…</>
          : <><CheckCircle2 size={14} className="inline mr-1" />Verificar tickers</>
        }
      </button>

      {audit?.error && (
        <div className="rounded-xl p-4 text-sm bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 flex items-center gap-2"><XCircle size={15} />{audit.error}</p>
        </div>
      )}

      {audit && !audit.error && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
              {audit.ok ?? 0} ok
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${(audit.ajustes?.length ?? 0) > 0 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-zinc-500 bg-zinc-500/10 border-zinc-500/20"}`}>
              {audit.ajustes?.length ?? 0} ajustes sugeridos
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${(audit.desconhecidos?.length ?? 0) > 0 ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-zinc-500 bg-zinc-500/10 border-zinc-500/20"}`}>
              {audit.desconhecidos?.length ?? 0} não encontrados
            </span>
            {(audit.ignorados?.length ?? 0) > 0 && (
              <span className="text-[10px] text-zinc-600" title={audit.ignorados?.join(", ")}>
                {audit.ignorados?.length} nomes livres ignorados (RF/caixa)
              </span>
            )}
          </div>

          {(audit.ajustes?.length ?? 0) > 0 && (
            <div className="space-y-2">
              {audit.ajustes!.map(a => (
                <div key={a.ticker} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 bg-amber-500/5 border border-amber-500/15">
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-bold text-zinc-200">
                      {a.ticker} <span className="text-zinc-500">→</span> <span className="text-amber-300">{a.sugestao}</span>
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {a.nome}{a.exchange ? ` · ${a.exchange}` : ""} · {a.ocorrencias.ativos} operação(ões), {a.ocorrencias.proventos} provento(s)
                    </p>
                  </div>
                  <div className="ml-auto">
                    {applied[a.ticker] ? (
                      <span className={`text-xs font-semibold ${applied[a.ticker].startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>
                        {applied[a.ticker]}
                      </span>
                    ) : (
                      <button
                        onClick={() => fix(a.ticker, a.sugestao)}
                        disabled={applying !== null}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
                      >
                        {applying === a.ticker
                          ? <><RefreshCw size={11} className="animate-spin inline mr-1" />Corrigindo…</>
                          : `Corrigir → ${a.sugestao}`}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(audit.desconhecidos?.length ?? 0) > 0 && (
            <div className="rounded-lg px-3 py-2 bg-red-500/5 border border-red-500/15">
              <p className="text-xs text-red-300 font-semibold mb-1 flex items-center gap-1.5">
                <AlertCircle size={13} />Não encontrados no Yahoo (verifique manualmente):
              </p>
              <p className="text-xs font-mono text-zinc-400">
                {audit.desconhecidos!.map(d => d.ticker).join(" · ")}
              </p>
            </div>
          )}

          {(audit.ajustes?.length ?? 0) === 0 && (audit.desconhecidos?.length ?? 0) === 0 && (
            <p className="text-sm text-emerald-400 flex items-center gap-2">
              <CheckCircle2 size={15} />Todos os {audit.ok} tickers estão na grafia Yahoo correta.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
