"use client";

import { useState, useRef, useCallback } from "react";
import {
  Settings, Lock, Upload, CheckCircle2, XCircle, AlertCircle,
  FileText, RefreshCw, Eye, EyeOff, Shield, Database, Info,
  ChevronDown, ChevronUp,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncResult {
  total_csv?: number;
  faltantes?: number;
  inserted?: number;
  preview?: Record<string, unknown>[];
  error?: string;
  hint?: string;
  parsed?: { proventos: number; trades: number };
  proventos?: { total_csv: number; faltantes: number; inserted?: number };
  trades?: { total_csv: number; faltantes: number; inserted?: number; potential_splits?: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
      ok ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
         : "bg-red-500/10 text-red-400 border border-red-500/20"
    }`}>
      {ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {text}
    </span>
  );
}

function SectionCard({ title, icon, children, defaultOpen = true }: {
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
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleChange() {
    if (!newPwd) { setMsg({ ok: false, text: "Nova senha não pode ser vazia" }); return; }
    if (newPwd !== confirmPwd) { setMsg({ ok: false, text: "Senhas não coincidem" }); return; }
    if (newPwd.length < 3) { setMsg({ ok: false, text: "Senha deve ter ao menos 3 caracteres" }); return; }

    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Erro ao verificar senha" });
      } else {
        setMsg({ ok: true, text: data.message ?? "Atualize APP_PASSWORD nas variáveis de ambiente da Vercel." });
        setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        A senha é gerenciada via variável de ambiente{" "}
        <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">APP_PASSWORD</code> no painel da Vercel.
        Após a troca, atualize a variável para que a nova senha persista entre deploys.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5 font-medium">Senha Atual</label>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              placeholder="••••••"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 pr-9"
            />
            <button className="absolute right-2 top-2 text-zinc-500" onClick={() => setShowCurrent(v => !v)}>
              {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5 font-medium">Nova Senha</label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="••••••"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 pr-9"
            />
            <button className="absolute right-2 top-2 text-zinc-500" onClick={() => setShowNew(v => !v)}>
              {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5 font-medium">Confirmar Nova Senha</label>
          <input
            type="password"
            value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleChange()}
            placeholder="••••••"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleChange}
          disabled={loading}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
        >
          {loading ? <RefreshCw size={14} className="animate-spin inline mr-1" /> : <Lock size={14} className="inline mr-1" />}
          Alterar Senha
        </button>
        {msg && (
          <span className={`text-xs flex items-center gap-1.5 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
            {msg.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

// ── IBKR Sync Section ─────────────────────────────────────────────────────────

function IBKRSyncSection() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"proventos" | "trades" | "both">("proventos");
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".csv")) setFile(f);
  }, []);

  async function handleSync() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", mode);
    fd.append("dry_run", String(dryRun));

    try {
      const res = await fetch(`${API_URL}/api/sync/ibkr`, { method: "POST", body: fd });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Erro de conexão" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Importe o CSV do Interactive Brokers para sincronizar dividendos, impostos retidos e operações de compra/venda.
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
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <FileText size={18} />
            <span className="font-medium text-sm">{file.name}</span>
            <span className="text-xs text-zinc-500">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
        ) : (
          <div className="text-zinc-500">
            <Upload size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Arraste o CSV do IBKR ou clique para selecionar</p>
            <p className="text-xs mt-1 opacity-60">Arquivo &quot;Histórico de transações&quot;</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
          {(["proventos", "trades", "both"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === m ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              {m === "proventos" ? "Dividendos" : m === "trades" ? "Operações" : "Tudo"}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${dryRun ? "bg-amber-500" : "bg-zinc-600"}`}
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

      {result && (
        <div className={`rounded-xl p-4 text-sm ${result.error ? "bg-red-500/10 border border-red-500/20" : "bg-zinc-900/60 border border-zinc-800"}`}>
          {result.error ? (
            <div>
              <p className="text-red-400 flex items-center gap-2 mb-1"><XCircle size={15} />{result.error}</p>
              {result.error.includes("SERVICE_ACCOUNT") && (
                <p className="text-xs text-zinc-500 mt-1">Configure <code className="bg-zinc-800 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code> nas env vars da Vercel para habilitar escrita.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {result.parsed && (
                <p className="text-zinc-400 text-xs">CSV: <strong className="text-zinc-200">{result.parsed.proventos}</strong> dividendos + <strong className="text-zinc-200">{result.parsed.trades}</strong> operações reconhecidas</p>
              )}
              {result.proventos && (
                <StatusBadge ok={(result.proventos.faltantes === 0 || (result.proventos.inserted ?? 0) > 0)} text={
                  result.proventos.inserted !== undefined
                    ? `${result.proventos.inserted} proventos adicionados`
                    : `${result.proventos.faltantes} proventos a adicionar (${result.proventos.total_csv} no CSV)`
                } />
              )}
              {result.trades && (
                <>
                  <StatusBadge ok={(result.trades.faltantes === 0 || (result.trades.inserted ?? 0) > 0)} text={
                    result.trades.inserted !== undefined
                      ? `${result.trades.inserted} operações adicionadas`
                      : `${result.trades.faltantes} operações a adicionar (${result.trades.total_csv} no CSV)`
                  } />
                  {(result.trades.potential_splits ?? 0) > 0 && (
                    <p className="text-xs text-amber-400/80 flex items-center gap-1">
                      <AlertCircle size={11} />
                      {result.trades.potential_splits} possível(is) split/ajuste detectado(s) — valor total bate mas qtd/preço diferem
                    </p>
                  )}
                </>
              )}
              {dryRun && ((result.proventos?.faltantes ?? 0) + (result.trades?.faltantes ?? 0)) > 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-1 mt-1">
                  <AlertCircle size={12} />Simulação — desative &quot;Simular&quot; e clique &quot;Importar&quot; para aplicar
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── B3 Sync Section ───────────────────────────────────────────────────────────

function B3SyncSection() {
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  async function handleSync() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", String(dryRun));

    try {
      const res = await fetch(`${API_URL}/api/sync/b3`, { method: "POST", body: fd });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Erro de conexão" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Importe o relatório de proventos da B3 (CSV ou TXT) para sincronizar dividendos, JCP e rendimentos de FIIs.
        Formatos suportados: exportação da área logada da B3 e relatórios de corretoras.
      </p>

      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          file ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-500"
        }`}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <FileText size={18} />
            <span className="font-medium text-sm">{file.name}</span>
            <span className="text-xs text-zinc-500">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
        ) : (
          <div className="text-zinc-500">
            <Upload size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Arraste o arquivo da B3 ou clique para selecionar</p>
            <p className="text-xs mt-1 opacity-60">CSV ou TXT do relatório de proventos</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${dryRun ? "bg-amber-500" : "bg-zinc-600"}`}
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

      {result && (
        <div className={`rounded-xl p-4 text-sm ${result.error ? "bg-red-500/10 border border-red-500/20" : "bg-zinc-900/60 border border-zinc-800"}`}>
          {result.error ? (
            <div>
              <p className="text-red-400 flex items-center gap-2 mb-1"><XCircle size={15} />{result.error}</p>
              {result.hint && <p className="text-xs text-zinc-500 mt-1">{result.hint}</p>}
              {result.error.includes("SERVICE_ACCOUNT") && (
                <p className="text-xs text-zinc-500 mt-1">Configure <code className="bg-zinc-800 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code> nas env vars da Vercel.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <StatusBadge ok={(result.faltantes === 0 || (result.inserted ?? 0) > 0)} text={
                result.inserted !== undefined
                  ? `${result.inserted} proventos adicionados com sucesso`
                  : `${result.faltantes} proventos a adicionar (de ${result.total_csv} no arquivo)`
              } />
              {dryRun && (result.faltantes ?? 0) > 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-1 mt-1">
                  <AlertCircle size={12} />Simulação — desative &quot;Simular&quot; para aplicar
                </p>
              )}
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
    { key: "SPREADSHEET_ID",              desc: "ID da planilha Google Sheets (gdados)",   required: true },
    { key: "GOOGLE_API_KEY",              desc: "API Key Google — leitura da planilha",     required: true },
    { key: "GOOGLE_SERVICE_ACCOUNT_JSON", desc: "Service Account JSON — escrita/sync IBKR",required: false },
    { key: "APP_PASSWORD",                desc: "Senha de acesso ao dashboard",            required: false },
    { key: "GEMINI_API_KEY",              desc: "Google Gemini — Agente IA e Notícias",    required: false },
    { key: "NEXT_PUBLIC_API_URL",         desc: "URL base da API (vazio = mesmo domínio)", required: false },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">Configure no painel da Vercel em <strong className="text-zinc-400">Settings → Environment Variables</strong>.</p>
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

export default function ConfiguracoesPage() {
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Gerencie senha de acesso, sincronização com corretoras e variáveis de ambiente."
      />

      <div className="max-w-3xl">
        <SectionCard title="Segurança — Senha de Acesso" icon={<Lock size={16} />}>
          <PasswordSection />
        </SectionCard>

        <SectionCard title="Sincronizar IBKR (Interactive Brokers)" icon={<Database size={16} />}>
          <IBKRSyncSection />
        </SectionCard>

        <SectionCard title="Sincronizar Proventos B3" icon={<Upload size={16} />}>
          <B3SyncSection />
        </SectionCard>

        <SectionCard title="Variáveis de Ambiente" icon={<Settings size={16} />} defaultOpen={false}>
          <EnvSection />
        </SectionCard>

        <SectionCard title="Sobre o Sistema" icon={<Info size={16} />} defaultOpen={false}>
          <div className="space-y-3 text-xs text-zinc-500 leading-relaxed">
            <div className="flex items-start gap-2">
              <Shield size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
              <p>Dados lidos via API Key (somente leitura). Sincronizações de escrita requerem Service Account com permissão de Editora na planilha <code className="bg-zinc-800 px-1 rounded text-zinc-300">gdados</code>.</p>
            </div>
            <div className="flex items-start gap-2">
              <FileText size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
              <p>As importações IBKR e B3 são idempotentes — podem ser executadas múltiplas vezes sem criar duplicatas. Use sempre &quot;Simular&quot; antes de &quot;Importar&quot;.</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
