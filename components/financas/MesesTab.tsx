"use client";

// Aba MESES da página Finanças — a dinâmica mensal: registrar como foi cada
// mês (fechamento com snapshot + gasto real do cartão + avaliação e notas) e
// planejar o próximo (teto de cartão, meta de aporte, intenções). 1 registro
// por mês na aba financas_meses; os números do cartão vêm sozinhos de
// cartao_transacoes (useCartao), e o snapshot de entradas/fixas/compromissos
// congela os valores da aba Custos no momento do fechamento.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, PencilLine, Target, Star, CalendarDays } from "lucide-react";
import { brl } from "@/lib/format";
import { Section, TotRow } from "@/components/financas/ui";
import {
  mesVazio, ymAdd, calcParcelamento,
  type MesRegistro, type RowMensal, type Assinatura, type Parcelamento,
} from "@/lib/financas/tipos";
import { mesclarAssinaturas, mesclarParcelamentos } from "@/lib/financas/mesclar";
import { useCartao } from "@/components/financas/useCartao";
import { calcularAcerto, type TransacaoAcerto } from "@/lib/financas/acerto";

const MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const rotuloMes = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MESES_PT[m - 1]} ${y}`; };
const rotuloCurto = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MESES_PT[m - 1].slice(0, 3).toLowerCase()}/${String(y).slice(2)}`; };
const ymHoje = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; };

