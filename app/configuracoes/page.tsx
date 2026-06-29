"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Settings, Lock, Upload, CheckCircle2, XCircle, AlertCircle,
  FileText, RefreshCw, Shield, Info, Check,
  ChevronDown, ChevronUp, ArrowUpDown, Database, Palette,
  Eye, EyeOff, KeyRound, ShieldCheck, Loader2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { bumpDataVersion } from "@/lib/data-version";
import { useTheme, type Theme } from "@/components/terminal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

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

// ── All page paths for protection config ─────────────────────────────────────

const ALL_PAGES: { href: string; label: string; group: string }[] = [
  { href: "/", label: "Home", group: "Principal" },
  { href: "/resumo", label: "Resumo", group: "Portfólio" },
  { href: "/renda-variavel", label: "Renda Variável", group: "Portfólio" },
  { href: "/renda-fixa", label: "Renda Fixa", group: "Portfólio" },
  { href: "/proventos", label: "Proventos", group: "Portfólio" },
  { href: "/criptoativos", label: "Criptoativos", group: "Portfólio" },
  { href: "/opcoes", label: "Opções", group: "Portfólio" },
  { href: "/hoje", label: "Hoje", group: "Análise" },
  { href: "/performance", label: "Performance", group: "Análise" },
  { href: "/evolucao", label: "Evolução", group: "Análise" },
  { href: "/cambio", label: "Câmbio", group: "Análise" },
  { href: "/simulacoes", label: "Simulações", group: "Análise" },
  { href: "/trades", label: "Trades", group: "Análise" },
  { href: "/etf", label: "ETFs", group: "Análise" },
  { href: "/alavancagem", label: "Alavancagem", group: "Análise" },
  { href: "/impostos", label: "Impostos", group: "Gestão" },
  { href: "/caixa", label: "Caixa", group: "Gestão" },
  { href: "/financas", label: "Finanças", group: "Gestão" },
  { href: "/fluxos", label: "Fluxos", group: "Gestão" },
  { href: "/radar", label: "Radar", group: "Mais" },
  { href: "/polymarket", label: "Preditivos", group: "Mais" },
  { href: "/agente-ia", label: "Agente IA", group: "Mais" },
  { href: "/configuracoes", label: "Configurações", group: "Mais" },
];

// ── Password Section ──────────────────────────────────────────────────────────

