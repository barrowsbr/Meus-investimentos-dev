"use client";

// Extraído de app/configuracoes/page.tsx — seção "Preferências do Sistema"
// (tema visual, HoloGlobo, privacidade da Home e termômetro de pregões).

import { useState, useEffect } from "react";
import { Check, Eye, EyeOff, Globe as GlobeIcon } from "lucide-react";
import { useTheme, type Theme } from "@/components/terminal";
import { getHoloStyle, setHoloStyle, type HoloStyle } from "@/lib/holo-style";
import StreakDaysPref from "@/components/config/StreakDaysPref";

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

export default function ThemeSection() {
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
