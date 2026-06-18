"use client";

import React, { useState, useEffect } from "react";
import { Wallet, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { compactBRL } from "@/lib/format";
import { bumpDataVersion } from "@/lib/data-version";
import PageHeader from "@/components/PageHeader";

// ── Types ────────────────────────────────────────────────────────────────────

interface CaixaPos {
  ticker: string;
  atual: number;
  moeda: string;
}

interface FxRates {
  USDBRL: number;
  EURBRL: number;
  CADBRL: number;
  GBPBRL: number;
}

// ── CaixaManager ─────────────────────────────────────────────────────────────

function CaixaManager({ fx }: { fx?: FxRates }) {
  const [positions, setPositions] = useState<CaixaPos[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/renda-fixa/caixa")
      .then(r => r.json())
      .then(d => setPositions(d.caixa ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = (idx: number, field: keyof CaixaPos, value: string | number) => {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    setDirty(true);
    setMessage(null);
  };

  const add = () => {
    setPositions(prev => [...prev, { ticker: "CAIXA", atual: 0, moeda: "BRL" }]);
    setDirty(true);
    setMessage(null);
  };

  const remove = (idx: number) => {
    setPositions(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/renda-fixa/caixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      const d = await res.json();
      if (res.ok) {
        setDirty(false);
        setMessage({ type: "ok", text: `Salvo — ${d.saved} posição(ões) de caixa. Recalculando…` });
        bumpDataVersion();
        setTimeout(() => window.location.reload(), 900);
      } else {
        setMessage({ type: "err", text: d.error ?? "Erro ao salvar" });
      }
    } catch {
      setMessage({ type: "err", text: "Erro de rede" });
    }
    setSaving(false);
  };

  const fxRates: Record<string, number> = {
    BRL: 1,
    USD: fx?.USDBRL ?? 1,
    EUR: fx?.EURBRL ?? 1,
    CAD: fx?.CADBRL ?? 1,
    GBP: fx?.GBPBRL ?? 1,
  };
  const toBRL = (val: number, moeda: string) => val * (fxRates[moeda] ?? 1);
  const totalBRL = positions.reduce((s, p) => s + toBRL(p.atual, p.moeda), 0);

  if (loading) {
    return (
      <div className="glass-card p-8 text-center animate-fade-in">
        <Loader2 size={20} className="animate-spin text-zinc-500 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Caixa / Liquidez</h2>
            <span className="text-xs text-zinc-500">({positions.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={add}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80" }}
            >
              <Plus size={12} /> Adicionar
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-40"
              style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-zinc-600">Nenhuma posição de caixa</p>
            <p className="text-[10px] text-zinc-700 mt-1">Clique em &quot;Adicionar&quot; para criar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Nome</th>
                  <th className="text-left py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Moeda</th>
                  <th className="text-right py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Valor</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {positions.map((p, i) => (
                  <tr key={i} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={p.ticker}
                        onChange={e => update(i, "ticker", e.target.value)}
                        className="bg-transparent text-xs text-zinc-200 font-semibold outline-none border-b border-transparent focus:border-emerald-400/30 w-full transition-colors"
                        placeholder="CAIXA"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={p.moeda}
                        onChange={e => update(i, "moeda", e.target.value)}
                        className="bg-transparent text-xs text-zinc-400 outline-none cursor-pointer"
                      >
                        <option value="BRL">BRL</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="CAD">CAD</option>
                        <option value="JPY">JPY</option>
                        <option value="CHF">CHF</option>
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        value={p.atual || ""}
                        onChange={e => update(i, "atual", Number(e.target.value))}
                        className="bg-transparent text-xs text-zinc-200 font-mono text-right outline-none border-b border-transparent focus:border-emerald-400/30 w-full transition-colors"
                        placeholder="0.00"
                        min={0}
                        step={0.01}
                      />
                      {p.moeda !== "BRL" && p.atual > 0 && (
                        <div className="text-[9px] text-zinc-600 text-right mt-0.5">&asymp; {compactBRL(toBRL(p.atual, p.moeda))}</div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button onClick={() => remove(i)} className="text-zinc-700 hover:text-red-400 transition-colors p-0.5">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-800 font-semibold">
                  <td className="py-2.5 px-2 text-zinc-300" colSpan={2}>Total</td>
                  <td className="py-2.5 px-2 text-right text-zinc-200 font-mono">{compactBRL(totalBRL)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {message && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-[10px] font-semibold ${message.type === "ok" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20" : "bg-red-400/10 text-red-400 border border-red-400/20"}`}>
            {message.text}
          </div>
        )}
      </div>

      <div className="glass-card p-4">
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Posições de caixa são lidas da aba <strong className="text-zinc-500">fixa_aberta</strong> da planilha.
          Tickers reconhecidos como caixa: CAIXA, SALDO, CASH, RESERVA.
          Ao salvar, apenas as linhas de caixa são atualizadas — posições de renda fixa não são alteradas.
        </p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CaixaPage() {
  const [fx, setFx] = useState<FxRates | undefined>(undefined);
  const [fxLoading, setFxLoading] = useState(true);

  useEffect(() => {
    fetch("/api/composicao/resumo")
      .then(r => r.json())
      .then(d => setFx(d.fx))
      .catch(() => {})
      .finally(() => setFxLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title="Caixa" description="Saldos de caixa e disponibilidades" />

      {fxLoading ? (
        <div className="glass-card p-8 text-center animate-fade-in">
          <Loader2 size={20} className="animate-spin text-zinc-500 mx-auto" />
        </div>
      ) : (
        <CaixaManager fx={fx} />
      )}
    </main>
  );
}
