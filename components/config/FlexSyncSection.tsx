"use client";

// Extraído de app/configuracoes/page.tsx — seção "Sincronizar IBKR (API · sem arquivo)"
// (Flex Web Service: trades, proventos, câmbio e reconciliação de valores).

import { useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { bumpDataVersion } from "@/lib/data-version";
import { API_URL } from "@/components/config/shared";

// ── IBKR Flex Sync (API, sem arquivo) ───────────────────────────────────────

interface FlexTradeRow {
  Data: string;
  "Tipo de transação": string;
  "Símbolo": string;
  Quantidade: string;
  "Preço": string;
  Moeda: string;
  status_match?: string;
}
interface FlexProventoRow {
  ticker: string;
  data: string;
  decisao: string;
  valor: string;
  moeda: string;
}
interface FlexCambioRow {
  data: string;
  moeda_origem: string;
  moeda_destino: string;
  valor_origem: string;
  valor_destino: string;
  taxa: string;
}
interface FlexResult {
  error?: string;
  source?: string;
  dry_run?: boolean;
  parsed?: { proventos: number; trades: number; cambio?: number; positions: number; proventos_duplicados_removidos?: number };
  proventos?: { total: number; faltantes: number; inserted?: number; preview?: FlexProventoRow[] };
  trades?: { total: number; existing_count?: number; faltantes: number; potential_splits?: number; inserted?: number; preview?: FlexTradeRow[] };
  cambio?: { total: number; faltantes: number; inserted?: number; preview?: FlexCambioRow[] };
}

interface ReconResult {
  error?: string;
  dry_run?: boolean;
  divergencias: number;
  corrigidas?: number;
  detalhes: Array<{ ticker: string; data: string; tipo: string; de: string; para: string }>;
}

export default function FlexSyncSection() {
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FlexResult | null>(null);

  async function run(forceApply = false) {
    const simular = forceApply ? false : dryRun;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/sync/ibkr/flex?dry_run=${simular}`);
      // Erros de plataforma (timeout da Vercel etc.) vêm em TEXTO puro — parse
      // tolerante para nunca explodir com "Unexpected token … is not valid JSON".
      const raw = await res.text();
      let data: FlexResult;
      try { data = JSON.parse(raw); } catch {
        data = { error: `O servidor respondeu ${res.status} sem JSON (provável timeout do Flex) — tente de novo em ~1 min: ${raw.slice(0, 90)}` };
      }
      setResult(data);
      if (forceApply) setDryRun(false);
      // Escrita real → invalida o CDN cache dos endpoints de leitura.
      if (res.ok && !simular && !data.error) bumpDataVersion();
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Erro de conexão" });
    } finally {
      setLoading(false);
    }
  }

  const [reconLoading, setReconLoading] = useState(false);
  const [recon, setRecon] = useState<ReconResult | null>(null);

  async function reconcile(apply = false) {
    setReconLoading(true);
    setRecon(null);
    try {
      const res = await fetch(`${API_URL}/api/sync/ibkr/reconcile?dry_run=${!apply}`);
      const rawRecon = await res.text();
      let data: ReconResult;
      try { data = JSON.parse(rawRecon); } catch {
        data = { error: `O servidor respondeu ${res.status} sem JSON (provável timeout) — tente de novo: ${rawRecon.slice(0, 90)}`, divergencias: 0, detalhes: [] };
      }
      setRecon(data);
      if (apply && res.ok && !data.error) bumpDataVersion();
    } catch (e) {
      setRecon({ error: e instanceof Error ? e.message : "Erro de conexão", divergencias: 0, detalhes: [] });
    } finally {
      setReconLoading(false);
    }
  }

  const faltantes = (result?.proventos?.faltantes ?? 0) + (result?.trades?.faltantes ?? 0) + (result?.cambio?.faltantes ?? 0);
  const inseridos = (result?.proventos?.inserted ?? 0) + (result?.trades?.inserted ?? 0) + (result?.cambio?.inserted ?? 0);
  const tradeRows = result?.trades?.preview ?? [];
  const provRows = result?.proventos?.preview ?? [];
  const cambioRows = result?.cambio?.preview ?? [];

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Busca trades e proventos direto da <strong className="text-zinc-400">IBKR via Flex Web Service</strong> (sem precisar de arquivo).
        Compara com a planilha e mostra o que falta — <strong className="text-zinc-400">idempotente</strong>, pode rodar quantas vezes quiser.
        Roda sozinho todo dia (cron), mas use o botão para conferir/validar o fluxo manualmente.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${dryRun ? "bg-amber-500" : "bg-emerald-500"}`}
            onClick={() => setDryRun(v => !v)}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${dryRun ? "left-0.5" : "left-4"}`} />
          </div>
          <span className="text-xs text-zinc-400">{dryRun ? "Simular (não escreve)" : "Aplicar em produção"}</span>
        </label>

        <button
          onClick={() => run()}
          disabled={loading}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-40 ml-auto"
        >
          {loading
            ? <><RefreshCw size={14} className="animate-spin inline mr-1" />Conferindo…</>
            : <><RefreshCw size={14} className="inline mr-1" />{dryRun ? "Conferir IBKR" : "Sincronizar IBKR"}</>
          }
        </button>
      </div>

      {result?.error && (
        <div className="rounded-xl p-4 text-sm bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 flex items-center gap-2"><XCircle size={15} />{result.error}</p>
          {result.error.includes("não configurados") && (
            <p className="text-xs text-zinc-500 mt-1">Defina <code className="bg-zinc-800 px-1 rounded">IBKR_FLEX_TOKEN</code> e <code className="bg-zinc-800 px-1 rounded">IBKR_FLEX_QUERY_ID</code> nas env vars.</p>
          )}
        </div>
      )}

      {result && !result.error && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-red-400 bg-red-500/10 border-red-500/20">IBKR · API</span>
            {result.dry_run && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-amber-400 bg-amber-500/10 border-amber-500/20">Simulação</span>}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-zinc-500">Lidos:</span>
              <span className="text-zinc-300 font-semibold">{result.parsed?.trades ?? 0} trades</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-300 font-semibold">{result.parsed?.proventos ?? 0} proventos</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-300 font-semibold">{result.parsed?.cambio ?? 0} câmbios</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-300 font-semibold">{result.parsed?.positions ?? 0} posições</span>
            </div>
            {(result.parsed?.proventos_duplicados_removidos ?? 0) > 0 && (
              <span className="text-[10px] text-amber-400/80" title="A query Flex da IBKR emitiu cada lançamento em dobro; as cópias idênticas foram ignoradas.">
                {result.parsed?.proventos_duplicados_removidos} duplicatas da IBKR ignoradas
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="text-zinc-500">Faltando na planilha:</span>
            <span className="text-emerald-400 font-semibold">{result.trades?.faltantes ?? 0} operações</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400 font-semibold">{result.proventos?.faltantes ?? 0} proventos</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400 font-semibold">{result.cambio?.faltantes ?? 0} câmbios</span>
            {(result.trades?.potential_splits ?? 0) > 0 && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-amber-400 font-semibold">{result.trades?.potential_splits} possíveis splits</span>
              </>
            )}
          </div>

          {/* Tabela: operações a considerar */}
          {tradeRows.length > 0 && (
            <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">
                Operações a considerar ({tradeRows.length})
              </h4>
              <div className="overflow-auto rounded-lg border border-zinc-800" style={{ maxHeight: 280 }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-zinc-500">
                      <th className="px-2 py-1.5 text-left font-semibold">Data</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Tipo</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Símbolo</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Qtd</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Preço</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Moeda</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeRows.map((t, i) => {
                      const isSplit = t.status_match === "split";
                      return (
                        <tr key={i} className="border-t border-zinc-800/60">
                          <td className="px-2 py-1 font-mono text-zinc-400">{t.Data}</td>
                          <td className={`px-2 py-1 font-semibold ${t["Tipo de transação"] === "Compra" ? "text-emerald-400" : "text-red-400"}`}>{t["Tipo de transação"]}</td>
                          <td className="px-2 py-1 text-zinc-300">{t["Símbolo"]}</td>
                          <td className="px-2 py-1 text-right font-mono text-zinc-400">{t.Quantidade}</td>
                          <td className="px-2 py-1 text-right text-zinc-400">{t["Preço"]}</td>
                          <td className="px-2 py-1 text-zinc-500">{t.Moeda}</td>
                          <td className="px-2 py-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSplit ? "text-amber-400 bg-amber-500/10" : "text-emerald-400 bg-emerald-500/10"}`}>
                              {isSplit ? "Split?" : "Novo"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabela: proventos a considerar */}
          {provRows.length > 0 && (
            <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">
                Proventos a considerar ({provRows.length})
              </h4>
              <div className="overflow-auto rounded-lg border border-zinc-800" style={{ maxHeight: 280 }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-zinc-500">
                      <th className="px-2 py-1.5 text-left font-semibold">Data</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Ticker</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Tipo</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Valor</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Moeda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provRows.map((p, i) => {
                      const imposto = p.decisao === "IMPOSTO";
                      return (
                        <tr key={i} className="border-t border-zinc-800/60">
                          <td className="px-2 py-1 font-mono text-zinc-400">{p.data}</td>
                          <td className="px-2 py-1 text-zinc-300">{p.ticker}</td>
                          <td className={`px-2 py-1 font-semibold ${imposto ? "text-red-400" : "text-emerald-400"}`}>{imposto ? "Imposto" : "Dividendo"}</td>
                          <td className="px-2 py-1 text-right font-mono text-zinc-400">{p.valor}</td>
                          <td className="px-2 py-1 text-zinc-500">{p.moeda}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabela: câmbio a considerar */}
          {cambioRows.length > 0 && (
            <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">
                Câmbio a considerar ({cambioRows.length})
              </h4>
              <div className="overflow-auto rounded-lg border border-zinc-800" style={{ maxHeight: 280 }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-zinc-500">
                      <th className="px-2 py-1.5 text-left font-semibold">Data</th>
                      <th className="px-2 py-1.5 text-left font-semibold">De → Para</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Origem</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Destino</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cambioRows.map((c, i) => (
                      <tr key={i} className="border-t border-zinc-800/60">
                        <td className="px-2 py-1 font-mono text-zinc-400">{c.data}</td>
                        <td className="px-2 py-1 text-zinc-300">{c.moeda_origem} → {c.moeda_destino}</td>
                        <td className="px-2 py-1 text-right font-mono text-zinc-400">{c.valor_origem}</td>
                        <td className="px-2 py-1 text-right font-mono text-zinc-400">{c.valor_destino}</td>
                        <td className="px-2 py-1 text-right text-zinc-500">{c.taxa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {inseridos > 0 && (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 size={14} />
              <span>{result.trades?.inserted ?? 0} operações e {result.proventos?.inserted ?? 0} proventos inseridos na planilha</span>
            </div>
          )}

          {result.dry_run && faltantes > 0 && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <AlertCircle size={12} />
                Simulação — nada foi escrito ainda.
              </p>
              <button
                onClick={() => run(true)}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25 transition-all disabled:opacity-40"
              >
                {loading ? "Aplicando…" : `Aplicar agora (${faltantes} novos)`}
              </button>
            </div>
          )}

          {result.dry_run && faltantes === 0 && (
            <p className="text-xs text-emerald-500/80 flex items-center gap-1"><CheckCircle2 size={12} />Tudo já está na planilha — nada a inserir.</p>
          )}
        </div>
      )}

      {/* Reconciliação de valores divergentes (manual, fora do cron) */}
      <div className="pt-3" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="text-xs text-zinc-500 leading-relaxed mb-2">
          <strong className="text-zinc-400">Reconciliar valores:</strong> quando a IBKR revisa um provento/imposto que já está na planilha (mesma data+ticker+tipo), corrige a planilha com o valor da IBKR (preserva o sinal; faz backup). Verifique antes de aplicar.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => reconcile(false)}
            disabled={reconLoading}
            className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            {reconLoading ? "Verificando…" : "Verificar valores divergentes"}
          </button>
          {recon && !recon.error && recon.dry_run && recon.divergencias > 0 && (
            <button
              onClick={() => reconcile(true)}
              disabled={reconLoading}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/25 transition-all disabled:opacity-40"
            >
              {reconLoading ? "Corrigindo…" : `Corrigir ${recon.divergencias} valores`}
            </button>
          )}
        </div>

        {recon?.error && (
          <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><XCircle size={12} />{recon.error}</p>
        )}
        {recon && !recon.error && (recon.corrigidas ?? 0) > 0 && (
          <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1"><CheckCircle2 size={12} />{recon.corrigidas} valores corrigidos na planilha.</p>
        )}
        {recon && !recon.error && recon.dry_run && recon.divergencias === 0 && (
          <p className="text-xs text-emerald-500/80 mt-2 flex items-center gap-1"><CheckCircle2 size={12} />Nenhuma divergência — a planilha bate com a IBKR.</p>
        )}
        {recon && !recon.error && recon.dry_run && recon.divergencias > 0 && (
          <div className="mt-2 overflow-auto rounded-lg border border-zinc-800" style={{ maxHeight: 280 }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="text-zinc-500">
                  <th className="px-2 py-1.5 text-left font-semibold">Data</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Ticker</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Tipo</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Planilha</th>
                  <th className="px-2 py-1.5 text-right font-semibold">→ IBKR</th>
                </tr>
              </thead>
              <tbody>
                {recon.detalhes.map((d, i) => (
                  <tr key={i} className="border-t border-zinc-800/60">
                    <td className="px-2 py-1 font-mono text-zinc-400">{d.data}</td>
                    <td className="px-2 py-1 text-zinc-300">{d.ticker}</td>
                    <td className={`px-2 py-1 font-semibold ${d.tipo === "Imposto" ? "text-red-400" : "text-emerald-400"}`}>{d.tipo}</td>
                    <td className="px-2 py-1 text-right font-mono text-zinc-500">{d.de}</td>
                    <td className="px-2 py-1 text-right font-mono text-amber-300">{d.para}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
