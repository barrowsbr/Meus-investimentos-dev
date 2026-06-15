"use client";

import { useState, useEffect, type FormEvent } from "react";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";

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

  const inputStyle: React.CSSProperties = {
    background: "var(--input)",
    border: "1px solid var(--line-strong)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="w-full animate-fade-in" style={{ maxWidth: 380, background: "var(--panel)", border: "1px solid var(--line)" }}>
        {/* Marca */}
        <div className="flex items-center gap-3" style={{ padding: "26px 32px 20px", borderBottom: "1px solid var(--line)" }}>
          <Image src="/barroots-mark.png" alt="Barroots" width={36} height={36} className="object-contain" />
          <div>
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, letterSpacing: ".12em", color: "var(--text)" }}>
              BARROOTS
            </div>
            <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".2em", color: "var(--faint)", marginTop: 2 }}>
              TERMINAL · v2.0
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "24px 32px 28px" }}>
          <div
            className="font-mono"
            style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 14 }}
          >
            Acesso restrito
          </div>

          {/* Usuário */}
          <label className="block mb-3">
            <span className="t-label block mb-1.5">Usuário</span>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              autoCapitalize="characters"
              placeholder="usuário"
              className="w-full px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)]"
              style={inputStyle}
            />
          </label>

          {/* Senha */}
          <label className="block mb-3.5">
            <span className="t-label block mb-1.5">Senha</span>
            <div className="relative flex items-center" style={inputStyle}>
              <span className="pl-3" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>&gt;</span>
              <input
                type={showPass ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="current-password"
                placeholder="••••"
                className="flex-1 bg-transparent border-0 px-2 py-2.5 text-sm outline-none"
                style={{ color: "var(--text)", fontFamily: "var(--font-mono)", letterSpacing: ".15em" }}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="px-3"
                style={{ color: "var(--muted)" }}
                tabIndex={-1}
                aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          {error && (
            <p className="font-mono mb-2" style={{ fontSize: 11, color: "var(--neg)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !user || !pass}
            className="w-full font-mono uppercase disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              padding: "12px",
              border: "1px solid var(--accent)",
              background: "var(--accent-wash)",
              color: "var(--accent)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".12em",
            }}
          >
            {submitting ? "Verificando…" : "Entrar ↵"}
          </button>

          <div className="font-mono" style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 18, lineHeight: 1.7 }}>
            ● SESSÃO SEGURA · DADOS LOCAIS
            <br />
            FONTE db_cotacoes · GOOGLE SHEETS
          </div>
        </form>
      </div>
    </div>
  );
}
