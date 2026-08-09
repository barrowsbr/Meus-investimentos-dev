"use client";

// Peças de UI compartilhadas da página Finanças (Gastos + Renda).
// Extraídas na reescrita de ago/2026 — mesmas peças visuais da página antiga.

import React, { useState } from "react";
import { ChevronDown, ChevronUp, X, Check, AlertCircle, Loader2 } from "lucide-react";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "readonly";

export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const cfg: Record<SaveStatus, { icon: React.ReactNode; text: string; cls: string }> = {
    idle: { icon: null, text: "", cls: "" },
    saving: { icon: <Loader2 size={12} className="animate-spin" />, text: "Salvando...", cls: "text-zinc-500" },
    saved: { icon: <Check size={12} />, text: "Salvo", cls: "text-emerald-500" },
    error: { icon: <AlertCircle size={12} />, text: "Erro ao salvar", cls: "text-red-400" },
    readonly: { icon: <AlertCircle size={12} />, text: "Somente leitura", cls: "text-amber-400" },
  };
  const c = cfg[status];
  return (
    <div className={`flex items-center gap-1 text-xs font-medium ${c.cls}`}>
      {c.icon}<span>{c.text}</span>
    </div>
  );
}

export function Section({
  icon, title, badge, defaultOpen = false, children,
}: {
  icon: React.ReactNode; title: string; badge?: React.ReactNode;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card mb-3 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-zinc-500">{icon}</span>
          <span className="text-sm font-semibold text-zinc-200">{title}</span>
          {badge}
        </div>
        {open
          ? <ChevronUp size={15} className="text-zinc-600 flex-shrink-0" />
          : <ChevronDown size={15} className="text-zinc-600 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-white/[0.04]">
          {children}
        </div>
      )}
    </div>
  );
}

export function ItemRow({
  name, value, sub, color = "text-zinc-200", badgeCls, badgeLabel, onRemove,
}: {
  name: React.ReactNode; value: string; sub?: string;
  color?: string; badgeCls?: string; badgeLabel?: string; onRemove?: () => void;
}) {
  return (
    <div className="flex items-center py-2.5 border-b border-white/[0.03] last:border-0 gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-200 truncate">{name}</div>
        {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
      </div>
      {badgeLabel && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide flex-shrink-0 ${badgeCls}`}>
          {badgeLabel}
        </span>
      )}
      <div className={`text-sm font-bold flex-shrink-0 ${color}`}>{value}</div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-700 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function TotRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/[0.05]">
      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{label}</span>
      <span className={`text-base font-bold ${color}`}>{value}</span>
    </div>
  );
}

export function Field({
  label, value, onChange, placeholder, type = "text", min, max, step,
}: {
  label?: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; type?: string; min?: string; max?: string; step?: string;
}) {
  return (
    <div>
      {label && <div className="text-xs text-zinc-600 mb-1">{label}</div>}
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} min={min} max={max} step={step}
        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm
                   text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-accent/40
                   focus:ring-1 focus:ring-accent/20 transition-colors"
      />
    </div>
  );
}

export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const monthLabel = (d: Date) => `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
