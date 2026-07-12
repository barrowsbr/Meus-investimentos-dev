"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Settings, Lock, Upload, CheckCircle2, XCircle, AlertCircle,
  FileText, RefreshCw, Shield, Info, Check,
  ChevronDown, ChevronUp, ArrowUpDown, Database, Palette,
  Eye, EyeOff, KeyRound, ShieldCheck, Loader2, Bell,
  Globe as GlobeIcon, Activity, Play, History, ExternalLink, Zap, Search,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { bumpDataVersion } from "@/lib/data-version";
import { useTheme, type Theme } from "@/components/terminal";
import { getHoloStyle, setHoloStyle, type HoloStyle } from "@/lib/holo-style";
import { getStreakDays, setStreakDays, STREAK_DAYS_DEFAULT, STREAK_DAYS_MIN, STREAK_DAYS_MAX } from "@/lib/home-prefs";
import PlanilhaCard from "@/components/config/PlanilhaCard";

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

// Chip de status no cabeçalho do card — mostra o estado SEM precisar abrir.
export type CardChip = { label: string; tone: "ok" | "warn" | "off" | "muted" };

const CHIP_TONE: Record<CardChip["tone"], React.CSSProperties> = {
  ok:    { background: "rgba(63,185,80,0.10)",  border: "1px solid rgba(63,185,80,0.35)",  color: "#3FB950" },
  warn:  { background: "rgba(232,163,61,0.10)", border: "1px solid rgba(232,163,61,0.35)", color: "#E8A33D" },
  off:   { background: "rgba(240,80,74,0.08)",  border: "1px solid rgba(240,80,74,0.30)",  color: "#F0504A" },
  muted: { background: "rgba(128,128,128,0.08)", border: "1px solid var(--line-strong)",   color: "var(--muted)" },
};

// Cards abertos persistem na sessão do navegador — voltar pra página mantém o contexto.
const OPEN_KEY = "cfg-open-cards";
function readOpenSet(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? "[]")); } catch { return new Set(); }
}