function PasswordSection() {
  const [loading, setLoading] = useState(true);
  const [usuario, setUsuario] = useState("");
  const [senhaSet, setSenhaSet] = useState(false);
  const [protectedPages, setProtectedPages] = useState<string[]>([]);
  const [allProtected, setAllProtected] = useState(true);

  // Password change form
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passMsg, setPassMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Protected pages save
  const [savingPages, setSavingPages] = useState(false);
  const [pagesMsg, setPagesMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/config`)
      .then(r => r.json())
      .then(data => {
        setUsuario(data.usuario || "");
        setSenhaSet(data.senhaSet ?? false);
        const pp: string[] = data.protectedPages ?? [];
        setProtectedPages(pp);
        setAllProtected(pp.length === 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleChangePassword() {
    setPassMsg(null);
    if (!currentPass) { setPassMsg({ ok: false, text: "Informe a senha atual" }); return; }
    if (newPass.length < 3) { setPassMsg({ ok: false, text: "Nova senha deve ter pelo menos 3 caracteres" }); return; }
    if (newPass !== confirmPass) { setPassMsg({ ok: false, text: "A confirmação não confere" }); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass }),
      });
      const data = await res.json();
      if (data.ok) {
        setPassMsg({ ok: true, text: "Senha alterada com sucesso" });
        setCurrentPass(""); setNewPass(""); setConfirmPass("");
        setSenhaSet(true);
      } else {
        setPassMsg({ ok: false, text: data.error || "Erro ao alterar" });
      }
    } catch {
      setPassMsg({ ok: false, text: "Erro de conexão" });
    } finally {
      setSaving(false);
    }
  }

  function togglePage(href: string) {
    setProtectedPages(prev =>
      prev.includes(href) ? prev.filter(p => p !== href) : [...prev, href]
    );
    setPagesMsg(null);
  }

  function toggleAll(on: boolean) {
    setAllProtected(on);
    if (on) setProtectedPages([]);
    else setProtectedPages(ALL_PAGES.map(p => p.href));
    setPagesMsg(null);
  }

  async function handleSavePages() {
    setSavingPages(true);
    setPagesMsg(null);
    try {
      const payload = allProtected ? [] : protectedPages;
      const res = await fetch(`${API_URL}/api/auth/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protectedPages: payload }),
      });
      const data = await res.json();
      if (data.ok) {
        setPagesMsg({ ok: true, text: "Páginas protegidas salvas" });
        sessionStorage.setItem("mi_protected_pages", JSON.stringify(payload));
      } else {
        setPagesMsg({ ok: false, text: data.error || "Erro ao salvar" });
      }
    } catch {
      setPagesMsg({ ok: false, text: "Erro de conexão" });
    } finally {
      setSavingPages(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
        <Loader2 size={14} className="animate-spin" /> Carregando configuração…
      </div>
    );
  }

  const inputCls = "w-full px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)] bg-zinc-800/50 border border-zinc-700 text-zinc-200 font-mono";
  const groups = [...new Set(ALL_PAGES.map(p => p.group))];

  return (
    <div className="space-y-6">
      {/* ── Alterar Senha ── */}
      <div>
        <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          <KeyRound size={13} /> Alterar Senha
        </h3>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-zinc-500 uppercase">Usuário:</span>
          <span className="text-xs text-zinc-300 font-mono font-bold">{usuario || "—"}</span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="text-[10px] text-zinc-500 uppercase">Senha na planilha:</span>
          <span className={`text-xs font-mono font-bold ${senhaSet ? "text-emerald-400" : "text-amber-400"}`}>
            {senhaSet ? "Configurada" : "Usando fallback"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">Senha Atual</label>
            <div className="relative flex items-center">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPass}
                onChange={e => setCurrentPass(e.target.value)}
                placeholder="••••"
                className={inputCls}
              />
              <button type="button" onClick={() => setShowCurrent(s => !s)} className="absolute right-2 text-zinc-500 hover:text-zinc-300">
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">Nova Senha</label>
            <div className="relative flex items-center">
              <input
                type={showNew ? "text" : "password"}
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Nova senha"
                className={inputCls}
              />
              <button type="button" onClick={() => setShowNew(s => !s)} className="absolute right-2 text-zinc-500 hover:text-zinc-300">
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">Confirmar</label>
            <input
              type="password"
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              placeholder="Repetir nova senha"
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleChangePassword}
            disabled={saving || !currentPass || !newPass || !confirmPass}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider border border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--accent-wash)] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
            {saving ? "Salvando…" : "Alterar Senha"}
          </button>
          {passMsg && (
            <span className={`text-xs font-mono flex items-center gap-1 ${passMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {passMsg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {passMsg.text}
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-800" />

      {/* ── Páginas Protegidas ── */}
      <div>
        <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          <ShieldCheck size={13} /> Páginas Protegidas por Senha
        </h3>

        <p className="text-xs text-zinc-500 leading-relaxed mb-3">
          Escolha quais páginas exigem login. Páginas não selecionadas ficam acessíveis sem senha.
          Com <strong className="text-zinc-400">"Todas"</strong> ativo, toda a aplicação exige autenticação.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => toggleAll(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider border transition-colors ${
              allProtected
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                : "border-zinc-700 bg-zinc-800/40 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Shield size={11} /> Todas (padrão)
          </button>
          <button
            onClick={() => toggleAll(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider border transition-colors ${
              !allProtected
                ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                : "border-zinc-700 bg-zinc-800/40 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Settings size={11} /> Personalizar
          </button>
        </div>

        {!allProtected && (
          <div className="space-y-3">
            {groups.map(group => {
              const pages = ALL_PAGES.filter(p => p.group === group);
              const allChecked = pages.every(p => protectedPages.includes(p.href));
              return (
                <div key={group}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{group}</span>
                    <button
                      onClick={() => {
                        if (allChecked) {
                          setProtectedPages(prev => prev.filter(p => !pages.some(pg => pg.href === p)));
                        } else {
                          setProtectedPages(prev => [...new Set([...prev, ...pages.map(pg => pg.href)])]);
                        }
                        setPagesMsg(null);
                      }}
                      className="text-[9px] text-zinc-600 hover:text-zinc-400 font-mono uppercase"
                    >
                      {allChecked ? "desmarcar" : "marcar"} todas
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                    {pages.map(page => {
                      const checked = protectedPages.includes(page.href);
                      return (
                        <button
                          key={page.href}
                          onClick={() => togglePage(page.href)}
                          className={`flex items-center gap-2 px-3 py-2 text-left text-[11px] font-mono border transition-colors ${
                            checked
                              ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-400"
                              : "border-zinc-800 bg-zinc-800/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 border flex items-center justify-center flex-shrink-0 ${
                            checked ? "border-emerald-500/50 bg-emerald-500/20" : "border-zinc-700"
                          }`}>
                            {checked && <Check size={9} className="text-emerald-400" />}
                          </div>
                          <span className="truncate">{page.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleSavePages}
                disabled={savingPages}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider border border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--accent-wash)] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {savingPages ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                {savingPages ? "Salvando…" : "Salvar Proteção"}
              </button>
              {pagesMsg && (
                <span className={`text-xs font-mono flex items-center gap-1 ${pagesMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {pagesMsg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {pagesMsg.text}
                </span>
              )}
              <span className="text-[10px] text-zinc-600 ml-auto">
                {protectedPages.length}/{ALL_PAGES.length} páginas
              </span>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-zinc-500 leading-relaxed mt-3">
          <Shield size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
          <p>A configuração é salva na aba <code className="bg-zinc-800 px-1 rounded text-zinc-300">config</code> da planilha. Páginas não protegidas ficam acessíveis sem login.</p>
        </div>
      </div>
    </div>
  );
}

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
  parsed?: { proventos: number; trades: number; cambio?: number; positions: number };
  proventos?: { total: number; faltantes: number; inserted?: number; preview?: FlexProventoRow[] };
  trades?: { total: number; existing_count?: number; faltantes: number; potential_splits?: number; inserted?: number; preview?: FlexTradeRow[] };
  cambio?: { total: number; faltantes: number; inserted?: number; preview?: FlexCambioRow[] };
}

