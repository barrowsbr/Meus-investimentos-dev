"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Settings, Lock, Upload, CheckCircle2, XCircle, AlertCircle,
  FileText, RefreshCw, Shield, Info, ImageIcon, Check,
  ChevronDown, ChevronUp, ArrowUpDown, Database,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { bumpDataVersion } from "@/lib/data-version";
import { getBackgroundImage, setBackgroundImage } from "@/components/AppBackground";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewItem {
  ticker: string;
  data: string;
  tipo: string;
  valor: string;
  moeda: string;
  corretora: string;
  categoria: "provento" | "trade";
  detalhe: string;
  status: "novo" | "existente" | "split";
}

interface ImportResult {
  source?: string;
  items?: PreviewItem[];
  resumo?: {
    proventos: { total: number; novos: number; existentes: number };
    trades: { total: number; novos: number; existentes: number };
  };
  inserted?: { proventos: number; trades: number };
  verificado?: boolean;
  verificacao?: Record<string, { ok: boolean; antes?: number; depois?: number; esperado?: number; detalhe?: string }>;
  error?: string;
  hint?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card overflow-hidden mb-4">
      <button
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-zinc-400">{icon}</span>
          <span className="font-semibold text-zinc-200 text-sm">{title}</span>
        </div>
        {open ? <ChevronUp size={15} className="text-zinc-500" /> : <ChevronDown size={15} className="text-zinc-500" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-zinc-800/50 pt-4">{children}</div>}
    </div>
  );
}

// ── Password Section ──────────────────────────────────────────────────────────

function PasswordSection() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        A autenticação usa as chaves <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">usuario</code> e{" "}
        <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">senha</code> na aba{" "}
        <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">config</code> da planilha Google Sheets.
        Caso não existam, usa a variável <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">APP_PASSWORD</code> da Vercel como fallback.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg bg-zinc-800/40 px-4 py-3">
          <p className="text-[10px] text-zinc-500 uppercase font-semibold mb-1">Como alterar</p>
          <p className="text-xs text-zinc-300">Edite a aba <code className="bg-zinc-800 px-1 rounded">config</code> na planilha — coluna A = chave, coluna B = valor.</p>
        </div>
        <div className="rounded-lg bg-zinc-800/40 px-4 py-3">
          <p className="text-[10px] text-zinc-500 uppercase font-semibold mb-1">Fallback</p>
          <p className="text-xs text-zinc-300">Variável <code className="bg-zinc-800 px-1 rounded">APP_PASSWORD</code> na Vercel. Usada quando a planilha não tem as chaves.</p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-zinc-500 leading-relaxed">
        <Shield size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
        <p>A validação é feita via <code className="bg-zinc-800 px-1 rounded text-zinc-300">/api/auth/validate</code>. A senha não é armazenada no frontend.</p>
      </div>
    </div>
  );
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

