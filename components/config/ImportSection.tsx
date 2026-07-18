"use client";

// Extraído de app/configuracoes/page.tsx — seção "Importar Dados (IBKR / B3)"
// (upload de CSV idempotente com preview, filtro e verificação pós-escrita).

import { useState, useRef, useCallback } from "react";
import {
  Upload, CheckCircle2, XCircle, AlertCircle, FileText, RefreshCw, ArrowUpDown,
} from "lucide-react";
import { bumpDataVersion } from "@/lib/data-version";
import { API_URL } from "@/components/config/shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewItem {
  ticker: string;
  data: string;
  tipo: string;
  valor: string;
  moeda: string;
  corretora: string;
  categoria: "provento" | "trade" | "cambio";
  detalhe: string;
  status: "novo" | "existente" | "split";
}

interface ImportResult {
  source?: string;
  items?: PreviewItem[];
  resumo?: {
    proventos: { total: number; novos: number; existentes: number };
    trades: { total: number; novos: number; existentes: number };
    cambio?: { total: number; novos: number; existentes: number };
  };
  inserted?: { proventos: number; trades: number; cambio?: number };
  verificado?: boolean;
  verificacao?: Record<string, { ok: boolean; antes?: number; depois?: number; esperado?: number; detalhe?: string }>;
  error?: string;
  hint?: string;
}

// ── Unified Import Section ──────────────────────────────────────────────────

const STATUS_COLORS = {
  novo: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", label: "Novo" },
  existente: { bg: "bg-zinc-500/10", text: "text-zinc-500", border: "border-zinc-700", label: "Existente" },
  split: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", label: "Split?" },
};

const SOURCE_BADGE: Record<string, { color: string; label: string }> = {
  ibkr: { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "IBKR" },
  b3: { color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "B3" },
  desconhecido: { color: "text-zinc-400 bg-zinc-500/10 border-zinc-700", label: "?" },
};

