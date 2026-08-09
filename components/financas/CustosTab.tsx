"use client";

// Aba CUSTOS da página Finanças — o orçamento do mês: entradas, contas fixas,
// COMPROMISSOS AUTOMÁTICOS (assinaturas + parcelamentos mesclados da aba
// Gastos — os gastos obrigatórios do começo do mês) e meta de poupança.
// A antiga seção manual de "Cartões" (digitar fatura por fatura) saiu: os
// compromissos vêm sozinhos do cartão; o resto do consumo variável é
// exatamente o "livre p/ gastar". As linhas `cartao` da planilha são
// preservadas (só não são mais exibidas nem somadas).

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Repeat, CalendarDays, PiggyBank, Plus } from "lucide-react";
import { brl } from "@/lib/format";
import { Section, ItemRow, TotRow, Field } from "@/components/financas/ui";
import { calcParcelamento, type RowMensal, type Assinatura, type Parcelamento } from "@/lib/financas/tipos";
import { mesclarAssinaturas, mesclarParcelamentos } from "@/lib/financas/mesclar";
import { useCartao } from "@/components/financas/useCartao";

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fimLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MESES_PT[m - 1]}/${String(y).slice(2)}`; };

export default function CustosTab({
  rows, setRows, assinaturas, parcelamentos,
}: {
  rows: RowMensal[];
  setRows: (fn: (prev: RowMensal[]) => RowMensal[]) => void;
  assinaturas: Assinatura[];
  parcelamentos: Parcelamento[];
}) {
  // Compromissos automáticos — MESMA fonte e mescla da aba Gastos.
  const { cartao } = useCartao();
  const assMescladas = useMemo(
    () => mesclarAssinaturas(assinaturas, cartao?.assinaturas ?? []),
    [assinaturas, cartao],
  );
  const parcMesclados = useMemo(
    () => mesclarParcelamentos(parcelamentos.map((p) => calcParcelamento(p)), cartao?.parcelamentos ?? []),
    [parcelamentos, cartao],
  );
  const tAss = assMescladas.filter((a) => a.ativa).reduce((s, a) => s + a.valorMensal, 0);
  const parcAtivos = parcMesclados.filter((p) => !p.quitado);
  const tParc = parcAtivos.reduce((s, p) => s + p.valorParcela, 0);
  const tComp = tAss + tParc;
  const entradas = rows.filter(r => r.categoria === "entrada");
  const saidas   = rows.filter(r => r.categoria === "saida");
  const poupRow  = rows.find(r => r.categoria === "poupanca");

  const tEnt = entradas.reduce((s, r) => s + r.valor, 0);
  const tSai = saidas.reduce((s, r) => s + r.valor, 0);
  const meta = poupRow?.valor ?? 0;
  const saldo = tEnt - tSai - tComp;
  const livre = saldo - meta;

  const today = new Date();
  const diasMes = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const diasRest = Math.max(diasMes - today.getDate(), 1);
  const mediaDia = livre / diasRest;

  const [novoEntNome, setNovoEntNome] = useState("");
  const [novoEntVal, setNovoEntVal]   = useState("");
  const [novoSaiNome, setNovoSaiNome] = useState("");
  const [novoSaiVal, setNovoSaiVal]   = useState("");

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }
  function updatePoupanca(val: number) {
    setRows(prev => prev.map(r => (r.categoria === "poupanca" ? { ...r, valor: val } : r)));
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
            { label: "Compromissos", val: tComp, pctVal: tComp / tEnt * 100, color: "text-amber-400" },
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

      {/* ── Compromissos do mês (automático — assinaturas + parcelas da aba Gastos) */}
      <Section
        icon={<Repeat size={15} />}
        title="Assinaturas & Parcelamentos"
        badge={<span className="text-xs font-bold text-amber-400">{brl(tComp)}/mês</span>}
        defaultOpen
      >
        <p className="text-[10.5px] text-zinc-600 pt-2 mb-1.5">
          Puxados automaticamente da aba <span className="text-zinc-400 font-semibold">Gastos</span> (cartão + cadastros manuais,
          mesclados) — os gastos obrigatórios que já entram comprometidos no começo do mês.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400"><Repeat size={12} /> Assinaturas</div>
            <div className="text-lg font-bold text-violet-300 mt-1">{brl(tAss)}<span className="text-[11px] text-zinc-600">/mês</span></div>
            <div className="text-[10.5px] text-zinc-600 mt-0.5">{assMescladas.filter(a => a.ativa).length} ativas</div>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400"><CalendarDays size={12} /> Parcelas</div>
            <div className="text-lg font-bold text-amber-300 mt-1">{brl(tParc)}<span className="text-[11px] text-zinc-600">/mês</span></div>
            <div className="text-[10.5px] text-zinc-600 mt-0.5">{parcAtivos.length} em aberto · restam {brl(parcAtivos.reduce((s, p) => s + p.valorRestante, 0))}</div>
          </div>
        </div>
        {assMescladas.filter(a => a.ativa).slice(0, 6).map(a => (
          <ItemRow key={`a-${a.nome}`} name={<span className="capitalize">{a.nome}</span>} value={brl(a.valorMensal)}
            sub={a.origem === "manual" ? "assinatura · manual" : "assinatura · cartão"} color="text-violet-300" />
        ))}
        {parcAtivos.slice(0, 6).map(p => (
          <ItemRow key={`p-${p.nome}-${p.totalParcelas}`} name={<span className="capitalize">{p.nome}</span>} value={`${brl(p.valorParcela)}`}
            sub={`parcela ${p.parcelaAtual}/${p.totalParcelas} · termina ${fimLabel(p.fimPrevisto)}`} color="text-amber-300" />
        ))}
        <p className="text-[10.5px] text-zinc-600 mt-2">Para editar, pausar ou cadastrar itens: aba <span className="text-zinc-400 font-semibold">Gastos</span>.</p>
        <TotRow label="Comprometido / mês" value={brl(tComp)} color="text-amber-400" />
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