export default function MesesTab({
  meses, setMeses, mensalRows, assinaturas, parcelamentos,
}: {
  meses: MesRegistro[];
  setMeses: (fn: (prev: MesRegistro[]) => MesRegistro[]) => void;
  mensalRows: RowMensal[];
  assinaturas: Assinatura[];
  parcelamentos: Parcelamento[];
}) {
  const hoje = ymHoje();
  const [ym, setYm] = useState(hoje);

  const { cartao } = useCartao();

  // Gasto REAL do cartão por mês (negativo = gasto; créditos ficam fora) e
  // top categorias — direto de cartao_transacoes, sem digitação.
  const cartaoPorMes = useMemo(() => {
    const tot = new Map<string, number>();
    const porCat = new Map<string, Map<string, number>>();
    for (const t of cartao?.transacoes ?? []) {
      if (t.valor >= 0) continue;
      const m = t.data.slice(0, 7);
      tot.set(m, (tot.get(m) ?? 0) + -t.valor);
      const cats = porCat.get(m) ?? new Map<string, number>();
      cats.set(t.categoria, (cats.get(t.categoria) ?? 0) + -t.valor);
      porCat.set(m, cats);
    }
    return { tot, porCat };
  }, [cartao]);

  // Valores CORRENTES da aba Custos — a estimativa do mês em andamento e o
  // que vira snapshot no fechamento.
  const atuais = useMemo(() => {
    const entradas = mensalRows.filter(r => r.categoria === "entrada").reduce((s, r) => s + r.valor, 0);
    const fixas = mensalRows.filter(r => r.categoria === "saida").reduce((s, r) => s + r.valor, 0);
    const ass = mesclarAssinaturas(assinaturas, cartao?.assinaturas ?? []).filter(a => a.ativa).reduce((s, a) => s + a.valorMensal, 0);
    const parc = mesclarParcelamentos(parcelamentos.map(p => calcParcelamento(p)), cartao?.parcelamentos ?? [])
      .filter(p => !p.quitado).reduce((s, p) => s + p.valorParcela, 0);
    return { entradas, fixas, compromissos: ass + parc };
  }, [mensalRows, assinaturas, parcelamentos, cartao]);

  // A MESMA conta da aba Acerto (fatura PAGA no mês = consumo do ciclo
  // anterior via OFX + outros cartões manuais) — uma régua só na página toda.
  const acertoDoMes = useMemo(() => {
    const trans: TransacaoAcerto[] = (cartao?.transacoes ?? []).map(t => ({ data: t.data, valor: t.valor, parcela: t.parcela }));
    return calcularAcerto({ mensal: mensalRows, trans, ymAtual: ym, diaFechamento: cartao?.fechamentoDia ?? 28 });
  }, [cartao, mensalRows, ym]);

  const reg = meses.find(m => m.mes === ym) ?? mesVazio(ym);
  const proxYm = ymAdd(ym, 1);
  const regProx = meses.find(m => m.mes === proxYm) ?? mesVazio(proxYm);

  // Atualiza (ou cria) o registro de um mês.
  const patch = (mes: string, p: Partial<MesRegistro>) => {
    setMeses(prev => {
      const existe = prev.some(m => m.mes === mes);
      const next = existe ? prev.map(m => (m.mes === mes ? { ...m, ...p } : m)) : [...prev, { ...mesVazio(mes), ...p }];
      return next.sort((a, b) => a.mes.localeCompare(b.mes));
    });
  };

  const cartaoReal = reg.fechado ? reg.cartao : (acertoDoMes.faturaNubank + acertoDoMes.faturasOutras);
  const ent = reg.fechado ? reg.entradas : atuais.entradas;
  const fix = reg.fechado ? reg.fixas : atuais.fixas;
  const comp = reg.fechado ? reg.compromissos : atuais.compromissos;
  const sobra = ent - fix - cartaoReal; // compromissos estão DENTRO da fatura
  const emAndamento = ym === hoje && !reg.fechado;
  const topCats = [...(cartaoPorMes.porCat.get(ym) ?? new Map<string, number>()).entries()]
    .filter(([c]) => c !== "Pagamento").sort((a, b) => b[1] - a[1]).slice(0, 4);

  const fecharMes = () => {
    patch(ym, {
      fechado: true,
      entradas: atuais.entradas,
      fixas: atuais.fixas,
      compromissos: atuais.compromissos,
      // Fatura paga no mês (mesma régua do Acerto) — não o gasto-competência.
      cartao: acertoDoMes.faturaNubank + acertoDoMes.faturasOutras,
    });
  };

  const tetoDoMes = reg.tetoCartao;
  const dentroDoTeto = tetoDoMes > 0 ? cartaoReal <= tetoDoMes : null;

  // Histórico compacto dos últimos meses registrados (fechados ou com plano).
  const historico = useMemo(
    () => meses.filter(m => m.fechado && m.mes !== ym).slice(-6).reverse(),
    [meses, ym],
  );

  return (
    <div>
      {/* ── Navegador de mês */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setYm(m => ymAdd(m, -1))} aria-label="Mês anterior"
          className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors text-zinc-400"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <div className="text-base font-bold" style={{ color: "var(--text)" }}>{rotuloMes(ym)}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest mt-0.5" style={{ color: reg.fechado ? "var(--pos)" : "var(--muted)" }}>
            {reg.fechado ? "✓ mês fechado" : emAndamento ? "em andamento" : ym < hoje ? "não fechado" : "futuro"}
          </div>
        </div>
        <button onClick={() => setYm(m => ymAdd(m, 1))} aria-label="Próximo mês"
          className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors text-zinc-400"><ChevronRight size={18} /></button>
      </div>

      {/* ── Como foi o mês */}
      <div className="glass-card mb-4 p-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Entradas", val: ent, color: "text-emerald-400" },
            { label: "Fixas", val: fix, color: "text-red-400" },
            { label: "Compromissos (na fatura)", val: comp, color: "text-amber-400" },
            { label: "Faturas do mês", val: cartaoReal, color: "text-sky-400" },
          ].map(i => (
            <div key={i.label} className="text-center">
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{i.label}</div>
              <div className={`text-sm font-bold mt-0.5 ${i.color}`}>{brl(i.val)}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/[0.05] mt-3 pt-3 text-center">
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest">Sobra do mês {reg.fechado ? "" : "(estimada)"}</div>
          <div className={`text-3xl font-black tracking-tight mt-1 ${sobra >= 0 ? "text-emerald-400" : "text-red-400"}`}>{brl(sobra)}</div>
          {tetoDoMes > 0 && (
            <div className="flex items-center justify-center gap-2 mt-2 text-xs">
              <span className="text-zinc-600">Teto do cartão: <span className="text-sky-400 font-bold">{brl(tetoDoMes)}</span></span>
              <span className={`px-1.5 py-0.5 rounded-md font-bold text-[10px] uppercase ${dentroDoTeto ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                {dentroDoTeto ? "✓ dentro" : `estourou ${brl(cartaoReal - tetoDoMes)}`}
              </span>
            </div>
          )}
        </div>
        {topCats.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-white/[0.05] text-[11px]">
            {topCats.map(([c, v]) => (
              <span key={c} className="text-zinc-500">{c}: <span className="text-zinc-300 font-semibold">{brl(v)}</span></span>
            ))}
          </div>
        )}
      </div>

      {/* ── Fechamento: avaliação + notas */}
      <Section
        icon={<PencilLine size={15} />}
        title="Registro do mês"
        badge={reg.avaliacao > 0 ? <span className="text-xs font-bold text-amber-300">{"★".repeat(reg.avaliacao)}</span> : undefined}
        defaultOpen
      >
        <div className="flex items-center gap-1.5 mt-2 mb-2">
          <span className="text-xs text-zinc-600 mr-1">Como foi?</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => patch(ym, { avaliacao: reg.avaliacao === n ? 0 : n })} aria-label={`Nota ${n}`}
              className="p-0.5 transition-transform hover:scale-110">
              <Star size={18} fill={n <= reg.avaliacao ? "#fbbf24" : "transparent"} color={n <= reg.avaliacao ? "#fbbf24" : "#3f3f46"} />
            </button>
          ))}
        </div>
        <textarea
          value={reg.notas}
          onChange={e => patch(ym, { notas: e.target.value })}
          placeholder="O que marcou o mês? Estouros, imprevistos, vitórias… (fica registrado no histórico)"
          rows={3}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-zinc-200
                     placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors resize-y"
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-[10.5px] text-zinc-600 max-w-[60%]">
            Fechar congela entradas/fixas de hoje e as FATURAS pagas no mês (a mesma conta da aba Acerto) como o retrato definitivo.
          </p>
          {reg.fechado ? (
            <button onClick={() => patch(ym, { fechado: false })}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.05] text-zinc-400 hover:bg-white/[0.1] transition-colors">
              Reabrir mês
            </button>
          ) : (
            <button onClick={fecharMes}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
              <CheckCircle2 size={14} /> Fechar {rotuloCurto(ym)}
            </button>
          )}
        </div>
      </Section>

      {/* ── Plano do próximo mês */}
      <Section
        icon={<Target size={15} />}
        title={`Plano para ${rotuloMes(proxYm)}`}
        badge={regProx.tetoCartao > 0 ? <span className="text-xs font-bold text-sky-400">{brl(regProx.tetoCartao)} no cartão</span> : undefined}
        defaultOpen
      >
        <div className="grid grid-cols-2 gap-3 mt-2 mb-3">
          <div>
            <div className="text-xs text-zinc-600 mb-1">Teto do cartão</div>
            <input type="number" min="0" step="100" value={regProx.tetoCartao || ""}
              onChange={e => patch(proxYm, { tetoCartao: parseFloat(e.target.value) || 0 })}
              placeholder="R$ 0,00"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-base font-bold text-sky-400
                         placeholder:text-zinc-700 focus:outline-none focus:border-sky-500/40 transition-colors" />
          </div>
          <div>
            <div className="text-xs text-zinc-600 mb-1">Meta de aporte</div>
            <input type="number" min="0" step="100" value={regProx.metaAporte || ""}
              onChange={e => patch(proxYm, { metaAporte: parseFloat(e.target.value) || 0 })}
              placeholder="R$ 0,00"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-base font-bold text-violet-400
                         placeholder:text-zinc-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
          </div>
        </div>
        <textarea
          value={regProx.plano}
          onChange={e => patch(proxYm, { plano: e.target.value })}
          placeholder={`Intenções para ${rotuloCurto(proxYm)} — cortar o quê, priorizar o quê…`}
          rows={2}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-zinc-200
                     placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/40 transition-colors resize-y"
        />
        {reg.plano && (
          <p className="text-[11px] text-zinc-500 mt-2 border-t border-white/[0.05] pt-2">
            <span className="text-zinc-400 font-semibold">Plano que valia para {rotuloCurto(ym)}:</span> {reg.plano}
          </p>
        )}
      </Section>

      {/* ── Histórico */}
      {historico.length > 0 && (
        <Section icon={<CalendarDays size={15} />} title="Meses fechados" defaultOpen>
          {historico.map(m => {
            const s = m.entradas - m.fixas - m.cartao; // mesma régua do Acerto
            const estourou = m.tetoCartao > 0 && m.cartao > m.tetoCartao;
            return (
              <button key={m.mes} onClick={() => setYm(m.mes)}
                className="w-full flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0 text-left hover:bg-white/[0.03] transition-colors rounded-lg px-1.5">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-zinc-200 capitalize">{rotuloCurto(m.mes)}</span>
                  {m.avaliacao > 0 && <span className="ml-2 text-[11px] text-amber-300">{"★".repeat(m.avaliacao)}</span>}
                  {m.notas && <span className="block truncate text-[10.5px] text-zinc-600">{m.notas}</span>}
                </div>
                <div className="text-right shrink-0">
                  <span className={`block text-sm font-bold ${s >= 0 ? "text-emerald-400" : "text-red-400"}`}>{brl(s)}</span>
                  <span className={`block text-[10px] ${estourou ? "text-red-400" : "text-zinc-600"}`}>
                    cartão {brl(m.cartao)}{m.tetoCartao > 0 ? ` / ${brl(m.tetoCartao)}` : ""}
                  </span>
                </div>
              </button>
            );
          })}
          <TotRow label="Meses registrados" value={String(meses.filter(m => m.fechado).length)} color="text-zinc-300" />
        </Section>
      )}
    </div>
  );
}
