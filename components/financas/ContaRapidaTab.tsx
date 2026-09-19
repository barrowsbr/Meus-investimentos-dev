"use client";

// Aba CONTA RÁPIDA da página Finanças (antiga "Custos") — a conta de guardanapo
// do mês: entradas − contas fixas = saldo, e quanto isso dá por dia no que
// resta do mês. Nada mais.
//
// O que saiu daqui (decisão do dono, 19/09/2026) e por quê a conta mudou:
//   • "Assinaturas & Parcelamentos" — eram exibidos aqui e SUBTRAÍDOS do saldo.
//     Continuam vivos na aba Gastos (onde se edita/pausa) e dentro da fatura na
//     aba Acerto/Meses. Como a seção saiu, a subtração saiu junto: deixar o
//     número descontando algo que a tela não mostra mais faria o saldo "não
//     fechar" com o que está à vista.
//   • "Meta de Poupança" — idem; o `livre p/ gastar` era saldo − meta, então
//     agora saldo e livre são a mesma coisa e sobrou só o saldo.
// As linhas `poupanca` e `cartao` da planilha são PRESERVADAS (parseMensalRows
// recria a de poupança quando falta) — só não são mais exibidas nem somadas.

import { useState } from "react";
import { TrendingUp, TrendingDown, Plus } from "lucide-react";
import { brl } from "@/lib/format";
import { Section, ItemRow, TotRow, Field } from "@/components/financas/ui";
import { type RowMensal } from "@/lib/financas/tipos";

export default function ContaRapidaTab({
  rows, setRows,
}: {
  rows: RowMensal[];
  setRows: (fn: (prev: RowMensal[]) => RowMensal[]) => void;
}) {
  const entradas = rows.filter(r => r.categoria === "entrada");
  const saidas   = rows.filter(r => r.categoria === "saida");

  const tEnt = entradas.reduce((s, r) => s + r.valor, 0);
  const tSai = saidas.reduce((s, r) => s + r.valor, 0);
  const saldo = tEnt - tSai;

  const today = new Date();
  const diasMes = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const diasRest = Math.max(diasMes - today.getDate(), 1);
  const mediaDia = saldo / diasRest;

  const [novoEntNome, setNovoEntNome] = useState("");
  const [novoEntVal, setNovoEntVal]   = useState("");
  const [novoSaiNome, setNovoSaiNome] = useState("");
  const [novoSaiVal, setNovoSaiVal]   = useState("");

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
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

  return (
    <div>
      {/* ── Dashboard card */}
      <div className={`glass-card mb-4 p-4 ${saldo >= 0 ? "border-emerald-500/10" : "border-red-500/10"}`}>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { label: "Entradas", val: tEnt, pctVal: 100, color: "text-emerald-400" },
            { label: "Contas Fixas", val: tSai, pctVal: tSai / tEnt * 100, color: "text-red-400" },
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
        </div>

        <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-white/[0.05]">
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{diasRest}d restantes</div>
            <div className={`text-base font-bold mt-0.5 ${saldoCls}`}>{brl(mediaDia)}/dia</div>
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
    </div>
  );
}
