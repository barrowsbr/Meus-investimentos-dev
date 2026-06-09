"use client";

import { useState, useEffect, type FormEvent } from "react";
import Image from "next/image";
import { Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";

const AUTH_KEY = "mi_auth";
const COTACOES_KEY = "mi_cotacoes_sync";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAuthed(sessionStorage.getItem(AUTH_KEY) === "1");
    setMounted(true);
  }, []);

  // Auto-update golden source once per day after login
  useEffect(() => {
    if (!authed) return;
    const today = new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(COTACOES_KEY) === today) return;
    sessionStorage.setItem(COTACOES_KEY, today);
    fetch("/api/sync/cotacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", lookback_years: 1 }),
    }).catch(() => {});
  }, [authed]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: user.trim(), password: pass }),
      });
      const data = await res.json();
      if (data.ok) {
        sessionStorage.setItem(AUTH_KEY, "1");
        setAuthed(true);
      } else {
        setError("Usuário ou senha incorretos.");
        setPass("");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;
  if (authed) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0" style={{ background: "#0D0E11" }} />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(212,165,116,0.10) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(20,184,166,0.06) 0%, transparent 55%)",
        }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm animate-fade-in">
        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/midias/carregamento.png"
            alt="Meus Investimentos"
            width={120}
            height={120}
            className="h-20 w-auto mb-5"
            priority
          />
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{
              background: "linear-gradient(135deg, #d4a574 0%, #f5d49a 50%, #c49060 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Meus Investimentos
          </h1>
          <p className="text-[11px] text-zinc-600 mt-1.5 tracking-widest uppercase">
            Painel Financeiro Pessoal
          </p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-px"
          style={{
            background: "linear-gradient(145deg, rgba(212,165,116,0.35) 0%, rgba(212,165,116,0.08) 50%, rgba(212,165,116,0.22) 100%)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          <div
            className="rounded-[calc(1rem-1px)] p-6 backdrop-blur-xl"
            style={{ background: "rgba(17,18,24,0.92)" }}
          >
            <div className="flex items-center gap-2 mb-5">
              <ShieldCheck size={15} className="text-[#d4a574]" />
              <span className="text-sm font-semibold text-zinc-200">Acesso restrito</span>
            </div>

            {/* Usuário */}
            <label className="block mb-3.5">
              <span className="text-[11px] text-zinc-500 font-medium mb-1.5 block uppercase tracking-wide">
                Usuário
              </span>
              <div className="relative">
                <User
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                />
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="characters"
                  placeholder="Seu usuário"
                  className="w-full bg-white/[0.03] border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-700 outline-none transition-colors focus:border-[#d4a574]/50 focus:bg-white/[0.05]"
                />
              </div>
            </label>

            {/* Senha */}
            <label className="block mb-2">
              <span className="text-[11px] text-zinc-500 font-medium mb-1.5 block uppercase tracking-wide">
                Senha
              </span>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                />
                <input
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••"
                  className="w-full bg-white/[0.03] border border-zinc-800 rounded-xl pl-9 pr-10 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-700 outline-none transition-colors focus:border-[#d4a574]/50 focus:bg-white/[0.05]"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                  tabIndex={-1}
                  aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            {/* Error */}
            {error && (
              <p className="text-red-400 text-xs mt-2 mb-1 animate-fade-in">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !user || !pass}
              className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-zinc-900 transition-all duration-200 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #f5d49a 0%, #d4a574 50%, #c49060 100%)",
                boxShadow: "0 4px 20px rgba(212,165,116,0.25)",
              }}
            >
              {submitting ? "Verificando…" : "Entrar"}
              {!submitting && <ArrowRight size={15} />}
            </button>
          </div>
        </form>

        <p className="text-center text-[10px] text-zinc-700 mt-6 tracking-wider uppercase">
          v1.0 · Personal
        </p>
      </div>
    </div>
  );
}
