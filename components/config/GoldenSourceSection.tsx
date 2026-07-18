"use client";

// Extraído de app/configuracoes/page.tsx — seção "Base de Cotações (Golden Source)"
// (status da db_cotacoes, anomalias, sync manual e rebuild da base).

import { useState, useEffect } from "react";
import {
  CheckCircle2, XCircle, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Database,
} from "lucide-react";
import { bumpDataVersion } from "@/lib/data-version";

// ── Golden Source (db_cotacoes) Section ──────────────────────────────────────

interface GsAnomaly { ticker: string; date: string; type: string; detail: string }
interface GsStatus { empty?: boolean; firstDate?: string; lastDate?: string; tickerCount?: number; dateCount?: number; points?: number; coverage?: number; tickers?: string[]; anomalies?: GsAnomaly[]; anomalyCount?: number }
interface GsResult { action: string; status: GsStatus; newPoints: number; weekendSkipped?: number; tickerErrors?: string[]; anomalies?: GsAnomaly[]; anomalyCount?: number }

interface RebuildResult {
  ok: boolean;
  dryRun?: boolean;
  tickers?: number;
  dates?: number;
  rawPoints?: number;
  acceptedPoints?: number;
  rejectedDates?: number;
  tickerErrors?: string[];
  firstDate?: string;
  lastDate?: string;
  message?: string;
}