export default function ImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<"todos" | "novo" | "existente">("todos");
  const [sortBy, setSortBy] = useState<"data" | "ticker">("data");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setResult(null); }
  }, []);

  async function handleSync(forceApply = false) {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", String(forceApply ? false : dryRun));

    try {
      const res = await fetch(`${API_URL}/api/sync/import`, { method: "POST", body: fd });
      const data = await res.json();
      setResult(data);
      if (forceApply) setDryRun(false);
      // Escrita real na planilha → invalida o CDN cache dos endpoints de leitura
      const aplicou = forceApply || !dryRun;
      if (res.ok && aplicou && !data.error) bumpDataVersion();
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Erro de conexão" });
    } finally {
      setLoading(false);
    }
  }

  const filtered = (result?.items ?? []).filter(item => {
    if (filter === "todos") return true;
    return item.status === filter;
  }).sort((a, b) => {
    if (sortBy === "data") return a.data.localeCompare(b.data);
    return a.ticker.localeCompare(b.ticker);
  });

  const resumo = result?.resumo;
  const source = result?.source;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Importe arquivos CSV do <strong className="text-zinc-400">IBKR</strong> ou da <strong className="text-zinc-400">B3</strong>.
        O sistema detecta automaticamente a origem e compara com os dados existentes na planilha —
        incluindo <strong className="text-zinc-400">operações</strong>, <strong className="text-zinc-400">proventos</strong> e <strong className="text-zinc-400">câmbio</strong> (forex).
        A importação é <strong className="text-zinc-400">idempotente</strong> — pode rodar múltiplas vezes sem duplicar dados.
      </p>

      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          file ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-500"
        }`}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <FileText size={18} />
            <span className="font-medium text-sm">{file.name}</span>
            <span className="text-xs text-zinc-500">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
        ) : (
          <div className="text-zinc-500">
            <Upload size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Arraste o arquivo ou clique para selecionar</p>
            <p className="text-xs mt-1 opacity-60">CSV do IBKR (PT/EN) · CSV/TXT da B3</p>
          </div>
        )}
      </div>

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
          onClick={() => handleSync()}
          disabled={!file || loading}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-40 ml-auto"
        >
          {loading
            ? <><RefreshCw size={14} className="animate-spin inline mr-1" />Processando...</>
            : <><Upload size={14} className="inline mr-1" />{dryRun ? "Simular" : "Importar"}</>
          }
        </button>
      </div>

      {/* Error */}
      {result?.error && (
        <div className="rounded-xl p-4 text-sm bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 flex items-center gap-2 mb-1"><XCircle size={15} />{result.error}</p>
          {result.hint && <p className="text-xs text-zinc-500 mt-1">{result.hint}</p>}
          {result.error.includes("SERVICE_ACCOUNT") && (
            <p className="text-xs text-zinc-500 mt-1">Configure <code className="bg-zinc-800 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code> nas env vars da Vercel.</p>
          )}
        </div>
      )}

      {/* Summary */}
      {resumo && source && (
        <div className="space-y-3">
          {/* Source + counts */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SOURCE_BADGE[source]?.color ?? SOURCE_BADGE.desconhecido.color}`}>
              {SOURCE_BADGE[source]?.label ?? source.toUpperCase()}
            </span>

            {resumo.proventos.total > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-500">Proventos:</span>
                <span className="text-emerald-400 font-semibold">{resumo.proventos.novos} novos</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">{resumo.proventos.existentes} existentes</span>
              </div>
            )}

            {resumo.trades.total > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-500">Operações:</span>
                <span className="text-emerald-400 font-semibold">{resumo.trades.novos} novas</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">{resumo.trades.existentes} existentes</span>
              </div>
            )}

            {resumo.cambio && resumo.cambio.total > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-500">Câmbio:</span>
                <span className="text-emerald-400 font-semibold">{resumo.cambio.novos} novos</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">{resumo.cambio.existentes} existentes</span>
              </div>
            )}
          </div>

          {/* Inserted confirmation + verificação pós-escrita na planilha */}
          {result?.inserted && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 size={14} />
                {result.inserted.proventos > 0 && <span>{result.inserted.proventos} proventos inseridos</span>}
                {result.inserted.proventos > 0 && (result.inserted.trades > 0 || (result.inserted.cambio ?? 0) > 0) && <span>·</span>}
                {result.inserted.trades > 0 && <span>{result.inserted.trades} operações inseridas</span>}
                {result.inserted.trades > 0 && (result.inserted.cambio ?? 0) > 0 && <span>·</span>}
                {(result.inserted.cambio ?? 0) > 0 && <span>{result.inserted.cambio} câmbios inseridos</span>}
                {result.inserted.proventos + result.inserted.trades + (result.inserted.cambio ?? 0) === 0 && <span>Nada novo a inserir</span>}
              </div>
              {result.verificacao && Object.entries(result.verificacao).map(([k, v]) => (
                <p key={k} className={`text-[11px] flex items-center gap-1 ${v.ok ? "text-emerald-500/80" : "text-red-400"}`}>
                  {v.ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                  {k === "proventos" ? "meus_proventos" : k === "cambio" ? "cambio" : "meus_ativos"}:{" "}
                  {v.ok
                    ? `verificado na planilha (${v.antes} → ${v.depois} linhas)`
                    : v.detalhe ?? `releitura não confirmou (esperado ${v.esperado}, encontrado ${v.depois})`}
                </p>
              ))}
            </div>
          )}

          {/* Dry run: aplicar direto, sem dança de toggle */}
          {dryRun && (resumo.proventos.novos + resumo.trades.novos + (resumo.cambio?.novos ?? 0)) > 0 && !result?.inserted && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <AlertCircle size={12} />
                Simulação — nada foi escrito na planilha ainda.
              </p>
              <button
                onClick={() => handleSync(true)}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25 transition-all disabled:opacity-40"
              >
                {loading ? "Aplicando…" : `Aplicar agora (${resumo.proventos.novos + resumo.trades.novos + (resumo.cambio?.novos ?? 0)} novos)`}
              </button>
            </div>
          )}

          {/* Filter + sort */}
          {(result?.items?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
                {(["todos", "novo", "existente"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      filter === f ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                    }`}>
                    {f === "todos" ? `Todos (${result?.items?.length})` : f === "novo" ? `Novos (${(result?.items ?? []).filter(i => i.status === "novo").length})` : `Existentes (${(result?.items ?? []).filter(i => i.status === "existente").length})`}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSortBy(s => s === "data" ? "ticker" : "data")}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <ArrowUpDown size={11} />
                {sortBy === "data" ? "Por data" : "Por ticker"}
              </button>
            </div>
          )}

          {/* Preview table */}
          {filtered.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-zinc-800 max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-zinc-800 bg-zinc-900/95 backdrop-blur">
                    <th className="text-left py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                    <th className="text-left py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Tipo</th>
                    <th className="text-left py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Ticker</th>
                    <th className="text-left py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Data</th>
                    <th className="text-left py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Detalhe</th>
                    <th className="text-right py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Valor</th>
                    <th className="text-center py-2 px-2.5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Moeda</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, i) => {
                    const st = STATUS_COLORS[item.status];
                    return (
                      <tr key={i} className={`border-b border-zinc-900 ${item.status === "novo" ? "bg-emerald-500/[0.02]" : ""} hover:bg-white/[0.02]`}>
                        <td className="py-1.5 px-2.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${st.bg} ${st.text} ${st.border}`}>
                            {item.status === "novo" ? <CheckCircle2 size={9} /> : item.status === "split" ? <AlertCircle size={9} /> : null}
                            {st.label}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            item.categoria === "trade"
                              ? item.tipo === "Compra" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"
                              : item.categoria === "cambio"
                                ? "bg-cyan-500/10 text-cyan-400"
                                : "bg-violet-500/10 text-violet-400"
                          }`}>
                            {item.tipo}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 font-semibold text-zinc-200">{item.ticker}</td>
                        <td className="py-1.5 px-2.5 text-zinc-400 font-mono">{item.data}</td>
                        <td className="py-1.5 px-2.5 text-zinc-500">{item.detalhe}</td>
                        <td className="py-1.5 px-2.5 text-right text-zinc-300 font-mono">{item.valor}</td>
                        <td className="py-1.5 px-2.5 text-center text-zinc-500">{item.moeda}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
