"use client";

// Aba "Acerto" — o modelo do dono na tela (15/08/2026): tudo no cartão, a
// fatura do mês é o consumo do mês passado, sobra vira poupança incremental.
// 4 blocos: (1) o acerto do mês vigente; (2) a próxima fatura em construção
// (variável | parcelado | assinaturas + projeção pelo ritmo); (3) a cauda dos
// meses já comprometidos; (4) a série da poupança incremental. Motor puro em
// lib/financas/acerto.ts (9 testes). UI enxuta: números e tags, sem didática.

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, ComposedChart, Line } from "recharts";
import { Scale, Zap, CalendarClock, PiggyBank } from "lucide-react";
import { brl, compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { nomesCasam } from "@/lib/financas/mesclar";
import {
  calcularAcerto, construirProximaFatura, caudaComprometida, serieSobras,
  type TransacaoAcerto,
} from "@/lib/financas/acerto";
import type { RowMensal, MesRegistro } from "@/lib/financas/tipos";
import type { RespCartao } from "@/components/financas/useCartao";

const TOOLTIP_STYLE = { background: "#131318", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 };
const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotYm = (ym: string) => `${MESES_PT[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const sinal = (v: number) => (v >= 0 ? "+" : "−");

export default function AcertoTab({ mensalRows, meses, cartao, tetoCartao }: {
  mensalRows: RowMensal[];
  meses: MesRegistro[];
  cartao: RespCartao | null;
  tetoCartao: number; // do plano do mês (financas_meses)
}) {
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const ymAtual = hojeISO.slice(0, 7);
  const diaFechamento = cartao?.fechamentoDia ?? 28;
  const fechamentoAprendido = cartao?.fechamentoDia != null;

  const calc = useMemo(() => {
    const assinaturasDet = cartao?.assinaturas ?? [];
    const trans: TransacaoAcerto[] = (cartao?.transacoes ?? []).map(tr => ({
      data: tr.data, valor: tr.valor, parcela: tr.parcela,
      assinatura: assinaturasDet.some(a => nomesCasam(a.nome, tr.estabelecimento)),
    }));
    const parcelasRestantes = (cartao?.parcelamentos ?? [])
      .map(p => ({ valorParcela: p.valorParcela, restantes: p.restantes }));
    const assinaturasMensais = assinaturasDet.reduce((s, a) => s + a.valorMensal, 0);

    const acerto = calcularAcerto({ mensal: mensalRows, trans, ymAtual, diaFechamento });
    const prox = construirProximaFatura({ trans, hoje: hojeISO, diaFechamento, assinaturasMensais, parcelasRestantes });
    const cauda = caudaComprometida({ parcelasRestantes, assinaturasMensais, ymAtual });
    const sobras = serieSobras(meses.map(m => ({ mes: m.mes, entradas: m.entradas, fixas: m.fixas, cartao: m.cartao, fechado: m.fechado })));
    // Sobra prevista do mês de pagamento da fatura em construção (entradas/fixas atuais como proxy).
    const sobraPrevista = acerto.entradas - acerto.fixas - prox.totalPrevisto - acerto.faturasOutras;
    return { acerto, prox, cauda, sobras, sobraPrevista };
  }, [mensalRows, meses, cartao, ymAtual, hojeISO, diaFechamento]);

  const { acerto, prox, cauda, sobras, sobraPrevista } = calc;
  const positiva = acerto.sobra >= 0;
  const divergencia = acerto.faturaNubankManual > 0 && Math.abs(acerto.faturaNubank - acerto.faturaNubankManual) > 1;

  return (
    <div className="space-y-4">
      {/* ── 1. O acerto do mês ── */}
      <div className="glass-card p-5" style={{ borderColor: positiva ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="section-title"><Scale size={15} />O acerto de {rotYm(ymAtual)}
            <span className="ml-2 rounded-full px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-wide" style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}>definido desde o dia 1º</span>
          </h2>
          <span className="font-mono text-[10px] text-zinc-600">fatura fecha dia {diaFechamento}{fechamentoAprendido ? "" : " (estimado)"}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[13px] mb-3">
          <span className="text-emerald-400 font-bold">{compactBRL(acerto.entradas)}</span>
          <span className="text-zinc-600">entradas −</span>
          <span className="text-zinc-300 font-bold">{compactBRL(acerto.fixas)}</span>
          <span className="text-zinc-600">fixas −</span>
          <span className="text-zinc-300 font-bold">{compactBRL(acerto.faturaNubank)}</span>
          <span className="text-zinc-600">Nubank −</span>
          <span className="text-zinc-300 font-bold">{compactBRL(acerto.faturasOutras)}</span>
          <span className="text-zinc-600">outros cartões =</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className={`font-mono text-3xl font-extrabold ${positiva ? "text-emerald-400" : "text-red-400"}`}>
            {sinal(acerto.sobra)}{brl(Math.abs(acerto.sobra))}
          </span>
          <span className={`text-sm font-semibold ${positiva ? "text-emerald-400" : "text-red-400"}`}>
            {positiva ? "para a poupança" : "da poupança"}
          </span>
        </div>
        {divergencia && (
          <p className="mt-2 font-mono text-[10.5px] text-amber-400">
            aba manual diz {brl(acerto.faturaNubankManual)} para o Nubank · OFX diz {brl(acerto.faturaNubank)}
          </p>
        )}
      </div>

      {/* ── 2. A próxima fatura em construção ── */}
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="section-title"><Zap size={15} />Fatura de {rotYm(prox.ymPagamento)} em construção</h2>
          <span className="font-mono text-[10px] text-zinc-600">{prox.diasRestantes} dias até fechar</span>
        </div>
        {(() => {
          const partes = [
            { rot: "variável", v: prox.variavel, cor: "#3b82f6" },
            { rot: "projeção", v: Math.max(prox.projecaoVariavel - prox.variavel, 0), cor: "rgba(59,130,246,0.35)" },
            { rot: "parcelado", v: prox.parcelado + prox.parcelasQueVemAi, cor: "#E8A33D" },
            { rot: "assinaturas", v: prox.assinaturas + prox.assinaturasQueVemAi, cor: "#a855f7" },
          ].filter(p => p.v > 0.5);
          const max = Math.max(prox.totalPrevisto, tetoCartao, 1);
          return (
            <>
              <div className="flex h-4 w-full overflow-hidden rounded-full mb-1.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                {partes.map(p => (
                  <div key={p.rot} title={`${p.rot}: ${brl(p.v)}`} style={{ width: `${(p.v / max) * 100}%`, background: p.cor }} />
                ))}
              </div>
              {tetoCartao > 0 && (
                <div className="relative h-2 mb-1.5">
                  <div className="absolute top-0 h-2 w-px bg-red-400" style={{ left: `${Math.min((tetoCartao / max) * 100, 100)}%` }} />
                  <span className="absolute top-0 font-mono text-[9px] text-red-400" style={{ left: `${Math.min((tetoCartao / max) * 100, 86)}%`, transform: "translateX(4px)" }}>
                    teto {compactBRL(tetoCartao)}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] text-zinc-500 mb-3">
                {partes.map(p => (
                  <span key={p.rot} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.cor }} />{p.rot} {compactBRL(p.v)}
                  </span>
                ))}
              </div>
            </>
          );
        })()}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-xl font-extrabold text-zinc-100">{brl(prox.totalPrevisto)}</span>
          <span className="font-mono text-[11px] text-zinc-500">prevista no fechamento ({prox.fimCiclo.slice(8, 10)}/{prox.fimCiclo.slice(5, 7)})</span>
          {tetoCartao > 0 && (
            <span className={`font-mono text-[11px] font-semibold ${prox.totalPrevisto <= tetoCartao ? "text-emerald-400" : "text-red-400"}`}>
              {prox.totalPrevisto <= tetoCartao ? `${compactBRL(tetoCartao - prox.totalPrevisto)} abaixo do teto` : `${compactBRL(prox.totalPrevisto - tetoCartao)} ACIMA do teto`}
            </span>
          )}
          <span className={`font-mono text-[11px] font-semibold ${sobraPrevista >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            sobra prevista de {rotYm(prox.ymPagamento)}: {sinal(sobraPrevista)}{compactBRL(Math.abs(sobraPrevista))}
          </span>
        </div>
      </div>

      {/* ── 3. A cauda comprometida ── */}
      <div className="glass-card p-5">
        <h2 className="section-title mb-1"><CalendarClock size={15} />O que já nasceu gasto</h2>
        {(() => {
          const livre = cauda.findIndex(m => m.parcelas < 0.5);
          return (
            <p className="font-mono text-[10.5px] text-zinc-500 mb-3">
              {cauda[0] ? `${rotYm(cauda[0].ym)} já nasce com ${compactBRL(cauda[0].parcelas + cauda[0].assinaturas)} comprometidos` : ""}
              {livre >= 0 ? ` · parcelas zeram em ${rotYm(cauda[livre].ym)}` : " · parcelas seguem além de 12 meses"}
            </p>
          );
        })()}
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={cauda.map(m => ({ ...m, rot: rotYm(m.ym) }))} barCategoryGap="24%">
            <XAxis dataKey="rot" tick={{ fill: "#52525b", fontSize: 9.5 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 9.5 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} width={62} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v: number, n: string) => [brl(v), n === "parcelas" ? "Parcelas" : "Assinaturas"]} />
            <Bar dataKey="parcelas" stackId="a" fill="#E8A33D" fillOpacity={0.85} />
            <Bar dataKey="assinaturas" stackId="a" fill="#a855f7" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── 4. Poupança incremental ── */}
      {sobras.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="section-title"><PiggyBank size={15} />Poupança incremental</h2>
            <span className={`font-mono text-sm font-extrabold ${sobras[sobras.length - 1].acumulado >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {sinal(sobras[sobras.length - 1].acumulado)}{compactBRL(Math.abs(sobras[sobras.length - 1].acumulado))} acumulados
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={sobras.map(s => ({ ...s, rot: rotYm(s.ym) }))} barCategoryGap="28%">
              <XAxis dataKey="rot" tick={{ fill: "#52525b", fontSize: 9.5 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 9.5 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} width={62} />
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(v: number, n: string) => [brl(v), n === "sobra" ? "Sobra do mês" : "Acumulado"]} />
              <ReferenceLine y={0} stroke="#3f3f46" />
              <Bar dataKey="sobra">
                {sobras.map(s => <Cell key={s.ym} fill={s.sobra >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.8} />)}
              </Bar>
              <Line dataKey="acumulado" stroke="#60a5fa" strokeWidth={1.5} dot={{ r: 2.5, fill: "#60a5fa" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