function ImportSection() {
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
        O sistema detecta automaticamente a origem e compara com os dados existentes na planilha.
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
          </div>

          {/* Inserted confirmation + verificação pós-escrita na planilha */}
          {result?.inserted && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 size={14} />
                {result.inserted.proventos > 0 && <span>{result.inserted.proventos} proventos inseridos</span>}
                {result.inserted.proventos > 0 && result.inserted.trades > 0 && <span>·</span>}
                {result.inserted.trades > 0 && <span>{result.inserted.trades} operações inseridas</span>}
                {result.inserted.proventos + result.inserted.trades === 0 && <span>Nada novo a inserir</span>}
              </div>
              {result.verificacao && Object.entries(result.verificacao).map(([k, v]) => (
                <p key={k} className={`text-[11px] flex items-center gap-1 ${v.ok ? "text-emerald-500/80" : "text-red-400"}`}>
                  {v.ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                  {k === "proventos" ? "meus_proventos" : "meus_ativos"}:{" "}
                  {v.ok
                    ? `verificado na planilha (${v.antes} → ${v.depois} linhas)`
                    : v.detalhe ?? `releitura não confirmou (esperado ${v.esperado}, encontrado ${v.depois})`}
                </p>
              ))}
            </div>
          )}

          {/* Dry run: aplicar direto, sem dança de toggle */}
          {dryRun && (resumo.proventos.novos + resumo.trades.novos) > 0 && !result?.inserted && (
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
                {loading ? "Aplicando…" : `Aplicar agora (${resumo.proventos.novos + resumo.trades.novos} novos)`}
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

// ── Environment Variables Section ─────────────────────────────────────────────

function EnvSection() {
  const vars = [
    { key: "SPREADSHEET_ID",              desc: "ID da planilha Google Sheets (gdados)",           required: true },
    { key: "GOOGLE_API_KEY",              desc: "API Key Google — leitura da planilha",             required: true },
    { key: "GOOGLE_SERVICE_ACCOUNT_JSON", desc: "Service Account JSON — escrita, sync e import",    required: true },
    { key: "CRON_SECRET",                 desc: "Token para autenticação dos Vercel Crons",         required: true },
    { key: "APP_PASSWORD",                desc: "Senha fallback (se planilha não tiver config)",     required: false },
    { key: "GEMINI_API_KEY",              desc: "Google Gemini — Agente IA (tier 1)",               required: false },
    { key: "OPENAI_API_KEY",              desc: "OpenAI GPT-4o — Agente IA (fallback tier 1)",     required: false },
    { key: "DEEPSEEK_API_KEY",            desc: "DeepSeek V3 — Agente IA (fallback tier 2)",       required: false },
    { key: "GROQ_API_KEY",               desc: "Groq/Llama — Agente IA (fallback tier 3, free)",  required: false },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">Configure no painel da Vercel em <strong className="text-zinc-400">Settings &rarr; Environment Variables</strong>.</p>
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/40">
              <th className="text-left py-2 px-3 text-zinc-500 font-semibold uppercase tracking-wider">Variável</th>
              <th className="text-left py-2 px-3 text-zinc-500 font-semibold uppercase tracking-wider hidden md:table-cell">Descrição</th>
              <th className="text-center py-2 px-3 text-zinc-500 font-semibold uppercase tracking-wider">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {vars.map((v, i) => (
              <tr key={v.key} className={`border-b border-zinc-900 ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                <td className="py-2 px-3">
                  <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-200 font-mono text-[11px]">{v.key}</code>
                </td>
                <td className="py-2 px-3 text-zinc-400 hidden md:table-cell">{v.desc}</td>
                <td className="py-2 px-3 text-center">
                  {v.required
                    ? <span className="text-amber-400 text-[10px] font-semibold">Obrigatória</span>
                    : <span className="text-zinc-600 text-[10px]">Opcional</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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

function GoldenSourceSection() {
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

// ── Background Section ───────────────────────────────────────────────────────

const BG_OPTIONS = [
  { label: "Circuito", path: "/midias/home-bg.jpeg" },
  { label: "Vórtex", path: "/midias/bg-vortex.jpeg" },
  { label: "Equações", path: "/midias/bg-equations.jpeg" },
  { label: "Cassette", path: "/midias/bg-cassette.jpeg" },
  { label: "Blueprint", path: "/midias/bg-blueprint.jpeg" },
  { label: "Equações 2", path: "/midias/bg-equations2.jpeg" },
  { label: "Motherboard", path: "/midias/bg-motherboard.jpeg" },
  { label: "Nenhum", path: "" },
];

function BackgroundSection() {
  const [current, setCurrent] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    setCurrent(getBackgroundImage());
  }, []);

  function select(path: string) {
    setBackgroundImage(path);
    setCurrent(path);
  }

  function handleCustom() {
    const path = custom.trim();
    if (!path) return;
    const full = path.startsWith("/") ? path : `/midias/${path}`;
    select(full);
    setCustom("");
  }

  const isCustom = current && !BG_OPTIONS.some(o => o.path === current);

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Imagem de fundo em todas as páginas. Persiste na planilha Google Sheets — não se perde ao limpar cache.
      </p>

      <div className="flex flex-wrap gap-3">
        {BG_OPTIONS.map(opt => {
          const active = current === opt.path;
          return (
            <button key={opt.label} onClick={() => select(opt.path)}
              className="relative rounded-xl overflow-hidden transition-all hover:scale-[1.02]"
              style={{ width: 120, height: 80, border: active ? "2px solid #E8A33D" : "2px solid rgba(255,255,255,0.08)", boxShadow: active ? "0 0 12px rgba(232,163,61,0.2)" : "none" }}>
              {opt.path ? (
                <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${opt.path}')`, filter: "brightness(0.5)" }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-900"><span className="text-[10px] text-zinc-600">Sem fundo</span></div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center gap-1">
                {active && <Check size={10} className="text-amber-400" />}
                <span className={`text-[10px] font-semibold ${active ? "text-amber-400" : "text-zinc-400"}`}>{opt.label}</span>
              </div>
            </button>
          );
        })}
        {isCustom && (
          <div className="relative rounded-xl overflow-hidden" style={{ width: 120, height: 80, border: "2px solid #E8A33D", boxShadow: "0 0 12px rgba(232,163,61,0.2)" }}>
            <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${current}')`, filter: "brightness(0.5)" }} />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center gap-1">
              <Check size={10} className="text-amber-400" /><span className="text-[10px] font-semibold text-amber-400 truncate">Custom</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input type="text" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCustom()}
          placeholder="nome-do-arquivo.jpg"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
        <button onClick={handleCustom} disabled={!custom.trim()}
          className="px-3 py-2 text-xs rounded-lg font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 transition-colors">Aplicar</button>
      </div>
      <p className="text-[10px] text-zinc-600">Caminho em <code className="bg-zinc-800 px-1 rounded">public/midias/</code> ou absoluto com <code className="bg-zinc-800 px-1 rounded">/</code>.</p>
    </div>
  );
}

export default function ConfiguracoesPage() {
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Gerencie senha de acesso, importação de dados e variáveis de ambiente."
      />

      <div className="max-w-4xl">
        <SectionCard title="Segurança — Senha de Acesso" icon={<Lock size={16} />}>
          <PasswordSection />
        </SectionCard>

        <SectionCard title="Fundo do Painel" icon={<ImageIcon size={16} />}>
          <BackgroundSection />
        </SectionCard>

        <SectionCard title="Base de Cotações (Golden Source)" icon={<Database size={16} />}>
          <GoldenSourceSection />
        </SectionCard>

        <SectionCard title="Importar Dados (IBKR / B3)" icon={<Upload size={16} />}>
          <ImportSection />
        </SectionCard>

        <SectionCard title="Variáveis de Ambiente" icon={<Settings size={16} />}>
          <EnvSection />
        </SectionCard>

        <SectionCard title="Sobre o Sistema" icon={<Info size={16} />}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: "Framework", value: "Next.js 14 (App Router)" },
                { label: "Estilo", value: "Tailwind CSS 3" },
                { label: "Gráficos", value: "Recharts + lightweight-charts" },
                { label: "Dados", value: "Google Sheets API" },
                { label: "Deploy", value: "Vercel (auto)" },
                { label: "IA", value: "Gemini / GPT-4o / DeepSeek" },
                { label: "3D Globe", value: "React Three Fiber" },
                { label: "Mapas", value: "react-simple-maps" },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-zinc-800/40 px-3 py-2">
                  <p className="text-[10px] text-zinc-600 uppercase">{s.label}</p>
                  <p className="text-xs text-zinc-300">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-blue-500/8 border border-blue-500/15 px-4 py-3">
              <p className="text-xs text-blue-300 font-semibold mb-1">Motor de cálculo canônico</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                TypeScript é o <strong className="text-zinc-300">único motor de portfólio</strong>. Toda matemática de patrimônio, investido (FIFO), lucro, proventos e câmbio vive em{" "}
                <code className="bg-zinc-800 px-1 rounded text-zinc-300">lib/portfolio.ts</code> (<code className="bg-zinc-800 px-1 rounded text-zinc-300">calcularSnapshot</code>).
                Python serve apenas preditivo/ML e agente IA.
              </p>
            </div>

            <div className="space-y-2 text-xs text-zinc-500 leading-relaxed">
              <div className="flex items-start gap-2">
                <Shield size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                <p>Leitura via API Key. Escrita/sync requer Service Account com permissão de Editora na planilha.</p>
              </div>
              <div className="flex items-start gap-2">
                <FileText size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                <p>Importações idempotentes — sem risco de duplicatas. Detecta automaticamente IBKR ou B3.</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
