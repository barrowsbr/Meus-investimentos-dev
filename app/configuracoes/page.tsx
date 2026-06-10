"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Lock, Upload, CheckCircle2, XCircle, AlertCircle,
  FileText, RefreshCw,
  Shield, Info, ImageIcon, Check,
  ChevronDown, ChevronUp, ArrowUpDown, Database,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
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
    <div className="space-y-3 text-xs text-zinc-500 leading-relaxed">
      <p>
        As credenciais de acesso são lidas da aba{" "}
        <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">config</code> da planilha Google Sheets.
      </p>
      <div className="rounded-lg bg-zinc-800/40 px-3 py-2.5 space-y-1.5">
        <p className="text-zinc-400 font-medium">Formato esperado na aba <code className="bg-zinc-800 px-1 rounded text-zinc-300">config</code>:</p>
        <table className="text-[11px] font-mono">
          <thead><tr><th className="pr-6 text-left text-zinc-600">chave</th><th className="text-left text-zinc-600">valor</th></tr></thead>
          <tbody>
            <tr><td className="pr-6 text-zinc-400">usuario</td><td className="text-zinc-300">LBF</td></tr>
            <tr><td className="pr-6 text-zinc-400">senha</td><td className="text-zinc-300">1015</td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-zinc-600">Para alterar a senha, edite diretamente na planilha. Fallback: variável de ambiente <code className="bg-zinc-800 px-1 rounded text-zinc-300">APP_PASSWORD</code>.</p>
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

  async function handleSync() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", String(dryRun));

    try {
      const res = await fetch(`${API_URL}/api/sync/import`, { method: "POST", body: fd });
      const data = await res.json();
      setResult(data);
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
          onClick={handleSync}
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

          {/* Inserted confirmation */}
          {result?.inserted && (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 size={14} />
              {result.inserted.proventos > 0 && <span>{result.inserted.proventos} proventos inseridos</span>}
              {result.inserted.proventos > 0 && result.inserted.trades > 0 && <span>·</span>}
              {result.inserted.trades > 0 && <span>{result.inserted.trades} operações inseridas</span>}
            </div>
          )}

          {/* Dry run hint */}
          {dryRun && (resumo.proventos.novos + resumo.trades.novos) > 0 && !result?.inserted && (
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <AlertCircle size={12} />
              Simulação — desative &quot;Simular&quot; e clique &quot;Importar&quot; para aplicar
            </p>
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
    { key: "SPREADSHEET_ID",              desc: "ID da planilha Google Sheets (gdados)",          required: true },
    { key: "GOOGLE_API_KEY",              desc: "API Key Google — leitura da planilha",            required: true },
    { key: "GOOGLE_SERVICE_ACCOUNT_JSON", desc: "Service Account JSON — escrita (sync/cotações)", required: true },
    { key: "CRON_SECRET",                 desc: "Token do Vercel Cron — protege /api/cron/*",     required: true },
    { key: "APP_PASSWORD",                desc: "Fallback de senha (prioridade: aba config)",     required: false },
    { key: "GEMINI_API_KEY",              desc: "Google Gemini — Agente IA preditivo",             required: false },
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

function GoldenSourceSection() {
  return (
    <div className="space-y-3 text-xs text-zinc-500 leading-relaxed">
      <p>
        A base de cotações <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">db_cotacoes</code> é
        a <strong className="text-zinc-400">fonte de verdade</strong> de preços para o motor de performance (TWR).
      </p>
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-xs text-emerald-400 flex items-start gap-2">
        <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" />
        <span>
          A atualização roda <strong>automaticamente</strong> toda vez que você abre o app (uma vez por dia)
          e também via Vercel Cron às 23h UTC em dias úteis.
        </span>
      </div>
      <div className="rounded-lg bg-zinc-800/40 px-3 py-2.5 space-y-1">
        <p className="text-zinc-400 font-medium">Como funciona:</p>
        <ul className="list-disc list-inside space-y-0.5 text-zinc-500">
          <li>Preço bruto de fechamento (não ajustado) — evita double-count com proventos</li>
          <li>Matriz larga: 1 linha por dia, 1 coluna por ativo (inclui FX e índices)</li>
          <li>Fonte: Yahoo Finance, com overlap de 3 dias para corrigir gaps</li>
          <li>Backfill inicial e manutenção são automáticos — sem ação necessária</li>
        </ul>
      </div>
    </div>
  );
}

// ── Background Section ──────────────────────────────────────────────────────

const BG_OPTIONS = [
  { label: "Circuito", path: "/midias/home-bg.jpeg" },
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
        Imagem de fundo exibida em todas as páginas com transparência sutil.
        Coloque imagens em <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">public/midias/</code> e selecione abaixo.
      </p>

      <div className="flex flex-wrap gap-3">
        {BG_OPTIONS.map(opt => {
          const active = current === opt.path;
          return (
            <button
              key={opt.label}
              onClick={() => select(opt.path)}
              className="relative rounded-xl overflow-hidden transition-all hover:scale-[1.02]"
              style={{
                width: 120, height: 80,
                border: active ? "2px solid #d4a574" : "2px solid rgba(255,255,255,0.08)",
                boxShadow: active ? "0 0 12px rgba(212,165,116,0.2)" : "none",
              }}
            >
              {opt.path ? (
                <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${opt.path}')`, filter: "brightness(0.5)" }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                  <span className="text-[10px] text-zinc-600">Sem fundo</span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center gap-1">
                {active && <Check size={10} className="text-amber-400" />}
                <span className={`text-[10px] font-semibold ${active ? "text-amber-400" : "text-zinc-400"}`}>{opt.label}</span>
              </div>
            </button>
          );
        })}

        {isCustom && (
          <div
            className="relative rounded-xl overflow-hidden"
            style={{ width: 120, height: 80, border: "2px solid #d4a574", boxShadow: "0 0 12px rgba(212,165,116,0.2)" }}
          >
            <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${current}')`, filter: "brightness(0.5)" }} />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center gap-1">
              <Check size={10} className="text-amber-400" />
              <span className="text-[10px] font-semibold text-amber-400 truncate">Custom</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCustom()}
          placeholder="nome-do-arquivo.jpg"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={handleCustom}
          disabled={!custom.trim()}
          className="px-3 py-2 text-xs rounded-lg font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 transition-colors"
        >
          Aplicar
        </button>
      </div>
      <p className="text-[10px] text-zinc-600">Digite o nome do arquivo em <code className="bg-zinc-800 px-1 rounded">public/midias/</code> ou o caminho completo começando com <code className="bg-zinc-800 px-1 rounded">/</code>.</p>
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

        <SectionCard title="Base de Cotações (Golden Source)" icon={<Database size={16} />}>
          <GoldenSourceSection />
        </SectionCard>

        <SectionCard title="Fundo do Painel" icon={<ImageIcon size={16} />}>
          <BackgroundSection />
        </SectionCard>

        <SectionCard title="Importar Dados (IBKR / B3)" icon={<Upload size={16} />}>
          <ImportSection />
        </SectionCard>

        <SectionCard title="Variáveis de Ambiente" icon={<Shield size={16} />}>
          <EnvSection />
        </SectionCard>

        <SectionCard title="Sobre o Sistema" icon={<Info size={16} />}>
          <div className="space-y-3 text-xs text-zinc-500 leading-relaxed">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
              {[
                { label: "Framework", value: "Next.js 14 (App Router)" },
                { label: "Linguagem", value: "TypeScript" },
                { label: "Estilo", value: "Tailwind CSS 3" },
                { label: "Gráficos", value: "Recharts + Lightweight Charts" },
                { label: "Dados", value: "Google Sheets API" },
                { label: "Deploy", value: "Vercel (Serverless)" },
                { label: "IA / ML", value: "Python (FastAPI)" },
                { label: "Tema", value: "Dark + Glassmorphism" },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-zinc-800/40 px-3 py-2">
                  <p className="text-[10px] text-zinc-600 uppercase">{s.label}</p>
                  <p className="text-xs text-zinc-300">{s.value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2">
              <Shield size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
              <p><strong className="text-zinc-400">TypeScript é o motor canônico</strong> de portfólio, proventos, câmbio, performance e TWR. Python serve exclusivamente o módulo preditivo/ML.</p>
            </div>
            <div className="flex items-start gap-2">
              <Database size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
              <p>Google Sheets como banco de dados — leitura via API Key, escrita via Service Account. Cotações em <code className="bg-zinc-800 px-1 rounded text-zinc-300">db_cotacoes</code> como golden source.</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
