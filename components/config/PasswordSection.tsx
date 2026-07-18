"use client";

// Extraído de app/configuracoes/page.tsx — seção "Segurança — Senha de Acesso"
// (exigir login, alterar senha e páginas protegidas).

import { useState, useEffect } from "react";
import {
  Settings, Lock, CheckCircle2, XCircle, Shield, Check,
  Eye, EyeOff, KeyRound, ShieldCheck, Loader2,
} from "lucide-react";
import { API_URL } from "@/components/config/shared";

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

export default function PasswordSection() {
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