function SectionCard({ id, title, desc, icon, chips, children, defaultOpen = false }: {
  id?: string;
  title: string;
  desc?: string;
  icon: React.ReactNode;
  chips?: CardChip[];
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (id && readOpenSet().has(id)) setOpen(true);
  }, [id]);

  const toggle = () => setOpen((o) => {
    const n = !o;
    if (id) {
      try {
        const set = readOpenSet();
        if (n) set.add(id); else set.delete(id);
        sessionStorage.setItem(OPEN_KEY, JSON.stringify([...set]));
      } catch { /* ignore */ }
    }
    return n;
  });

  return (
    <div className="glass-card overflow-hidden mb-3 transition-colors hover:border-zinc-700/70">
      <button className="w-full flex items-center gap-3 p-4 sm:px-5 text-left hover:bg-white/[0.02] transition-colors" onClick={toggle}>
        <span className="text-zinc-400 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-zinc-200 text-sm truncate">{title}</span>
          {desc && <span className="block text-[11px] text-zinc-600 truncate mt-0.5">{desc}</span>}
        </span>
        {chips && chips.length > 0 && (
          <span className="hidden sm:flex items-center gap-1.5 shrink-0">
            {chips.map((c, i) => (
              <span key={i} className="rounded-full px-2 py-0.5 text-[10px] font-mono font-bold whitespace-nowrap" style={CHIP_TONE[c.tone]}>
                {c.label}
              </span>
            ))}
          </span>
        )}
        <ChevronDown size={15} className="text-zinc-500 shrink-0 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-5 border-t border-zinc-800/50 pt-4">
          {/* Chips visíveis no mobile quando aberto (no fechado economizam espaço) */}
          {chips && chips.length > 0 && (
            <div className="sm:hidden flex flex-wrap gap-1.5 mb-3">
              {chips.map((c, i) => (
                <span key={i} className="rounded-full px-2 py-0.5 text-[10px] font-mono font-bold" style={CHIP_TONE[c.tone]}>{c.label}</span>
              ))}
            </div>
          )}
          {children}
        </div>
      )}
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
  const [loginEnabled, setLoginEnabled] = useState(true);
  const [savingLogin, setSavingLogin] = useState(false);

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
        setLoginEnabled(data.loginEnabled ?? true);
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

  async function handleToggleLogin(next: boolean) {
    setLoginEnabled(next);
    setSavingLogin(true);
    try {
      await fetch(`${API_URL}/api/auth/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginEnabled: next }),
      });
      sessionStorage.setItem("mi_login_enabled", next ? "1" : "0");
    } catch {
      // reverte em caso de erro
      setLoginEnabled(!next);
    } finally {
      setSavingLogin(false);
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
      {/* ── Exigir login (página de login opcional) ── */}
      <div>
        <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          <Lock size={13} /> Senha de Acesso
        </h3>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200">Exigir senha para entrar</p>
            <p className="text-xs text-zinc-500 leading-relaxed mt-0.5">
              Quando <strong className="text-zinc-400">desligado</strong>, a página de login não aparece —
              o app abre direto (a primeira senha do home deixa de ser pedida). Quando ligado, vale a
              proteção por página abaixo.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
            {savingLogin && <Loader2 size={13} className="animate-spin text-zinc-500" />}
            <div
              className={`w-10 h-5.5 rounded-full transition-colors relative ${loginEnabled ? "bg-emerald-500" : "bg-zinc-600"}`}
              style={{ width: 40, height: 22 }}
              onClick={() => !savingLogin && handleToggleLogin(!loginEnabled)}
            >
              <div
                className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all"
                style={{ left: loginEnabled ? 20 : 2 }}
              />
            </div>
            <span className={`text-xs font-mono font-bold ${loginEnabled ? "text-emerald-400" : "text-zinc-500"}`}>
              {loginEnabled ? "ON" : "OFF"}
            </span>
          </label>
        </div>
        {!loginEnabled && (
          <p className="text-[11px] text-amber-400/80 mt-2 flex items-center gap-1.5">
            <ShieldCheck size={12} /> Login desativado — qualquer pessoa com o link acessa o dashboard.
          </p>
        )}
      </div>

      <div className="border-t border-zinc-800" />

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
          Com <strong className="text-zinc-400">&quot;Todas&quot;</strong> ativo, toda a aplicação exige autenticação.
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

// ── Alertas (Telegram) ───────────────────────────────────────────────────────

interface AlertasConfigResp {
  chatId: string;
  limiteAlavancagemPct: number;
  ativo: boolean;
  darfAtivo: boolean;
  dirpfAtivo: boolean;
  alavancagemAtivo: boolean;
  resumoAtivo: boolean;
  resumoHorarios: number[];
  tokenConfigured: boolean;
  tokenSource: "env" | "config" | "none";
}

// Linha de liga/desliga reutilizável (título + descrição + toggle ON/OFF).
function ToggleRow({ title, desc, on, onToggle, disabled }: {
  title: string; desc: string; on: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 transition-opacity ${disabled ? "opacity-40" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-200">{title}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <label className={`flex items-center gap-2 select-none shrink-0 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <div
          className={`rounded-full transition-colors relative ${on ? "bg-emerald-500" : "bg-zinc-600"}`}
          style={{ width: 40, height: 22 }}
          onClick={() => !disabled && onToggle()}
        >
          <div className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all" style={{ left: on ? 20 : 2 }} />
        </div>
        <span className={`text-xs font-mono font-bold ${on ? "text-emerald-400" : "text-zinc-500"}`}>{on ? "ON" : "OFF"}</span>
      </label>
    </div>
  );
}

function AlertasSection() {
  const [loading, setLoading] = useState(true);
  const [chatId, setChatId] = useState("");
  const [limite, setLimite] = useState(30);
  const [ativo, setAtivo] = useState(true);
  const [darfAtivo, setDarfAtivo] = useState(true);
  const [dirpfAtivo, setDirpfAtivo] = useState(true);
  const [alavancagemAtivo, setAlavancagemAtivo] = useState(true);
  const [resumoAtivo, setResumoAtivo] = useState(true);
  const [resumoHorarios, setResumoHorarios] = useState<number[]>([18]);
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [tokenSource, setTokenSource] = useState<"env" | "config" | "none">("none");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestMsg, setDigestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/alertas/config`)
      .then(r => r.json())
      .then((d: AlertasConfigResp) => {
        setChatId(d.chatId ?? "");
        setLimite(d.limiteAlavancagemPct ?? 30);
        setAtivo(d.ativo ?? true);
        setDarfAtivo(d.darfAtivo ?? true);
        setDirpfAtivo(d.dirpfAtivo ?? true);
        setAlavancagemAtivo(d.alavancagemAtivo ?? true);
        setResumoAtivo(d.resumoAtivo ?? true);
        setResumoHorarios(Array.isArray(d.resumoHorarios) && d.resumoHorarios.length > 0 ? d.resumoHorarios : [18]);
        setTokenConfigured(d.tokenConfigured ?? false);
        setTokenSource(d.tokenSource ?? "none");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/alertas/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, botToken, limiteAlavancagemPct: limite, ativo, darfAtivo, dirpfAtivo, alavancagemAtivo, resumoAtivo, resumoHorarios }),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg({ ok: true, text: "Configuração salva" });
        if (botToken.trim()) { setTokenConfigured(true); setTokenSource(s => s === "env" ? "env" : "config"); setBotToken(""); }
      } else setMsg({ ok: false, text: data.error || "Erro ao salvar" });
    } catch {
      setMsg({ ok: false, text: "Erro de conexão" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/alertas/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) setTestMsg({ ok: true, text: "Mensagem de teste enviada — confira o Telegram" });
      else setTestMsg({ ok: false, text: data.error || "Erro ao enviar" });
    } catch {
      setTestMsg({ ok: false, text: "Erro de conexão" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSendDigest() {
    setSendingDigest(true);
    setDigestMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/digest/send`, { method: "POST" });
      const data = await res.json();
      if (data.ok) setDigestMsg({ ok: true, text: "Resumo enviado — confira o Telegram" });
      else setDigestMsg({ ok: false, text: data.error || "Erro ao enviar" });
    } catch {
      setDigestMsg({ ok: false, text: "Erro de conexão" });
    } finally {
      setSendingDigest(false);
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

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Alertas <strong className="text-zinc-400">determinísticos</strong> via Telegram — sem monitorar preço em tempo real:
        DARF a vencer/vencido, prazo da DIRPF e alavancagem acima do limite. Roda 1x/dia via cron.
      </p>

      {!tokenConfigured && (
        <div className="rounded-lg p-3 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Token do bot ainda não configurado — cole o token abaixo e salve, <strong>ou</strong> defina a env var{" "}
            <code className="bg-zinc-800 px-1 rounded">TELEGRAM_BOT_TOKEN</code> na Vercel. Sem token, o bot não envia nada.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">Chat ID do Telegram</label>
          <input
            type="text" value={chatId} onChange={e => setChatId(e.target.value)}
            placeholder="ex: 1737564761" className={inputCls}
          />
          <p className="text-[10px] text-zinc-600 mt-1">
            É o SEU id de usuário (não o do bot). Pegue em <code className="bg-zinc-800 px-1 rounded">/getUpdates</code> depois de mandar uma mensagem pro bot.
          </p>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
            Token do bot {tokenSource === "env" ? <span className="text-emerald-400/70 normal-case">· via env var</span> : tokenConfigured ? <span className="text-emerald-400/70 normal-case">· salvo</span> : null}
          </label>
          <div className="relative flex items-center">
            <input
              type={showToken ? "text" : "password"}
              value={botToken} onChange={e => setBotToken(e.target.value)}
              placeholder={tokenConfigured ? "•••••••• (deixe em branco p/ manter)" : "123456:AA..."}
              className={inputCls}
              disabled={tokenSource === "env"}
            />
            <button type="button" onClick={() => setShowToken(s => !s)} className="absolute right-2 text-zinc-500 hover:text-zinc-300">
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">
            {tokenSource === "env"
              ? "Definido na env var da Vercel (tem prioridade sobre o salvo aqui)."
              : "Salvo na planilha e nunca reenviado pro navegador. A planilha é compartilhada como leitor — trate como sensível."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">Limite de alavancagem (%)</label>
          <input
            type="number" value={limite} onChange={e => setLimite(Number(e.target.value))}
            min={0} max={100} step={1} className={inputCls}
          />
        </div>
      </div>

      <ToggleRow
        title="Alertas ativos (chave geral)"
        desc="Desligado: o cron avalia, mas não envia mensagem nenhuma — desativa todos os avisos abaixo."
        on={ativo}
        onToggle={() => setAtivo(a => !a)}
      />

      {/* O que enviar — liga/desliga cada tipo de aviso individualmente */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/20 p-3 space-y-2.5">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Bell size={12} /> O que enviar
        </p>
        <ToggleRow
          title="DARF (imposto sobre vendas)"
          desc="Aviso de DARF a vencer (≤3 dias) e de DARF vencido enquanto não regularizado."
          on={darfAtivo}
          onToggle={() => setDarfAtivo(v => !v)}
          disabled={!ativo}
        />
        <ToggleRow
          title="DIRPF (declaração anual)"
          desc="Lembrete do prazo (31/05): semanal a partir de abril, diário na última semana e aviso de atraso em junho."
          on={dirpfAtivo}
          onToggle={() => setDirpfAtivo(v => !v)}
          disabled={!ativo}
        />
        <ToggleRow
          title="Alavancagem acima do limite"
          desc={`Aviso quando a alavancagem passar de ${limite}% (limite configurável acima).`}
          on={alavancagemAtivo}
          onToggle={() => setAlavancagemAtivo(v => !v)}
          disabled={!ativo}
        />
      </div>

      {/* Resumo do dia — sub-card próprio: toggle + horários de envio + ações */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/20 p-3 space-y-2.5">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Bell size={12} /> Resumo do dia (imagem)
        </p>
        <ToggleRow
          title="Enviar resumo do dia"
          desc="Card com patrimônio, resultado, mercados, melhores/piores, exposição e proventos — nos horários abaixo."
          on={resumoAtivo}
          onToggle={() => setResumoAtivo(v => !v)}
          disabled={!ativo}
        />

        {/* Horários de envio (fuso de Brasília) — o cron roda de hora em hora e
            envia só nas horas marcadas; salvar aqui já vale, sem deploy. */}
        <div className={`rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 transition-opacity ${(!ativo || !resumoAtivo) ? "opacity-40 pointer-events-none" : ""}`}>
          <p className="text-xs font-semibold text-zinc-200 mb-0.5">Horários de envio</p>
          <p className="text-[10px] text-zinc-600 mb-2">
            Horário de Brasília · {resumoHorarios.length} envio{resumoHorarios.length === 1 ? "" : "s"}/dia
            {resumoHorarios.length > 0 ? ` (${[...resumoHorarios].sort((a, b) => a - b).map(h => `${h}h`).join(", ")})` : ""}
          </p>
          <div className="grid grid-cols-8 sm:grid-cols-12 gap-1">
            {Array.from({ length: 24 }, (_, h) => {
              const on = resumoHorarios.includes(h);
              return (
                <button
                  key={h}
                  onClick={() => setResumoHorarios(prev => on ? prev.filter(x => x !== h) : [...prev, h].sort((a, b) => a - b))}
                  className={`py-1.5 text-[11px] font-mono font-semibold rounded-md border transition-colors ${
                    on
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-zinc-800 bg-zinc-800/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  {h}h
                </button>
              );
            })}
          </div>
          {resumoHorarios.length === 0 && (
            <p className="text-[10px] text-amber-400/80 mt-2">Nenhum horário marcado — o resumo não será enviado.</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSendDigest} disabled={sendingDigest || !chatId}
            className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            {sendingDigest ? "Gerando…" : "Enviar resumo agora"}
          </button>
          <a
            href={`${API_URL}/api/digest/image`} target="_blank" rel="noreferrer"
            className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            Ver imagem
          </a>
          {digestMsg && (
            <span className={`text-xs font-mono flex items-center gap-1 ${digestMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {digestMsg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {digestMsg.text}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider border border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--accent-wash)] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button
          onClick={handleTest} disabled={testing || !chatId}
          className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-40"
          style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
        >
          {testing ? "Enviando…" : "Enviar teste"}
        </button>
        {msg && (
          <span className={`text-xs font-mono flex items-center gap-1 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
            {msg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {msg.text}
          </span>
        )}
        {testMsg && (
          <span className={`text-xs font-mono flex items-center gap-1 ${testMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
            {testMsg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {testMsg.text}
          </span>
        )}
      </div>

      <p className="text-[11px] text-zinc-600 flex items-start gap-1.5">
        <Shield size={12} className="mt-0.5 flex-shrink-0" />
        O token do bot fica só na Vercel (env var, nunca na planilha). O chat_id é salvo na aba{" "}
        <code className="bg-zinc-800 px-1 rounded text-zinc-300">alertas_config</code>.
      </p>
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

// ── Ticker Audit Section (grafia Yahoo) ─────────────────────────────────────

interface TickerAuditResult {
  error?: string;
  total?: number;
  ok?: number;
  ajustes?: { ticker: string; sugestao: string; nome: string; exchange: string; ocorrencias: { ativos: number; proventos: number } }[];
  desconhecidos?: { ticker: string; ocorrencias: { ativos: number; proventos: number } }[];
  ignorados?: string[];
}

function TickerAuditSection() {
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
    key: "creme",
    label: "Creme",
    desc: "Claro e quente — creme banhado de luz da manhã, tinta café e acento cobre",
    preview: { bg: "#F6F0E2", accent: "#B4621B", text: "#2B2117", muted: "#8A7A64", pos: "#1E7A3C", neg: "#C03328" },
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

const HOLO_OPTIONS: { key: HoloStyle; label: string; desc: string }[] = [
  { key: "imersivo", label: "Imersivo", desc: "Tela cheia: espaço infinito com estrelas, Via Láctea e zoom livre — do rasante na atmosfera até a Terra virar um ponto." },
  { key: "classico", label: "Clássico", desc: "Janela compacta com bordas, como era antes — o globo abre numa moldura central." },
];

const PRIV_OPTIONS: { key: "fechado" | "aberto"; label: string; desc: string }[] = [
  { key: "fechado", label: "Olho fechado", desc: "A Home abre com os valores ocultos (•••••) — retornos do dia, Σ e patrimônio total. Percentuais continuam visíveis." },
  { key: "aberto", label: "Olho aberto", desc: "A Home abre com todos os valores visíveis, como sempre foi." },
];

function ThemeSection() {
  const { theme, setTheme, bgAnim, setBgAnim } = useTheme();
  const [holo, setHolo] = useState<HoloStyle>("imersivo");

  // Padrão do olho de privacidade da Home. O clique no olho lá vale só para a
  // sessão (sessionStorage) — este padrão decide como a Home ABRE.
  const [privDefault, setPrivDefault] = useState<"fechado" | "aberto">("fechado");

  useEffect(() => {
    setHolo(getHoloStyle());
    try { if (localStorage.getItem("home-privacy-default") === "aberto") setPrivDefault("aberto"); } catch { /* ignore */ }
  }, []);

  const savePrivDefault = (v: "fechado" | "aberto") => {
    setPrivDefault(v);
    try {
      localStorage.setItem("home-privacy-default", v);
      sessionStorage.removeItem("home-privacy"); // o novo padrão vale já na próxima visita à Home
    } catch { /* ignore */ }
  };

  const hasAnimation = theme === "ambar" || theme === "creme" || theme === "matrix" || theme === "miami" || theme === "blade" || theme === "starwars";

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

      {/* HoloGlobo — estilo de abertura do globo (clique na logo) */}
      <div className="pt-3 border-t border-zinc-800/50 space-y-2">
        <div className="flex items-center gap-2">
          <GlobeIcon size={13} className="text-cyan-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">HoloGlobo</span>
        </div>
        <p className="text-xs text-zinc-500">Como o globo abre ao clicar na logo do terminal. A escolha vale na hora, sem recarregar.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          {HOLO_OPTIONS.map((opt) => {
            const active = holo === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => { setHoloStyle(opt.key); setHolo(opt.key); }}
                className="relative text-left transition-all hover:scale-[1.01] rounded-lg"
                style={{
                  background: "rgba(8,15,20,0.6)",
                  border: active ? "2px solid rgba(103,232,249,0.6)" : "2px solid rgba(128,128,128,0.2)",
                  boxShadow: active ? "0 0 16px rgba(103,232,249,0.15)" : "none",
                  padding: 14,
                }}
              >
                {active && (
                  <div className="absolute top-2.5 right-2.5">
                    <Check size={14} className="text-cyan-300" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  {/* Mini-preview: imersivo = globo solto no espaço; clássico = globo emoldurado */}
                  <span
                    className="grid place-items-center"
                    style={{
                      width: 34, height: 34,
                      border: opt.key === "classico" ? "1px solid rgba(103,232,249,0.5)" : "1px solid transparent",
                      background: opt.key === "imersivo" ? "radial-gradient(circle at 30% 30%, rgba(103,232,249,0.12), transparent 70%)" : "transparent",
                    }}
                  >
                    <span
                      style={{
                        width: opt.key === "imersivo" ? 10 : 20,
                        height: opt.key === "imersivo" ? 10 : 20,
                        borderRadius: 999,
                        background: "radial-gradient(circle at 35% 30%, #38bdf8, #0369a1 60%, #082f49)",
                        boxShadow: "0 0 8px rgba(56,189,248,0.5)",
                      }}
                    />
                  </span>
                  <span className="font-mono text-sm font-bold text-zinc-200">{opt.label}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Privacidade — como o olho da Home abre por padrão */}
      <div className="pt-3 border-t border-zinc-800/50 space-y-2">
        <div className="flex items-center gap-2">
          <EyeOff size={13} className="text-amber-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Privacidade — olho da Home</span>
        </div>
        <p className="text-xs text-zinc-500">
          Define como a Home abre por padrão. O clique no olho lá em cima muda na hora, mas vale só até fechar o navegador — na próxima visita volta ao padrão escolhido aqui.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          {PRIV_OPTIONS.map((opt) => {
            const active = privDefault === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => savePrivDefault(opt.key)}
                className="relative text-left transition-all hover:scale-[1.01] rounded-lg"
                style={{
                  background: "rgba(20,15,8,0.6)",
                  border: active ? "2px solid rgba(232,163,61,0.6)" : "2px solid rgba(128,128,128,0.2)",
                  boxShadow: active ? "0 0 16px rgba(232,163,61,0.15)" : "none",
                  padding: 14,
                }}
              >
                {active && (
                  <div className="absolute top-2.5 right-2.5">
                    <Check size={14} className="text-amber-400" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="grid place-items-center"
                    style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(232,163,61,0.10)", border: "1px solid rgba(232,163,61,0.25)" }}
                  >
                    {opt.key === "fechado"
                      ? <EyeOff size={16} className="text-amber-400" />
                      : <Eye size={16} className="text-amber-400" />}
                  </span>
                  <span className="font-mono text-sm font-bold text-zinc-200">{opt.label}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Home — indicadores (pregões no termômetro do Σ Retorno do dia) */}
      <StreakDaysPref />
    </div>
  );
}

// ── Home — indicadores (barrinhas de pregões) ────────────────────────────────

const STREAK_PRESETS = [7, 15, 30, 60];

function StreakDaysPref() {
  const [dias, setDias] = useState<number>(STREAK_DAYS_DEFAULT);

  useEffect(() => { setDias(getStreakDays()); }, []);

  const save = (n: number) => {
    setStreakDays(n);
    setDias(getStreakDays()); // relê já clampado (2..90)
  };

  return (
    <div className="pt-3 border-t border-zinc-800/50 space-y-2">
      <div className="flex items-center gap-2">
        <Activity size={13} className="text-emerald-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Home — pregões no termômetro</span>
      </div>
      <p className="text-xs text-zinc-500">
        Quantos pregões aparecem nas barrinhas verde/vermelho abaixo do &ldquo;Σ Retorno do dia&rdquo;. Vale na hora, sem recarregar
        (limitado ao que já existe no histórico patrimonial).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {STREAK_PRESETS.map((n) => {
          const active = dias === n;
          return (
            <button
              key={n}
              onClick={() => save(n)}
              className="font-mono text-xs rounded-lg px-3 py-1.5 transition-all"
              style={{
                border: active ? "2px solid rgba(63,185,80,0.6)" : "2px solid rgba(128,128,128,0.2)",
                background: active ? "rgba(63,185,80,0.10)" : "rgba(8,15,20,0.6)",
                color: active ? "#3FB950" : "#a1a1aa",
                fontWeight: 700,
              }}
            >
              {n} dias
            </button>
          );
        })}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={STREAK_DAYS_MIN}
            max={STREAK_DAYS_MAX}
            value={dias}
            onChange={(e) => save(parseInt(e.target.value, 10))}
            className="w-20 font-mono text-xs rounded-lg px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 text-zinc-200 focus:border-emerald-500 focus:outline-none"
          />
          <span className="text-[10px] text-zinc-600">personalizado ({STREAK_DAYS_MIN}–{STREAK_DAYS_MAX})</span>
        </div>
      </div>
    </div>
  );
}

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

function AutomacoesSection() {
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

// ── Histórico patrimonial (GitHub Action) ───────────────────────────────────

function HistoricoSection() {
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

// ── APIs & Integrações (health-check) ───────────────────────────────────────

interface ApiMeta {
  key: string;
  name: string;
  category: string;
  host: string;
  purpose: string;
  keyState: "livre" | "configurada" | "opcional" | "incompleta";
  envVars: { name: string; required: boolean; present: boolean }[];
}
interface ApiResult { ok: boolean; ms: number; detail: string }

const KEY_CHIP: Record<ApiMeta["keyState"], { label: string; cls: string } | null> = {
  configurada: { label: "chave ✓", cls: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25" },
  opcional: { label: "opcional", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-600/30" },
  incompleta: { label: "config incompleta", cls: "bg-red-500/12 text-red-300 border-red-500/25" },
  livre: { label: "público", cls: "bg-sky-500/10 text-sky-300/80 border-sky-500/20" },
};

function StatusDot({ state }: { state: "idle" | "loading" | "ok" | "fail" }) {
  if (state === "loading") return <Loader2 size={13} className="animate-spin text-zinc-400 shrink-0" />;
  const c = state === "ok" ? "#34d399" : state === "fail" ? "#f87171" : "#52525b";
  return <span className="shrink-0 rounded-full" style={{ width: 9, height: 9, background: c, boxShadow: state !== "idle" ? `0 0 7px ${c}88` : undefined }} />;
}

function ApiHealthSection() {
  const [apis, setApis] = useState<ApiMeta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ApiResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testingAll, setTestingAll] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/diag/apis")
      .then(r => r.json())
      .then(d => { if (alive) { if (Array.isArray(d?.apis)) setApis(d.apis); else setErr("Falha ao carregar a lista de APIs."); } })
      .catch(() => { if (alive) setErr("Falha ao carregar a lista de APIs."); });
    return () => { alive = false; };
  }, []);

  const runOne = useCallback(async (key: string) => {
    setTesting(t => ({ ...t, [key]: true }));
    try {
      const r = await fetch(`/api/diag/apis?api=${encodeURIComponent(key)}`).then(r => r.json());
      setResults(res => ({ ...res, [key]: { ok: !!r.ok, ms: r.ms ?? 0, detail: r.detail ?? "" } }));
    } catch {
      setResults(res => ({ ...res, [key]: { ok: false, ms: 0, detail: "erro de rede" } }));
    } finally {
      setTesting(t => ({ ...t, [key]: false }));
    }
  }, []);

  const runAll = useCallback(async () => {
    if (!apis) return;
    setTestingAll(true);
    const queue = [...apis];
    const worker = async () => { while (queue.length) { const a = queue.shift(); if (a) await runOne(a.key); } };
    await Promise.all([worker(), worker(), worker(), worker()]); // pool de 4
    setTestingAll(false);
  }, [apis, runOne]);

  // Agrupa por categoria preservando a ordem do registro.
  const grupos = (() => {
    if (!apis) return [] as { categoria: string; itens: ApiMeta[] }[];
    const ordem: string[] = [];
    const mapa = new Map<string, ApiMeta[]>();
    for (const a of apis) {
      if (!mapa.has(a.category)) { mapa.set(a.category, []); ordem.push(a.category); }
      mapa.get(a.category)!.push(a);
    }
    return ordem.map(categoria => ({ categoria, itens: mapa.get(categoria)! }));
  })();

  const testadas = Object.keys(results).length;
  const okCount = Object.values(results).filter(r => r.ok).length;
  const falhaCount = testadas - okCount;

  if (err) return <p className="text-xs text-red-400">{err}</p>;
  if (!apis) return <div className="flex h-24 items-center justify-center"><Loader2 size={18} className="animate-spin text-zinc-500" /></div>;

  return (
    <div className="space-y-4">
      {/* Barra de resumo + testar todas */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="text-zinc-400"><span className="font-semibold text-zinc-200">{apis.length}</span> integrações</span>
          {testadas > 0 && (
            <>
              <span className="flex items-center gap-1.5 text-emerald-300"><StatusDot state="ok" />{okCount} ok</span>
              {falhaCount > 0 && <span className="flex items-center gap-1.5 text-red-300"><StatusDot state="fail" />{falhaCount} falha</span>}
            </>
          )}
        </div>
        <button
          onClick={runAll}
          disabled={testingAll}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/16 disabled:opacity-50"
        >
          {testingAll ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {testingAll ? "Testando…" : "Testar todas"}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Cada teste faz uma chamada leve à API (no servidor). Fonte única em <code className="rounded bg-zinc-800/60 px-1 text-[10px] text-zinc-400">lib/api-registry.ts</code> —
        toda API nova entra lá e aparece aqui automaticamente.
      </p>

      {grupos.map(({ categoria, itens }) => (
        <div key={categoria}>
          <h3 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <span className="h-px flex-1 bg-zinc-800/70" />
            {categoria}
            <span className="text-zinc-600">({itens.length})</span>
            <span className="h-px flex-1 bg-zinc-800/70" />
          </h3>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {itens.map(a => {
              const res = results[a.key];
              const isTesting = testing[a.key];
              const state = isTesting ? "loading" : res ? (res.ok ? "ok" : "fail") : "idle";
              const chip = KEY_CHIP[a.keyState];
              return (
                <div key={a.key} className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <StatusDot state={state as "idle" | "loading" | "ok" | "fail"} />
                        <span className="truncate text-sm font-semibold text-zinc-200">{a.name}</span>
                        {chip && (
                          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${chip.cls}`}>{chip.label}</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-zinc-500">{a.purpose}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">{a.host}</p>
                    </div>
                    <button
                      onClick={() => runOne(a.key)}
                      disabled={isTesting}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-800/40 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-zinc-700/50 disabled:opacity-50"
                    >
                      {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Testar
                    </button>
                  </div>
                  {res && (
                    <div className={`mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${res.ok ? "bg-emerald-500/[0.06] text-emerald-200/90" : "bg-red-500/[0.06] text-red-200/90"}`}>
                      {res.ok ? <CheckCircle2 size={12} className="shrink-0 text-emerald-400" /> : <XCircle size={12} className="shrink-0 text-red-400" />}
                      <span className="min-w-0 flex-1 truncate">{res.detail || (res.ok ? "ok" : "falhou")}</span>
                      {res.ms > 0 && <span className="shrink-0 font-mono text-[10px] text-zinc-500">{res.ms}ms</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SobreSection() {
  return (
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
                  { label: "IBKR", desc: "Flex API + CSV (sync diário)" },
                  { label: "B3", desc: "Import CSV idempotente" },
                  { label: "FMP / AlphaVantage", desc: "Holdings de ETFs" },
                  { label: "Polymarket / Kalshi", desc: "Mercados preditivos" },
                  { label: "Reddit", desc: "Inteligência de mercado" },
                  { label: "Vercel Cron", desc: "Cotações 20h · IBKR 6h (BRT)" },
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
                <p>Importações idempotentes — sem risco de duplicatas. O sync diário do IBKR (6h BRT) é <strong className="text-zinc-400">append-only</strong>: só grava o que tem data posterior ao último dado, nunca apaga nem reescreve. Modo demo (login test/test) escala valores ×15 sem expor números reais.</p>
              </div>
            </div>
          </div>
  );
}

// ── Página — cards agrupados por domínio, com navegação e busca ──────────────
// Redesign UI/UX: NADA foi removido — os mesmos 12 cards de sempre, agora
// organizados em 5 grupos com cabeçalho, pills de navegação fixas no topo e
// busca por título/palavra-chave (estilo Settings de iOS/Android).

interface CardDef { id: string; grupo: string; title: string; desc: string; icon: React.ReactNode; keywords: string; el: React.ReactNode }

// Estado agregado dos cards (1 chamada — /api/config/resumo) → chips no cabeçalho.
interface ResumoConfig {
  alertas: { ativo: boolean; chatOk: boolean; resumoAtivo: boolean } | null;
  automacoes: { ativas: number; total: number; porChave: Record<string, boolean> } | null;
  historico: { ativo: boolean } | null;
  planilha: { abas: number } | null;
  senha: { senhaSet: boolean; loginEnabled: boolean } | null;
  apis: { total: number } | null;
}
interface GrupoDef { id: string; label: string; desc: string; icon: React.ReactNode; cor: string }

const GRUPOS: GrupoDef[] = [
  { id: "aparencia", label: "Aparência", desc: "Tema, HoloGlobo, privacidade e ajustes da Home", icon: <Palette size={14} />, cor: "#E8A33D" },
  { id: "dados", label: "Dados & Planilha", desc: "Editor da gdados, base de cotações e histórico patrimonial", icon: <Database size={14} />, cor: "#3FB950" },
  { id: "sync", label: "Importação & Sync", desc: "IBKR, B3 e verificação de tickers", icon: <RefreshCw size={14} />, cor: "#38BDF8" },
  { id: "automacoes", label: "Automações & Alertas", desc: "Crons, GitHub Actions e Telegram", icon: <Zap size={14} />, cor: "#A78BFA" },
  { id: "sistema", label: "Segurança & Sistema", desc: "Senha de acesso, diagnóstico de APIs e sobre", icon: <Shield size={14} />, cor: "#F0504A" },
];

const normaliza = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function ConfiguracoesPage() {
  const [grupo, setGrupo] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [resumo, setResumo] = useState<ResumoConfig | null>(null);
  const { theme } = useTheme();

  // Deep-link: /configuracoes#dados abre direto no grupo.
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (GRUPOS.some((g) => g.id === h)) setGrupo(h);
  }, []);
  const irPara = (id: string) => {
    setGrupo(id);
    try { history.replaceState(null, "", id === "todos" ? "#" : `#${id}`); } catch { /* ignore */ }
  };

  // Estado dos cards em 1 chamada (best-effort — sem chips enquanto carrega).
  useEffect(() => {
    fetch("/api/config/resumo").then((r) => r.json()).then(setResumo).catch(() => {});
  }, []);

  const chips = (id: string): CardChip[] => {
    if (!resumo) return [];
    switch (id) {
      case "preferencias":
        return [{ label: `tema ${theme}`, tone: "muted" }];
      case "senha": {
        const s = resumo.senha; if (!s) return [];
        if (!s.loginEnabled) return [{ label: "login OFF", tone: "off" }];
        return s.senhaSet ? [{ label: "protegido", tone: "ok" }] : [{ label: "sem senha", tone: "warn" }];
      }
      case "alertas": {
        const a = resumo.alertas; if (!a) return [];
        const out: CardChip[] = [a.ativo ? { label: "ON", tone: "ok" } : { label: "OFF", tone: "off" }];
        if (a.ativo && !a.chatOk) out.push({ label: "sem chat_id", tone: "warn" });
        return out;
      }
      case "automacoes": {
        const a = resumo.automacoes; if (!a) return [];
        return [{ label: `${a.ativas}/${a.total} ativas`, tone: a.ativas === a.total ? "ok" : "warn" }];
      }
      case "historico": {
        const h = resumo.historico; if (!h) return [];
        return h.ativo ? [{ label: "gravando 3×/dia", tone: "ok" }] : [{ label: "desligado", tone: "off" }];
      }
      case "cotacoes": {
        const on = resumo.automacoes?.porChave?.["cron_cotacoes"];
        return on == null ? [] : on ? [{ label: "cron 20h ON", tone: "ok" }] : [{ label: "cron OFF", tone: "off" }];
      }
      case "flexsync": {
        const on = resumo.automacoes?.porChave?.["cron_ibkr"];
        return on == null ? [] : on ? [{ label: "sync 6h ON", tone: "ok" }] : [{ label: "sync OFF", tone: "off" }];
      }
      case "planilha":
        return resumo.planilha ? [{ label: `${resumo.planilha.abas} abas`, tone: "muted" }] : [];
      case "apis":
        return resumo.apis ? [{ label: `${resumo.apis.total} registradas`, tone: "muted" }] : [];
      default:
        return [];
    }
  };

  const cards: CardDef[] = [
    { id: "preferencias", grupo: "aparencia", title: "Preferências do Sistema", desc: "Tema visual, HoloGlobo, privacidade da Home e termômetro de pregões", icon: <Palette size={16} />, keywords: "tema dark light matrix cores hologlobo globo privacidade olho pregoes termometro home fonte", el: <ThemeSection /> },
    { id: "planilha", grupo: "dados", title: "Planilha (gdados) — Editor", desc: "Editar abas sem abrir o Google · saúde dos dados · backup CSV e restauração", icon: <FileText size={16} />, keywords: "editor abas linhas editar apagar buscar csv backup restaurar saude teste compactar twr", el: <PlanilhaCard /> },
    { id: "cotacoes", grupo: "dados", title: "Base de Cotações (Golden Source)", desc: "db_cotacoes — preços de fechamento que alimentam a Performance/TWR", icon: <Database size={16} />, keywords: "db_cotacoes precos golden source yahoo atualizar fechamento auditoria", el: <GoldenSourceSection /> },
    { id: "historico", grupo: "dados", title: "Histórico patrimonial (GitHub Action)", desc: "Série da página Patrimônio — gravada 3×/dia em dias úteis", icon: <History size={16} />, keywords: "patrimonio evolucao serie 3x dia registrar workflow", el: <HistoricoSection /> },
    { id: "importar", grupo: "sync", title: "Importar Dados (IBKR / B3)", desc: "Upload de CSV das corretoras — importação idempotente, sem duplicatas", icon: <Upload size={16} />, keywords: "importar csv arquivo corretora b3 ibkr trades proventos upload", el: <ImportSection /> },
    { id: "flexsync", grupo: "sync", title: "Sincronizar IBKR (API · sem arquivo)", desc: "Flex Web Service — trades, proventos e câmbio direto da IBKR", icon: <RefreshCw size={16} />, keywords: "flex web service token sync trades proventos automatico", el: <FlexSyncSection /> },
    { id: "tickers", grupo: "sync", title: "Tickers × Yahoo (Verificador)", desc: "Valida a grafia dos símbolos contra o Yahoo e unifica variações", icon: <ShieldCheck size={16} />, keywords: "ticker grafia sufixo .sa validar unificar simbolo", el: <TickerAuditSection /> },
    { id: "automacoes", grupo: "automacoes", title: "Automações (Cron & GitHub Actions)", desc: "Tudo que roda sozinho — com liga/desliga individual", icon: <Zap size={16} />, keywords: "cron vercel github actions ligar desligar backup cotacoes ibkr relatorio", el: <AutomacoesSection /> },
    { id: "alertas", grupo: "automacoes", title: "Alertas (Telegram)", desc: "DARF, DIRPF, alavancagem e o resumo do dia em imagem", icon: <Bell size={16} />, keywords: "telegram bot darf dirpf alavancagem resumo do dia chat_id notificacao", el: <AlertasSection /> },
    { id: "senha", grupo: "sistema", title: "Segurança — Senha de Acesso", desc: "Senha do app e quais páginas exigem login", icon: <Lock size={16} />, keywords: "senha password login protecao paginas bloquear", el: <PasswordSection /> },
    { id: "apis", grupo: "sistema", title: "APIs & Integrações (Diagnóstico)", desc: "Catálogo de todas as APIs externas, com teste de saúde por serviço", icon: <Activity size={16} />, keywords: "api health teste probe chave env yahoo bcb gemini telegram diagnostico", el: <ApiHealthSection /> },
    { id: "sobre", grupo: "sistema", title: "Sobre o Sistema", desc: "Stack, motores de cálculo, módulos e integrações", icon: <Info size={16} />, keywords: "stack versao motores modulos integracoes seguranca", el: <SobreSection /> },
  ];

  const q = normaliza(busca.trim());
  const filtrados = q
    ? cards.filter((c) => normaliza(c.title).includes(q) || normaliza(c.keywords).includes(q))
    : grupo === "todos" ? cards : cards.filter((c) => c.grupo === grupo);

  const gruposVisiveis = GRUPOS.filter((g) => filtrados.some((c) => c.grupo === g.id));

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Aparência, dados, sincronização, automações e segurança — tudo num lugar só."
      />

      <div className="max-w-4xl">
        {/* Barra fixa: busca + navegação por grupo */}
        <div className="sticky top-0 z-30 -mt-2 mb-4 py-3 space-y-2.5" style={{ background: "color-mix(in srgb, var(--bg) 92%, transparent)", backdropFilter: "blur(8px)" }}>
          <div className="relative max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar configuração… (ex.: tema, backup, telegram, senha)"
              className="w-full bg-zinc-900/80 border border-zinc-700/80 rounded-xl pl-9 pr-8 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
            />
            {busca && (
              <button onClick={() => setBusca("")} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                <XCircle size={14} />
              </button>
            )}
          </div>

          {!q && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              <button
                onClick={() => irPara("todos")}
                className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors"
                style={grupo === "todos"
                  ? { background: "var(--text)", color: "var(--bg)" }
                  : { border: "1px solid var(--line-strong)", color: "var(--muted)" }}
              >
                Tudo
              </button>
              {GRUPOS.map((g) => {
                const ativo = grupo === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => irPara(g.id)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors"
                    style={ativo
                      ? { background: `${g.cor}1f`, border: `1px solid ${g.cor}80`, color: g.cor }
                      : { border: "1px solid var(--line-strong)", color: "var(--muted)" }}
                  >
                    {g.icon} {g.label}
                    <span className="font-mono opacity-60">{cards.filter((c) => c.grupo === g.id).length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {q && (
          <p className="mb-3 text-xs font-mono text-zinc-500">
            {filtrados.length === 0 ? "Nada encontrado — tente outra palavra" : `${filtrados.length} resultado(s) para “${busca.trim()}”`}
          </p>
        )}

        {gruposVisiveis.map((g) => (
          <section key={g.id} className="mb-6">
            {/* Cabeçalho do grupo */}
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="grid place-items-center rounded-lg" style={{ width: 28, height: 28, background: `${g.cor}14`, border: `1px solid ${g.cor}40`, color: g.cor }}>
                {g.icon}
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: g.cor }}>{g.label}</p>
                <p className="text-[11px] text-zinc-600">{g.desc}</p>
              </div>
            </div>
            {filtrados.filter((c) => c.grupo === g.id).map((c) => (
              <SectionCard key={c.id} id={c.id} title={c.title} desc={c.desc} icon={c.icon} chips={chips(c.id)}>
                {c.el}
              </SectionCard>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