export default function GoldenSourceSection() {
  const [status, setStatus] = useState<GsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<GsResult | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<RebuildResult | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [anomalies, setAnomalies] = useState<GsAnomaly[]>([]);
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [anomalyFilter, setAnomalyFilter] = useState<"todos" | "large_move" | "gap" | "negative">("todos");
  const [showAnomalies, setShowAnomalies] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/sync/cotacoes")
      .then(r => r.json())
      .then(d => {
        setStatus(d);
        setAnomalies(d.anomalies ?? []);
        setAnomalyCount(d.anomalyCount ?? 0);
      })
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync/cotacoes", { method: "POST" });
      const data = await res.json();
      setSyncResult(data);
      if (data.status) setStatus(data.status);
      if (data.anomalies) setAnomalies(data.anomalies);
      if (typeof data.anomalyCount === "number") setAnomalyCount(data.anomalyCount);
      bumpDataVersion();
    } catch {
      setSyncResult({ action: "error", status: {}, newPoints: 0, anomalies: [], anomalyCount: 0 });
    } finally {
      setSyncing(false);
    }
  }

  async function handleRebuild(dryRun: boolean) {
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const res = await fetch("/api/rebuild-cotacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookbackYears: 4, dryRun }),
      });
      const data = await res.json();
      setRebuildResult(data);
      if (!dryRun && data.ok) {
        setConfirmRebuild(false);
        bumpDataVersion();
        setStatus({
          empty: false,
          firstDate: data.firstDate,
          lastDate: data.lastDate,
          tickerCount: data.tickers,
          dateCount: data.dates,
          coverage: data.acceptedPoints && data.dates
            ? Math.round((data.acceptedPoints / (data.dates * data.tickers)) * 1000) / 10
            : undefined,
        });
      }
    } catch {
      setRebuildResult({ ok: false, message: "Erro de conexão" });
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-emerald-300">
            <p className="font-semibold mb-1">Atualização automática ativa</p>
            <p className="text-emerald-400/70">A base de cotações é atualizada automaticamente a cada login (1x/dia) e via Vercel Cron (dias úteis, 23h UTC). Nenhuma ação manual necessária.</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Aba <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">db_cotacoes</code> — preço bruto de fechamento. Fonte de verdade para performance/TWR.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500"><RefreshCw size={12} className="animate-spin" /> Carregando status...</div>
      ) : status?.empty !== false ? (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400">
          Base vazia — será populada no próximo login ou cron.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "Período", value: `${status.firstDate} → ${status.lastDate}` },
            { label: "Ativos", value: String(status.tickerCount ?? 0) },
            { label: "Datas", value: String(status.dateCount ?? 0) },
            { label: "Cobertura", value: `${status.coverage ?? 0}%` },
          ].map(s => (
            <div key={s.label} className="rounded-lg bg-zinc-800/40 px-3 py-2">
              <p className="text-[10px] text-zinc-600 uppercase">{s.label}</p>
              <p className="text-xs text-zinc-300 font-mono">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Anomalias detectadas na base atual */}
      {!loading && anomalyCount > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 overflow-hidden">
          <button
            onClick={() => setShowAnomalies(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-500/[0.04] transition-colors"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <AlertCircle size={14} />
              {anomalyCount} {anomalyCount === 1 ? "anomalia detectada" : "anomalias detectadas"} nos dados
            </span>
            {showAnomalies ? <ChevronUp size={14} className="text-amber-400/60" /> : <ChevronDown size={14} className="text-amber-400/60" />}
          </button>

          {showAnomalies && (
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-amber-500/15">
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Possíveis problemas nos preços puxados do Yahoo: saltos &gt;25% (split/bonificação ou erro),
                lacunas &gt;10 dias sem cotação, ou preços negativos. Revise antes de confiar na performance.
              </p>

              {/* Filtro por tipo */}
              <div className="flex flex-wrap gap-1 bg-zinc-900/60 rounded-lg p-0.5 w-fit">
                {([
                  { key: "todos", label: `Todos (${anomalies.length})` },
                  { key: "large_move", label: `Saltos (${anomalies.filter(a => a.type === "large_move").length})` },
                  { key: "gap", label: `Lacunas (${anomalies.filter(a => a.type === "gap").length})` },
                  { key: "negative", label: `Negativos (${anomalies.filter(a => a.type === "negative").length})` },
                ] as const).map(f => (
                  <button key={f.key} onClick={() => setAnomalyFilter(f.key)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      anomalyFilter === f.key ? "bg-amber-500/20 text-amber-200" : "text-zinc-500 hover:text-zinc-300"
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Tabela de anomalias */}
              <div className="overflow-x-auto rounded-lg border border-zinc-800 max-h-[320px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-zinc-800 bg-zinc-900/95 backdrop-blur">
                      <th className="text-left py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Tipo</th>
                      <th className="text-left py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Ticker</th>
                      <th className="text-left py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Data</th>
                      <th className="text-left py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies
                      .filter(a => anomalyFilter === "todos" || a.type === anomalyFilter)
                      .map((a, i) => {
                        const badge = a.type === "large_move"
                          ? { c: "bg-orange-500/10 text-orange-400", l: "Salto" }
                          : a.type === "gap"
                          ? { c: "bg-blue-500/10 text-blue-400", l: "Lacuna" }
                          : { c: "bg-red-500/10 text-red-400", l: "Negativo" };
                        return (
                          <tr key={i} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                            <td className="py-1.5 px-2.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.c}`}>{badge.l}</span>
                            </td>
                            <td className="py-1.5 px-2.5 font-semibold text-zinc-200">{a.ticker}</td>
                            <td className="py-1.5 px-2.5 text-zinc-400 font-mono">{a.date}</td>
                            <td className="py-1.5 px-2.5 text-zinc-500">{a.detail}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 pt-1">
        <button
          onClick={handleSync}
          disabled={syncing || rebuilding}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 transition-colors"
        >
          {syncing
            ? <><RefreshCw size={13} className="animate-spin" />Sincronizando...</>
            : <><RefreshCw size={13} />Atualizar cotações</>
          }
        </button>

        {!confirmRebuild ? (
          <button
            onClick={() => { setConfirmRebuild(true); setRebuildResult(null); }}
            disabled={syncing || rebuilding}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 disabled:opacity-40 transition-colors"
          >
            <Database size={13} />Reconstruir base do zero
          </button>
        ) : (
          <div className="flex-1 min-w-[280px] rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-red-300">
                <p className="font-semibold mb-1">Reconstruir base de cotações</p>
                <p className="text-red-400/70">
                  Faz backup da aba atual, apaga tudo, e rebusca 4 anos de histórico do Yahoo Finance.
                  Filtra weekends e feriados corrompidos automaticamente.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleRebuild(true)}
                disabled={rebuilding}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 disabled:opacity-40 transition-colors"
              >
                {rebuilding && rebuildResult === null
                  ? <><RefreshCw size={12} className="animate-spin" />Simulando...</>
                  : <><AlertCircle size={12} />Simular (dry run)</>
                }
              </button>

              <button
                onClick={() => handleRebuild(false)}
                disabled={rebuilding}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/25 disabled:opacity-40 transition-colors"
              >
                {rebuilding && rebuildResult?.dryRun !== true
                  ? <><RefreshCw size={12} className="animate-spin" />Reconstruindo...</>
                  : <><Database size={12} />Executar rebuild</>
                }
              </button>

              <button
                onClick={() => { setConfirmRebuild(false); setRebuildResult(null); }}
                disabled={rebuilding}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors"
              >
                Cancelar
              </button>
            </div>

            {/* Rebuild result */}
            {rebuildResult && (
              <div className={`rounded-lg px-3 py-2 text-xs ${
                rebuildResult.ok
                  ? rebuildResult.dryRun
                    ? "bg-amber-500/10 border border-amber-500/20 text-amber-300"
                    : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                  : "bg-red-500/10 border border-red-500/20 text-red-300"
              }`}>
                {!rebuildResult.ok ? (
                  <p className="flex items-center gap-1.5"><XCircle size={13} />{rebuildResult.message}</p>
                ) : rebuildResult.dryRun ? (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 font-semibold"><AlertCircle size={13} />Simulação — nada foi escrito</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                      <div><span className="text-zinc-500">Tickers:</span> <span className="font-mono">{rebuildResult.tickers}</span></div>
                      <div><span className="text-zinc-500">Datas:</span> <span className="font-mono">{rebuildResult.dates}</span></div>
                      <div><span className="text-zinc-500">Pontos:</span> <span className="font-mono">{rebuildResult.acceptedPoints?.toLocaleString()}</span></div>
                      <div><span className="text-zinc-500">Rejeitados:</span> <span className="font-mono">{rebuildResult.rejectedDates} datas</span></div>
                    </div>
                    {rebuildResult.tickerErrors && rebuildResult.tickerErrors.length > 0 && (
                      <p className="text-red-400 mt-1">Sem dados: {rebuildResult.tickerErrors.join(", ")}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 font-semibold"><CheckCircle2 size={13} />Base reconstruída com sucesso</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                      <div><span className="text-zinc-500">Tickers:</span> <span className="font-mono">{rebuildResult.tickers}</span></div>
                      <div><span className="text-zinc-500">Datas:</span> <span className="font-mono">{rebuildResult.dates}</span></div>
                      <div><span className="text-zinc-500">Pontos:</span> <span className="font-mono">{rebuildResult.acceptedPoints?.toLocaleString()}</span></div>
                      <div><span className="text-zinc-500">Período:</span> <span className="font-mono">{rebuildResult.firstDate} → {rebuildResult.lastDate}</span></div>
                    </div>
                    {rebuildResult.tickerErrors && rebuildResult.tickerErrors.length > 0 && (
                      <p className="text-amber-400 mt-1">Sem dados do Yahoo: {rebuildResult.tickerErrors.join(", ")}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className={`rounded-lg px-3 py-2 text-xs ${
          syncResult.action === "error"
            ? "bg-red-500/10 border border-red-500/20 text-red-300"
            : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
        }`}>
          {syncResult.action === "error" ? (
            <p className="flex items-center gap-1.5"><XCircle size={13} />Erro ao sincronizar</p>
          ) : (
            <p className="flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              Sincronização concluída — {syncResult.newPoints} pontos novos
              {syncResult.weekendSkipped ? `, ${syncResult.weekendSkipped} pontos de fim de semana ignorados` : ""}
              {syncResult.anomalyCount ? `, ${syncResult.anomalyCount} anomalias detectadas` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