function FlexSyncSection() {
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FlexResult | null>(null);

  async function run(forceApply = false) {
    const simular = forceApply ? false : dryRun;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/sync/ibkr/flex?dry_run=${simular}`);
      const data: FlexResult = await res.json();
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

// ── Theme Section ──────────────────────────────────────────────────────────

const THEME_OPTIONS: { key: Theme; label: string; desc: string; preview: { bg: string; accent: string; text: string; muted: string; pos: string; neg: string } }[] = [
  {
    key: "ambar",
    label: "Âmbar",
    desc: "Terminal escuro clássico — acento dourado, superfícies neutras",
    preview: { bg: "#08080A", accent: "#E8A33D", text: "#DEE1E8", muted: "#71757F", pos: "#3FB950", neg: "#F0504A" },
  },
  {
    key: "matrix",
    label: "Matrix",
    desc: "Fósforo verde — estética de terminal hacker, alto contraste",
    preview: { bg: "#050A05", accent: "#00FF41", text: "#B5E8B5", muted: "#5A8A5A", pos: "#00FF41", neg: "#FF3838" },
  },
  {
    key: "jornal",
    label: "Jornal",
    desc: "Papel de jornal financeiro — claro, tipografia serifada",
    preview: { bg: "#F2EBDD", accent: "#000000", text: "#000000", muted: "#555555", pos: "#0C6B2E", neg: "#7F1D1D" },
  },
  {
    key: "miami",
    label: "Miami",
    desc: "Synthwave / Miami Vice — neon rosa e ciano, pôr-do-sol retrô e grade",
    preview: { bg: "#160A2E", accent: "#FF2A6D", text: "#F5ECFF", muted: "#8E7AA8", pos: "#05FFA1", neg: "#FF2A6D" },
  },
  {
    key: "blade",
    label: "Blade Runner",
    desc: "Noir cyberpunk — chuva, neon laranja/ciano, megacidade distópica",
    preview: { bg: "#060A12", accent: "#FF6D00", text: "#C9D1D9", muted: "#6B7B8D", pos: "#3FB950", neg: "#F0504A" },
  },
  {
    key: "starwars",
    label: "Star Wars",
    desc: "Espaço profundo — campo de estrelas, saltos para o hiperespaço, amarelo do letreiro",
    preview: { bg: "#05060A", accent: "#FFE81F", text: "#E8E6D8", muted: "#6E6F78", pos: "#43D17A", neg: "#FF3B3B" },
  },
];

function ThemeSection() {
  const { theme, setTheme, bgAnim, setBgAnim } = useTheme();

  const hasAnimation = theme === "ambar" || theme === "jornal" || theme === "matrix" || theme === "miami" || theme === "blade" || theme === "starwars";

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Altera as cores e tipografia de toda a interface. O tema persiste entre sessões no navegador.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {THEME_OPTIONS.map((opt) => {
          const active = theme === opt.key;
          const p = opt.preview;
          return (
            <button
              key={opt.key}
              onClick={() => setTheme(opt.key)}
              className="relative text-left transition-all hover:scale-[1.01]"
              style={{
                background: p.bg,
                border: active ? `2px solid ${p.accent}` : "2px solid rgba(128,128,128,0.2)",
                boxShadow: active ? `0 0 20px ${p.accent}33` : "none",
                padding: 16,
              }}
            >
              {active && (
                <div className="absolute top-2.5 right-2.5">
                  <Check size={14} style={{ color: p.accent }} />
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: p.accent, boxShadow: `0 0 8px ${p.accent}66` }}
                />
                <span className="font-mono text-sm font-bold" style={{ color: p.text }}>
                  {opt.label}
                </span>
              </div>

              {/* Mini preview */}
              <div
                className="rounded-sm overflow-hidden mb-3"
                style={{ border: `1px solid ${p.muted}33`, background: `${p.bg}` }}
              >
                <div className="flex items-center justify-between px-2.5 py-1.5" style={{ borderBottom: `1px solid ${p.muted}33` }}>
                  <span className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: p.muted }}>
                    PREVIEW
                  </span>
                  <span className="font-mono" style={{ fontSize: 9, color: p.accent, fontWeight: 700 }}>●</span>
                </div>
                <div className="px-2.5 py-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: p.text }}>PETR4</span>
                    <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: p.pos }}>+2.3%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: p.text }}>VALE3</span>
                    <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: p.neg }}>−1.1%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono" style={{ fontSize: 10, color: p.muted }}>Patrimônio</span>
                    <span className="font-mono" style={{ fontSize: 10, fontWeight: 600, color: p.text }}>R$ 420k</span>
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 11, lineHeight: 1.4, color: p.muted }}>
                {opt.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Animation toggle */}
      {hasAnimation && (
        <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/50">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${bgAnim ? "bg-emerald-500" : "bg-zinc-600"}`}
              onClick={() => setBgAnim(!bgAnim)}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${bgAnim ? "left-4" : "left-0.5"}`} />
            </div>
            <span className="text-xs text-zinc-400">
              {bgAnim ? "Animação de fundo ativada" : "Animação de fundo desativada"}
            </span>
          </label>
          <span className="text-[10px] text-zinc-600">
            Desative para economizar bateria em dispositivos móveis
          </span>
        </div>
      )}
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

        <SectionCard title="Tema do Sistema" icon={<Palette size={16} />}>
          <ThemeSection />
        </SectionCard>

        <SectionCard title="Base de Cotações (Golden Source)" icon={<Database size={16} />}>
          <GoldenSourceSection />
        </SectionCard>

        <SectionCard title="Importar Dados (IBKR / B3)" icon={<Upload size={16} />}>
          <ImportSection />
        </SectionCard>

        <SectionCard title="Sincronizar IBKR (API · sem arquivo)" icon={<RefreshCw size={16} />}>
          <FlexSyncSection />
        </SectionCard>

        <SectionCard title="Variáveis de Ambiente" icon={<Settings size={16} />}>
          <EnvSection />
        </SectionCard>

        <SectionCard title="Sobre o Sistema" icon={<Info size={16} />} defaultOpen>
          <div className="space-y-5">
            {/* Stack técnica */}
            <div>
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Stack Técnica</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Framework", value: "Next.js 14 (App Router)" },
                  { label: "Estilo", value: "Tailwind CSS 3" },
                  { label: "Gráficos", value: "Recharts + lightweight-charts" },
                  { label: "Dados", value: "Google Sheets API" },
                  { label: "Deploy", value: "Vercel (auto-deploy)" },
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
            </div>

            {/* Motores de cálculo */}
            <div>
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Motores de Cálculo</h3>
              <div className="space-y-2">
                <div className="rounded-lg bg-blue-500/8 border border-blue-500/15 px-4 py-3">
                  <p className="text-xs text-blue-300 font-semibold mb-1">Portfólio (fonte única)</p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    TypeScript é o <strong className="text-zinc-300">único motor</strong>. Patrimônio, investido (FIFO), lucro, proventos e câmbio vivem em{" "}
                    <code className="bg-zinc-800 px-1 rounded text-zinc-300">calcularSnapshot</code>.
                    Python serve apenas preditivo/ML e agente IA.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2.5">
                    <p className="text-[11px] text-zinc-300 font-semibold">Performance TWR/MWR</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Modified Dietz (GIPS) com base de cotações golden source. Decompõe preço vs. dividendos.</p>
                  </div>
                  <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2.5">
                    <p className="text-[11px] text-zinc-300 font-semibold">Câmbio & PM Dólar</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">PM real das remessas (não PTAX). Suporta USD, EUR, CAD, GBP. PTAX multi-moeda via BCB.</p>
                  </div>
                  <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2.5">
                    <p className="text-[11px] text-zinc-300 font-semibold">Impostos (IR)</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Apuração DARF mensal com isenção, compensação de prejuízo, day-trade vs. swing. PTAX multi-moeda para ativos no exterior.</p>
                  </div>
                  <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2.5">
                    <p className="text-[11px] text-zinc-300 font-semibold">ETF Look-Through</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Abertura de composição de ETFs com fontes em cascata (FMP, Alpha Vantage, Yahoo). Bucket {'"'}Outros · diversificação{'"'} para cobertura honesta.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Módulos / Páginas */}
            <div>
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Módulos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
                {[
                  { group: "Portfólio", items: ["Resumo geral", "Renda variável", "Renda fixa (manual)", "Proventos & dividendos", "Criptoativos", "Opções"] },
                  { group: "Análise", items: ["Performance (TWR/MWR)", "Setores & composição", "Evolução patrimonial", "Câmbio & remessas", "Simulações (Monte Carlo)", "Trades & operações", "ETFs (look-through + mapa)", "Radar de mercado (globo 3D)"] },
                  { group: "Gestão & Mais", items: ["Impostos (DARF + DIRPF)", "Alavancagem & margem", "Finanças pessoais", "Fluxos de caixa", "Inteligência (notícias + Reddit)", "Preditivos (Polymarket, Kalshi)", "Agente IA (multi-LLM)", "5 temas visuais"] },
                ].map(g => (
                  <div key={g.group}>
                    <p className="text-zinc-400 font-semibold mb-1">{g.group}</p>
                    <ul className="space-y-0.5">
                      {g.items.map(item => (
                        <li key={item} className="text-zinc-500 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Integrações & API */}
            <div>
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Integrações</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Google Sheets", desc: "Leitura + escrita com backup" },
                  { label: "Yahoo Finance", desc: "Cotações e histórico" },
                  { label: "Banco Central", desc: "PTAX multi-moeda (BCB)" },
                  { label: "IBKR / B3", desc: "Import CSV idempotente" },
                  { label: "FMP / AlphaVantage", desc: "Holdings de ETFs" },
                  { label: "Polymarket / Kalshi", desc: "Mercados preditivos" },
                  { label: "Reddit", desc: "Inteligência de mercado" },
                  { label: "Vercel Cron", desc: "Cotações auto (23h UTC)" },
                ].map(s => (
                  <div key={s.label} className="rounded-lg bg-zinc-800/40 px-3 py-2">
                    <p className="text-[10px] text-zinc-600 uppercase">{s.label}</p>
                    <p className="text-[11px] text-zinc-500">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Notas de segurança */}
            <div className="space-y-2 text-xs text-zinc-500 leading-relaxed">
              <div className="flex items-start gap-2">
                <Shield size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                <p>Leitura via API Key. Escrita/sync requer Service Account com permissão de Editora na planilha. Toda escrita faz backup automático da aba.</p>
              </div>
              <div className="flex items-start gap-2">
                <FileText size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                <p>Importações idempotentes — sem risco de duplicatas. Detecta automaticamente IBKR ou B3. Modo demo (login test/test) escala valores ×15 sem expor números reais.</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
