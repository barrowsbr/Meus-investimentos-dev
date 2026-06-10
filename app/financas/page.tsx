"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Wallet, CreditCard, TrendingUp, TrendingDown, Repeat, ReceiptText,
  ChevronDown, ChevronUp, X, Check, AlertCircle, Loader2,
  CalendarDays, PiggyBank, Plus,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import { brl } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RowMensal {
  categoria: "entrada" | "saida" | "cartao" | "poupanca";
  nome: string;
  valor: number;
}
interface Assinatura {
  nome: string;
  valor: number;
  dia: number;
  ativa: boolean;
}
interface Parcelamento {
  nome: string;
  valor_total: number;
  parcelas: number;
  data_compra: string;
}
interface ParcelamentoCalc extends Parcelamento {
  parcelaAtual: number;
  restantes: number;
  valorParcela: number;
  valorRestante: number;
  quitado: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error" | "readonly";

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseMensalRows(raw: Record<string, unknown>[]): RowMensal[] {
  if (!raw.length) return defaultMensalRows();
  const result = raw
    .filter(r => r.categoria && r.nome)
    .map(r => ({
      categoria: (String(r.categoria ?? "entrada").toLowerCase().trim()) as RowMensal["categoria"],
      nome: String(r.nome ?? "").trim(),
      valor: typeof r.valor === "number" ? r.valor
        : parseFloat(String(r.valor ?? "0").replace(",", ".")) || 0,
    }));
  // Ensure at least one poupanca row
  if (!result.some(r => r.categoria === "poupanca")) {
    result.push({ categoria: "poupanca", nome: "Poupança Esperada", valor: 0 });
  }
  return result;
}

function defaultMensalRows(): RowMensal[] {
  return [
    { categoria: "entrada", nome: "Salário Lucas", valor: 0 },
    { categoria: "entrada", nome: "Benefícios Lucas", valor: 0 },
    { categoria: "entrada", nome: "Salário Maria", valor: 0 },
    { categoria: "entrada", nome: "Benefícios Maria", valor: 0 },
    { categoria: "saida", nome: "Luz", valor: 0 },
    { categoria: "saida", nome: "Gás", valor: 0 },
    { categoria: "saida", nome: "Condomínio", valor: 0 },
    { categoria: "saida", nome: "Aluguel", valor: 0 },
    { categoria: "cartao", nome: "XP", valor: 0 },
    { categoria: "cartao", nome: "Nubank Lucas", valor: 0 },
    { categoria: "cartao", nome: "Nubank Maria", valor: 0 },
    { categoria: "cartao", nome: "AMEX", valor: 0 },
    { categoria: "poupanca", nome: "Poupança Esperada", valor: 0 },
  ];
}

function parseAssinaturas(raw: Record<string, unknown>[]): Assinatura[] {
  return raw
    .filter(r => r.nome)
    .map(r => {
      const av = r.ativa;
      let ativa = true;
      if (typeof av === "boolean") ativa = av;
      else if (av != null) {
        ativa = !["false", "0", "inativo", "não", "nao"].includes(String(av).toLowerCase().trim());
      }
      return {
        nome: String(r.nome ?? "").trim(),
        valor: typeof r.valor === "number" ? r.valor
          : parseFloat(String(r.valor ?? "0").replace(",", ".")) || 0,
        dia: typeof r.dia === "number" ? r.dia : parseInt(String(r.dia ?? "0")) || 0,
        ativa,
      };
    });
}

function parseParcelamentos(raw: Record<string, unknown>[]): Parcelamento[] {
  return raw
    .filter(r => r.nome)
    .map(r => ({
      nome: String(r.nome ?? "").trim(),
      valor_total: typeof r.valor_total === "number" ? r.valor_total
        : parseFloat(String(r.valor_total ?? "0").replace(",", ".")) || 0,
      parcelas: typeof r.parcelas === "number" ? Math.max(r.parcelas, 1)
        : Math.max(parseInt(String(r.parcelas ?? "1")) || 1, 1),
      data_compra: String(r.data_compra ?? "").trim(),
    }));
}

// ─── Parcelamento calculation ─────────────────────────────────────────────────

function calcParcelamento(p: Parcelamento): ParcelamentoCalc {
  const today = new Date();
  let dt: Date = today;
  try {
    const s = p.data_compra;
    if (s.includes("-")) {
      const [y, m, d] = s.split("-").map(Number);
      dt = new Date(y, m - 1, d);
    } else if (s.includes("/")) {
      const parts = s.split("/");
      if (parts.length === 3) {
        dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      }
    }
    if (isNaN(dt.getTime())) dt = today;
  } catch { dt = today; }

  const monthsElapsed =
    (today.getFullYear() - dt.getFullYear()) * 12 + (today.getMonth() - dt.getMonth());
  const n = Math.max(p.parcelas, 1);
  const quitado = monthsElapsed >= n;
  const parcelaAtual = Math.max(Math.min(monthsElapsed + 1, n), 1);
  const restantes = Math.max(n - parcelaAtual, 0);
  const valorParcela = p.valor_total / n;
  const valorRestante = !quitado ? valorParcela * (restantes + 1) : 0;

  return { ...p, parcelaAtual, restantes, valorParcela, valorRestante, quitado };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function monthLabel(d: Date): string {
  return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

function formatDateDisplay(s: string): string {
  if (!s) return "—";
  if (s.includes("-")) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "#6366f1","#f87171","#fbbf24","#34d399","#22d3ee",
  "#a78bfa","#fb923c","#f472b6","#64748b",
];

// ─── Small components ─────────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: SaveStatus }) {
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

function Section({
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

function ItemRow({
  name, value, sub, color = "text-zinc-200", badgeCls, badgeLabel, onRemove,
}: {
  name: React.ReactNode; value: string; sub?: string;
  color?: string; badgeCls?: string; badgeLabel?: string; onRemove: () => void;
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
      <button
        onClick={onRemove}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-700 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function TotRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/[0.05]">
      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{label}</span>
      <span className={`text-base font-bold ${color}`}>{value}</span>
    </div>
  );
}

function Field({
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

// ─── Mensal Tab ───────────────────────────────────────────────────────────────

function MensalTab({
  rows, setRows,
}: {
  rows: RowMensal[];
  setRows: (fn: (prev: RowMensal[]) => RowMensal[]) => void;
}) {
  const entradas = rows.filter(r => r.categoria === "entrada");
  const saidas   = rows.filter(r => r.categoria === "saida");
  const cartoes  = rows.filter(r => r.categoria === "cartao");
  const poupRow  = rows.find(r => r.categoria === "poupanca");

  const tEnt = entradas.reduce((s, r) => s + r.valor, 0);
  const tSai = saidas.reduce((s, r) => s + r.valor, 0);
  const tCar = cartoes.reduce((s, r) => s + r.valor, 0);
  const meta = poupRow?.valor ?? 0;
  const saldo = tEnt - tSai - tCar;
  const livre = saldo - meta;

  const today = new Date();
  const diasMes = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const diasRest = Math.max(diasMes - today.getDate(), 1);
  const mediaDia = livre / diasRest;

  // Add form states
  const [novoEntNome, setNovoEntNome] = useState("");
  const [novoEntVal, setNovoEntVal]   = useState("");
  const [novoSaiNome, setNovoSaiNome] = useState("");
  const [novoSaiVal, setNovoSaiVal]   = useState("");
  const [novoCarNome, setNovoCarNome] = useState("");
  const [novoCarVal, setNovoCarVal]   = useState("");

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }

  function updateCartaoValor(nome: string, val: number) {
    setRows(prev => prev.map(r =>
      r.categoria === "cartao" && r.nome === nome ? { ...r, valor: val } : r
    ));
  }

  function updatePoupanca(val: number) {
    setRows(prev => prev.map(r =>
      r.categoria === "poupanca" ? { ...r, valor: val } : r
    ));
  }

  function addEntrada() {
    if (!novoEntNome) return;
    setRows(prev => [...prev, { categoria: "entrada", nome: novoEntNome, valor: parseFloat(novoEntVal) || 0 }]);
    setNovoEntNome(""); setNovoEntVal("");
  }

  function addSaida() {
    if (!novoSaiNome) return;
    setRows(prev => [...prev, { categoria: "saida", nome: novoSaiNome, valor: parseFloat(novoSaiVal) || 0 }]);
    setNovoSaiNome(""); setNovoSaiVal("");
  }

  function addCartao() {
    if (!novoCarNome) return;
    setRows(prev => [...prev, { categoria: "cartao", nome: novoCarNome, valor: parseFloat(novoCarVal) || 0 }]);
    setNovoCarNome(""); setNovoCarVal("");
  }

  const saldoCls = saldo >= 0 ? "text-emerald-400" : "text-red-400";
  const livreCls = livre >= 0 ? "text-cyan-400" : "text-red-400";
  const metaAtingivel = meta > 0 && saldo >= meta;

  return (
    <div>
      {/* ── Dashboard card */}
      <div className={`glass-card mb-4 p-4 ${saldo >= 0 ? "border-emerald-500/10" : "border-red-500/10"}`}>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: "Entradas", val: tEnt, pctVal: 100, color: "text-emerald-400" },
            { label: "Fixas", val: tSai, pctVal: tSai / tEnt * 100, color: "text-red-400" },
            { label: "Cartão", val: tCar, pctVal: tCar / tEnt * 100, color: "text-amber-400" },
            { label: "Meta Poup.", val: meta, pctVal: meta / tEnt * 100, color: "text-violet-400" },
          ].map(item => (
            <div key={item.label} className="text-center">
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{item.label}</div>
              <div className={`text-sm font-bold mt-0.5 ${item.color}`}>{brl(item.val)}</div>
              <div className="text-[10px] text-zinc-700 mt-0.5">
                {tEnt > 0 ? `${item.pctVal.toFixed(0)}%` : "–"}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.05] pt-3 text-center">
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest">
            Saldo · {tEnt > 0 ? `${Math.abs(saldo / tEnt * 100).toFixed(0)}% da receita` : "—"}
          </div>
          <div className={`text-3xl font-black tracking-tight mt-1 ${saldoCls}`}>
            {brl(saldo)}
          </div>
          {meta > 0 && (
            <div className="flex items-center justify-center gap-2 mt-2 text-xs">
              <span className="text-zinc-600">Meta: <span className="text-violet-400 font-bold">{brl(meta)}</span></span>
              <span className={`px-1.5 py-0.5 rounded-md font-bold text-[10px] uppercase ${metaAtingivel ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                {metaAtingivel ? "✓ Atingível" : "✗ Insuficiente"}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-white/[0.05]">
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Livre p/ gastar</div>
            <div className={`text-base font-bold mt-0.5 ${livreCls}`}>{brl(livre)}</div>
          </div>
          <div className="w-px h-8 bg-white/[0.05]" />
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{diasRest}d restantes</div>
            <div className={`text-base font-bold mt-0.5 ${livreCls}`}>{brl(mediaDia)}/dia</div>
          </div>
        </div>
      </div>

      {/* ── Entradas */}
      <Section
        icon={<TrendingUp size={15} />}
        title="Entradas"
        badge={<span className="text-xs font-bold text-emerald-400">{brl(tEnt)}</span>}
      >
        {entradas.map((r, i) => (
          <ItemRow
            key={i}
            name={r.nome}
            value={brl(r.valor)}
            sub="entrada mensal"
            color="text-emerald-400"
            badgeLabel="receita"
            badgeCls="bg-emerald-500/10 text-emerald-500"
            onRemove={() => removeRow(rows.indexOf(r))}
          />
        ))}
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="text-xs text-zinc-600 mb-2">Nova entrada</div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field placeholder="Nome (ex: Freelance)" value={novoEntNome} onChange={setNovoEntNome} />
            </div>
            <div className="w-36">
              <Field placeholder="R$ 0,00" type="number" min="0" step="100" value={novoEntVal} onChange={setNovoEntVal} />
            </div>
            <button
              onClick={addEntrada}
              className="px-3 py-2 bg-emerald-500/15 text-emerald-400 rounded-xl hover:bg-emerald-500/25 transition-colors flex-shrink-0"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <TotRow label="Total Entradas" value={brl(tEnt)} color="text-emerald-400" />
      </Section>

      {/* ── Contas Fixas */}
      <Section
        icon={<TrendingDown size={15} />}
        title="Contas Fixas"
        badge={<span className="text-xs font-bold text-red-400">{brl(tSai)}</span>}
      >
        {saidas.map((r, i) => (
          <ItemRow
            key={i}
            name={r.nome}
            value={brl(r.valor)}
            sub="conta fixa"
            color="text-red-400"
            badgeLabel="fixo"
            badgeCls="bg-red-500/10 text-red-500"
            onRemove={() => removeRow(rows.indexOf(r))}
          />
        ))}
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="text-xs text-zinc-600 mb-2">Nova conta fixa</div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field placeholder="Nome (ex: Internet)" value={novoSaiNome} onChange={setNovoSaiNome} />
            </div>
            <div className="w-36">
              <Field placeholder="R$ 0,00" type="number" min="0" step="50" value={novoSaiVal} onChange={setNovoSaiVal} />
            </div>
            <button
              onClick={addSaida}
              className="px-3 py-2 bg-red-500/15 text-red-400 rounded-xl hover:bg-red-500/25 transition-colors flex-shrink-0"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <TotRow label="Total Fixas" value={brl(tSai)} color="text-red-400" />
      </Section>

      {/* ── Cartões */}
      <Section
        icon={<CreditCard size={15} />}
        title="Cartões"
        badge={<span className="text-xs font-bold text-amber-400">{brl(tCar)}</span>}
      >
        <div className="grid grid-cols-2 gap-3 mt-2">
          {cartoes.map((r, i) => (
            <div key={i} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-400">{r.nome}</span>
                <button
                  onClick={() => removeRow(rows.indexOf(r))}
                  className="text-zinc-700 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="100"
                value={r.valor}
                onChange={e => updateCartaoValor(r.nome, parseFloat(e.target.value) || 0)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-sm
                           font-bold text-amber-400 focus:outline-none focus:border-accent/40 transition-colors"
              />
              <div className="text-[10px] text-zinc-700 mt-1 text-right">fatura</div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="text-xs text-zinc-600 mb-2">Novo cartão</div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field placeholder="Nome do cartão" value={novoCarNome} onChange={setNovoCarNome} />
            </div>
            <div className="w-36">
              <Field placeholder="R$ 0,00" type="number" min="0" step="100" value={novoCarVal} onChange={setNovoCarVal} />
            </div>
            <button
              onClick={addCartao}
              className="px-3 py-2 bg-amber-500/15 text-amber-400 rounded-xl hover:bg-amber-500/25 transition-colors flex-shrink-0"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <TotRow label="Total Cartões" value={brl(tCar)} color="text-amber-400" />
      </Section>

      {/* ── Poupança */}
      <Section
        icon={<PiggyBank size={15} />}
        title="Meta de Poupança"
        badge={<span className="text-xs font-bold text-violet-400">{brl(meta)}</span>}
      >
        <div className="mt-2">
          <div className="text-xs text-zinc-600 mb-1">Meta mensal</div>
          <input
            type="number"
            min="0"
            step="100"
            value={poupRow?.valor ?? 0}
            onChange={e => updatePoupanca(parseFloat(e.target.value) || 0)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-base
                       font-bold text-violet-400 focus:outline-none focus:border-violet-500/40 transition-colors"
          />
        </div>
        <TotRow label="Meta Mensal" value={brl(meta)} color="text-violet-400" />
      </Section>
    </div>
  );
}

// ─── Assinaturas Tab ──────────────────────────────────────────────────────────

function AssinaturasTab({
  assinaturas, setAssinaturas,
}: {
  assinaturas: Assinatura[];
  setAssinaturas: (fn: (prev: Assinatura[]) => Assinatura[]) => void;
}) {
  const ativas   = assinaturas.filter(a => a.ativa);
  const inativas = assinaturas.filter(a => !a.ativa);
  const totalMensal = ativas.reduce((s, a) => s + a.valor, 0);
  const totalAnual  = totalMensal * 12;

  const [novoNome, setNovoNome] = useState("");
  const [novoVal, setNovoVal]   = useState("");
  const [novoDia, setNovoDia]   = useState("");

  function toggle(idx: number) {
    setAssinaturas(prev => prev.map((a, i) => i === idx ? { ...a, ativa: !a.ativa } : a));
  }

  function remove(idx: number) {
    setAssinaturas(prev => prev.filter((_, i) => i !== idx));
  }

  function add() {
    if (!novoNome) return;
    setAssinaturas(prev => [...prev, {
      nome: novoNome,
      valor: parseFloat(novoVal) || 0,
      dia: parseInt(novoDia) || 0,
      ativa: true,
    }]);
    setNovoNome(""); setNovoVal(""); setNovoDia("");
  }

  return (
    <div>
      {/* Dashboard */}
      <div className="glass-card mb-4 p-4">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Ativas</div>
            <div className="text-xl font-black text-cyan-400 mt-0.5">{ativas.length}</div>
            <div className="text-[10px] text-zinc-700">de {assinaturas.length}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Mensal</div>
            <div className="text-base font-bold text-red-400 mt-0.5">{brl(totalMensal)}</div>
            <div className="text-[10px] text-zinc-700">/mês</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Anual</div>
            <div className="text-base font-bold text-amber-400 mt-0.5">{brl(totalAnual)}</div>
            <div className="text-[10px] text-zinc-700">/ano</div>
          </div>
        </div>
        <div className="border-t border-white/[0.05] pt-3 text-center">
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest">Custo anual em assinaturas</div>
          <div className="text-2xl font-black text-red-400 tracking-tight mt-1">{brl(totalAnual)}</div>
        </div>
      </div>

      {/* Ativas */}
      <Section
        icon={<Repeat size={15} />}
        title="Assinaturas Ativas"
        badge={<span className="text-xs font-bold text-cyan-400">{brl(totalMensal)}/mês</span>}
        defaultOpen
      >
        {ativas.map((a, i) => {
          const globalIdx = assinaturas.indexOf(a);
          const diaStr = a.dia ? ` · vence dia ${a.dia}` : "";
          return (
            <ItemRow
              key={i}
              name={a.nome}
              value={`${brl(a.valor)}/mês`}
              sub={`assinatura${diaStr}`}
              color="text-cyan-400"
              badgeLabel="ativa"
              badgeCls="bg-cyan-500/10 text-cyan-500"
              onRemove={() => remove(globalIdx)}
            />
          );
        })}
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="text-xs text-zinc-600 mb-2">Nova assinatura</div>
          <div className="flex gap-2">
            <div className="flex-[2]">
              <Field placeholder="Nome (ex: Netflix)" value={novoNome} onChange={setNovoNome} />
            </div>
            <div className="w-32">
              <Field placeholder="R$/mês" type="number" min="0" step="10" value={novoVal} onChange={setNovoVal} />
            </div>
            <div className="w-20">
              <Field placeholder="Dia" type="number" min="1" max="31" value={novoDia} onChange={setNovoDia} />
            </div>
            <button
              onClick={add}
              className="px-3 py-2 bg-cyan-500/15 text-cyan-400 rounded-xl hover:bg-cyan-500/25 transition-colors flex-shrink-0"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <TotRow label="Total Mensal" value={brl(totalMensal)} color="text-cyan-400" />
      </Section>

      {/* Inativas */}
      {inativas.length > 0 && (
        <Section
          icon={<Repeat size={15} />}
          title={`Inativas · ${inativas.length}`}
          badge={undefined}
        >
          {inativas.map((a, i) => {
            const globalIdx = assinaturas.indexOf(a);
            return (
              <div key={i} className="flex items-center py-2.5 border-b border-white/[0.03] last:border-0 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-600 truncate">{a.nome}</div>
                  <div className="text-xs text-zinc-700 mt-0.5">pausada</div>
                </div>
                <div className="text-sm font-bold text-zinc-600 flex-shrink-0">{brl(a.valor)}/mês</div>
                <button
                  onClick={() => toggle(globalIdx)}
                  className="text-xs px-2 py-1 rounded-lg bg-white/[0.04] text-zinc-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all flex-shrink-0"
                >
                  Reativar
                </button>
                <button
                  onClick={() => remove(globalIdx)}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-700 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </Section>
      )}
    </div>
  );
}

// ─── Parcelamentos Tab ────────────────────────────────────────────────────────

function ParcelamentosTab({
  parcelamentos, setParcelamentos,
}: {
  parcelamentos: Parcelamento[];
  setParcelamentos: (fn: (prev: Parcelamento[]) => Parcelamento[]) => void;
}) {
  const parCalc = useMemo(
    () => parcelamentos.map(calcParcelamento),
    [parcelamentos]
  );

  const ativos   = parCalc.filter(p => !p.quitado);
  const quitados = parCalc.filter(p => p.quitado);

  const totalMensal   = ativos.reduce((s, p) => s + p.valorParcela, 0);
  const totalRestante = ativos.reduce((s, p) => s + p.valorRestante, 0);

  const [novoNome,  setNovoNome]  = useState("");
  const [novoTotal, setNovoTotal] = useState("");
  const [novoParcelas, setNovoParcelas] = useState("12");
  const [novaData,  setNovaData]  = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  function remove(origIdx: number) {
    setParcelamentos(prev => prev.filter((_, i) => i !== origIdx));
  }

  function add() {
    if (!novoNome || !novoTotal) return;
    setParcelamentos(prev => [...prev, {
      nome: novoNome,
      valor_total: parseFloat(novoTotal) || 0,
      parcelas: parseInt(novoParcelas) || 1,
      data_compra: novaData,
    }]);
    setNovoNome(""); setNovoTotal(""); setNovoParcelas("12");
    const d = new Date();
    setNovaData(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  // ── Projection chart data
  const projData = useMemo(() => {
    if (ativos.length === 0) return { data: [], series: [] };
    const today = new Date();
    const curMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    let maxEnd = curMonth;
    for (const p of ativos) {
      const dt = p.data_compra.includes("-")
        ? (() => { const [y, m] = p.data_compra.split("-").map(Number); return new Date(y, m - 1, 1); })()
        : (() => { const [d, m, y] = p.data_compra.split("/").map(Number); return new Date(y, m - 1, 1); })();
      const end = addMonths(new Date(dt.getFullYear(), dt.getMonth(), 1), p.parcelas - 1);
      if (end > maxEnd) maxEnd = end;
    }

    const months: Date[] = [];
    let cur = new Date(curMonth);
    while (cur <= maxEnd) {
      months.push(new Date(cur));
      cur = addMonths(cur, 1);
    }

    const series = new Set<string>();
    const seriesData: Record<string, number[]> = {};

    for (const p of ativos) {
      let dtStart: Date;
      try {
        if (p.data_compra.includes("-")) {
          const [y, m] = p.data_compra.split("-").map(Number);
          dtStart = new Date(y, m - 1, 1);
        } else {
          const [d, m, y] = p.data_compra.split("/").map(Number);
          dtStart = new Date(y, m - 1, 1);
        }
        if (isNaN(dtStart.getTime())) dtStart = today;
      } catch { dtStart = today; }

      let key = p.nome;
      let suf = 1;
      while (series.has(key)) key = `${p.nome} (${suf++})`;
      series.add(key);

      seriesData[key] = months.map(m => {
        const ms = (m.getFullYear() - dtStart.getFullYear()) * 12 + (m.getMonth() - dtStart.getMonth());
        const parcNum = ms + 1;
        return parcNum >= 1 && parcNum <= p.parcelas ? p.valorParcela : 0;
      });
    }

    const data = months.map((m, i) => {
      const obj: Record<string, number | string> = { mes: monthLabel(m) };
      for (const name of series) {
        obj[name] = seriesData[name][i];
      }
      return obj;
    });

    return { data, series: Array.from(series) };
  }, [ativos]);

  const today = new Date();
  const curMonthLbl = monthLabel(today);

  return (
    <div>
      {/* Dashboard */}
      <div className="glass-card mb-4 p-4">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Ativas</div>
            <div className="text-xl font-black text-amber-400 mt-0.5">{ativos.length}</div>
            <div className="text-[10px] text-zinc-700">{quitados.length} quitadas</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Mensal</div>
            <div className="text-base font-bold text-red-400 mt-0.5">{brl(totalMensal)}</div>
            <div className="text-[10px] text-zinc-700">/mês</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">A pagar</div>
            <div className="text-base font-bold text-orange-400 mt-0.5">{brl(totalRestante)}</div>
            <div className="text-[10px] text-zinc-700">total restante</div>
          </div>
        </div>
        <div className="border-t border-white/[0.05] pt-3 text-center">
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest">Total comprometido em parcelas</div>
          <div className="text-2xl font-black text-red-400 tracking-tight mt-1">{brl(totalRestante)}</div>
        </div>
      </div>

      {/* Ativos */}
      <Section
        icon={<ReceiptText size={15} />}
        title="Parcelas Ativas"
        badge={<span className="text-xs font-bold text-amber-400">{brl(totalMensal)}/mês</span>}
        defaultOpen
      >
        {parCalc.map((p, origIdx) => {
          if (p.quitado) return null;
          const progTxt = `parcela ${p.parcelaAtual}/${p.parcelas}`;
          const restTxt = p.restantes > 0 ? `faltam ${p.restantes}` : "na fatura";
          return (
            <div key={origIdx} className="flex items-center py-3 border-b border-white/[0.03] last:border-0 gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-zinc-200 truncate">{p.nome}</div>
                <div className="text-xs text-amber-400 font-medium mt-0.5">{progTxt} · {restTxt}</div>
                <div className="text-xs text-zinc-600 mt-0.5">
                  {brl(p.valorParcela)}/mês · restante {brl(p.valorRestante)}
                </div>
                <div className="text-[10px] text-zinc-700 mt-0.5">
                  compra em {formatDateDisplay(p.data_compra)}
                </div>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide bg-amber-500/10 text-amber-500 flex-shrink-0">
                ativa
              </span>
              <button
                onClick={() => remove(origIdx)}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-700 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="text-xs text-zinc-600 mb-2">Novo parcelamento</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Field placeholder="Nome da compra (ex: iPhone)" value={novoNome} onChange={setNovoNome} />
            </div>
            <Field label="Valor total" placeholder="R$ 0,00" type="number" min="0" step="100" value={novoTotal} onChange={setNovoTotal} />
            <Field label="Parcelas" placeholder="12" type="number" min="1" max="60" value={novoParcelas} onChange={setNovoParcelas} />
            <div className="col-span-2">
              <Field label="Data da compra" type="date" value={novaData} onChange={setNovaData} />
            </div>
          </div>
          <button
            onClick={add}
            className="mt-2 w-full py-2 bg-amber-500/15 text-amber-400 rounded-xl text-sm font-medium hover:bg-amber-500/25 transition-colors"
          >
            Adicionar parcelamento
          </button>
        </div>
        <TotRow label="Total Mensal em Parcelas" value={brl(totalMensal)} color="text-amber-400" />
      </Section>

      {/* Quitados */}
      {quitados.length > 0 && (
        <Section
          icon={<Check size={15} />}
          title={`Quitados · ${quitados.length}`}
        >
          {parCalc.map((p, origIdx) => {
            if (!p.quitado) return null;
            return (
              <div key={origIdx} className="flex items-center py-2.5 border-b border-white/[0.03] last:border-0 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-600 truncate">{p.nome}</div>
                  <div className="text-xs text-zinc-700 mt-0.5">
                    {p.parcelas}/{p.parcelas} · total {brl(p.valor_total)} · compra em {formatDateDisplay(p.data_compra)}
                  </div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide bg-emerald-500/10 text-emerald-500 flex-shrink-0">
                  quitado
                </span>
                <button
                  onClick={() => remove(origIdx)}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-700 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </Section>
      )}

      {/* Projection chart */}
      {projData.data.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Projeção de Parcelas</h3>
              <p className="text-xs text-zinc-600 mt-0.5">Comprometimento mensal até quitação</p>
            </div>
            <span className="text-xs text-zinc-600">mês atual: <span className="text-zinc-400 font-medium">{curMonthLbl}</span></span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={projData.data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="mes"
                tick={{ fill: "#52525b", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                angle={-30}
                textAnchor="end"
                height={40}
              />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={40}
              />
              <Tooltip
                formatter={(val: number, name: string) => [brl(val), name]}
                contentStyle={{
                  background: "rgba(15,23,42,0.95)",
                  border: "1px solid rgba(99,102,241,0.25)",
                  borderRadius: "12px",
                  color: "#e2e8f0",
                  fontSize: "12px",
                }}
                itemStyle={TOOLTIP_ITEM_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px", color: "#64748b", paddingTop: "8px" }}
              />
              {projData.series.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId="a"
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  radius={i === projData.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>

          {/* Month table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-[#0a0e14] text-left py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wide border-b border-white/[0.06]">
                    Mês
                  </th>
                  {projData.series.map(name => (
                    <th key={name} className="py-2 px-2 text-right text-zinc-600 font-semibold uppercase tracking-wide border-b border-white/[0.06] whitespace-nowrap">
                      {name}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-right text-zinc-500 font-semibold uppercase tracking-wide border-b border-white/[0.06]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {projData.data.map((row, i) => {
                  const isCur = row.mes === curMonthLbl;
                  const rowTotal = projData.series.reduce((s, k) => s + (Number(row[k]) || 0), 0);
                  return (
                    <tr key={i} className={isCur ? "bg-indigo-500/10" : ""}>
                      <td className={`sticky left-0 py-2 px-2 font-${isCur ? "bold" : "medium"} whitespace-nowrap border-b border-white/[0.03] ${isCur ? "text-indigo-300 bg-indigo-500/10" : "text-zinc-600 bg-[#0a0e14]"}`}>
                        {row.mes as string}{isCur ? " ●" : ""}
                      </td>
                      {projData.series.map(k => (
                        <td key={k} className={`py-2 px-2 text-right border-b border-white/[0.03] whitespace-nowrap ${Number(row[k]) > 0 ? "text-amber-400 font-semibold" : "text-zinc-700"}`}>
                          {Number(row[k]) > 0 ? brl(Number(row[k])) : "–"}
                        </td>
                      ))}
                      <td className={`py-2 px-2 text-right font-bold border-b border-white/[0.03] ${isCur ? "text-red-400" : "text-red-500/80"}`}>
                        {brl(rowTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FinancasPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mensalRows,    setMensalRows]    = useState<RowMensal[]>([]);
  const [assinaturas,   setAssinaturas]   = useState<Assinatura[]>([]);
  const [parcelamentos, setParcelamentos] = useState<Parcelamento[]>([]);
  const [activeTab, setActiveTab] = useState<"mensal" | "assinaturas" | "parcelamentos">("mensal");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const initialLoaded = useRef(false);
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load
  useEffect(() => {
    fetch("/api/financas")
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setMensalRows(parseMensalRows(data.pessoal ?? []));
        setAssinaturas(parseAssinaturas(data.assinaturas ?? []));
        setParcelamentos(parseParcelamentos(data.parcelamentos ?? []));
        initialLoaded.current = true;
      })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Auto-save (debounced 1.5s)
  const doSave = useCallback(async (
    mensal: RowMensal[],
    ass: Assinatura[],
    parc: Parcelamento[],
  ) => {
    setSaveStatus("saving");
    try {
      const responses = await Promise.all([
        fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: "pessoal", data: mensal }) }),
        fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: "assinaturas", data: ass }) }),
        fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: "parcelamentos", data: parc }) }),
      ]);
      const bodies = await Promise.all(responses.map(r => r.json()));
      if (bodies.some(b => b.readonly)) {
        setSaveStatus("readonly");
        return;
      }
      if (responses.some(r => !r.ok)) throw new Error("Falha ao salvar");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!initialLoaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("idle");
    saveTimer.current = setTimeout(() => {
      doSave(mensalRows, assinaturas, parcelamentos);
    }, 1500);
  }, [mensalRows, assinaturas, parcelamentos, doSave]);

  if (loading) return <LoadingSpinner />;

  const tabs = [
    { id: "mensal",        label: "Mensal",        icon: <Wallet size={14} /> },
    { id: "assinaturas",   label: "Assinaturas",   icon: <Repeat size={14} /> },
    { id: "parcelamentos", label: "Parcelamentos",  icon: <CalendarDays size={14} /> },
  ] as const;

  return (
    <>
      <div className="flex items-start justify-between">
        <PageHeader title="Finanças" description="Controle financeiro pessoal" />
        <div className="mt-1">
          <SaveIndicator status={saveStatus} />
        </div>
      </div>

      {loadError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 flex items-center gap-2">
          <AlertCircle size={14} />{loadError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 mb-5 bg-white/[0.03] p-1 rounded-2xl border border-white/[0.06]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-accent/12 text-accent shadow-[inset_0_0_20px_rgba(212,165,116,0.05)]"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === "mensal" && (
          <MensalTab rows={mensalRows} setRows={setMensalRows} />
        )}
        {activeTab === "assinaturas" && (
          <AssinaturasTab assinaturas={assinaturas} setAssinaturas={setAssinaturas} />
        )}
        {activeTab === "parcelamentos" && (
          <ParcelamentosTab parcelamentos={parcelamentos} setParcelamentos={setParcelamentos} />
        )}
      </div>
    </>
  );
}
