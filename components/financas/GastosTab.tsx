"use client";

// Aba GASTOS da página Finanças — o dia a dia do cartão (OFX do Nubank) com
// categorias e gráficos, MAIS assinaturas e parcelamentos MESCLADOS: o que foi
// detectado no cartão e o que o dono cadastrou à mão aparecem juntos, sem
// contagem dupla (origem "ambos" quando as duas fontes casam — o valor cobrado
// no cartão vence; o cadastro manual continua editável).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CreditCard, Repeat, CalendarDays, Upload, RefreshCw, Plus, X, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { brl } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { COR_CATEGORIA, type Categoria } from "@/lib/financas/categorias";
import { calcParcelamento, type Assinatura, type Parcelamento } from "@/lib/financas/tipos";
import { mesclarAssinaturas, mesclarParcelamentos, type Origem } from "@/lib/financas/mesclar";
import { Section, Field, TotRow, addMonths, monthLabel } from "@/components/financas/ui";

interface Trans {
  chave: string; data: string; valor: number; descricao: string;
  estabelecimento: string; categoria: string; parcela: { n: number; total: number } | null;
}
interface AssinaturaDet { nome: string; valorMensal: number; ultimaData: string; ocorrencias: number; meses: number }
interface ParcelamentoDet {
  nome: string; valorParcela: number; totalParcelas: number; parcelaAtual: number;
  restantes: number; valorTotal: number; valorRestante: number; fimPrevisto: string; ultimaData: string;
}
interface RespCartao {
  transacoes: Trans[]; categorias: string[];
  assinaturas: AssinaturaDet[]; parcelamentos: ParcelamentoDet[];
  fechamentoDia?: number | null;
  cobertura?: { de: string; ate: string } | null;
  error?: string;
}

const TOOLTIP_STYLE = { background: "#13141A", border: "1px solid #1E2028", borderRadius: 12, color: "var(--text)", fontSize: 12, padding: "8px 12px" };
const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MESES_PT[m - 1]}/${String(y).slice(2)}`; };
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const corDe = (cat: string) => COR_CATEGORIA[cat as Categoria] ?? "#71717a";

const BADGE_ORIGEM: Record<Origem, { label: string; cls: string }> = {
  cartao: { label: "cartão", cls: "bg-cyan-500/10 text-cyan-400" },
  manual: { label: "manual", cls: "bg-zinc-500/15 text-zinc-400" },
  ambos:  { label: "cartão+manual", cls: "bg-violet-500/10 text-violet-300" },
};

export default function GastosTab({
  assinaturas, setAssinaturas, parcelamentos, setParcelamentos,
}: {
  assinaturas: Assinatura[];
  setAssinaturas: (fn: (prev: Assinatura[]) => Assinatura[]) => void;
  parcelamentos: Parcelamento[];
  setParcelamentos: (fn: (prev: Parcelamento[]) => Parcelamento[]) => void;
}) {
  const [cartao, setCartao] = useState<RespCartao | null>(null);
  const [erroCartao, setErroCartao] = useState<string | null>(null);
  const [mes, setMes] = useState<string>("");     // "" = período mais recente; "tudo"
  // "fatura" agrupa pelo ciclo real do cartão (fecha no dia aprendido do OFX) —
  // é o que BATE com o app do Nubank; mês calendário corta a fatura ao meio.
  const [agrupamento, setAgrupamento] = useState<"fatura" | "mes">("fatura");
  const [salvandoCat, setSalvandoCat] = useState<string | null>(null);

  const carregar = () => {
    fetch("/api/financas/cartao")
      .then((r) => r.json())
      .then((d: RespCartao) => { if (d.error) throw new Error(d.error); setCartao(d); setErroCartao(null); })
      .catch((e) => setErroCartao(e.message));
  };
  useEffect(carregar, []);

  // ── Mesclas (manual × detectado no cartão) ─────────────────────────────────
  const assMescladas = useMemo(
    () => mesclarAssinaturas(assinaturas, cartao?.assinaturas ?? []),
    [assinaturas, cartao],
  );
  const parcCalc = useMemo(() => parcelamentos.map((p) => calcParcelamento(p)), [parcelamentos]);
  const parcMesclados = useMemo(
    () => mesclarParcelamentos(parcCalc, cartao?.parcelamentos ?? []),
    [parcCalc, cartao],
  );

  const totalAssinaturas = assMescladas.filter((a) => a.ativa).reduce((s, a) => s + a.valorMensal, 0);
  const parcAtivos = parcMesclados.filter((p) => !p.quitado);
  const totalParcelasMes = parcAtivos.reduce((s, p) => s + p.valorParcela, 0);

  // ── Projeção 12 meses (assinaturas ativas + parcelas que ainda correm) ─────
  const projecao = useMemo(() => {
    const hoje = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(hoje, i);
      const parcelas = parcAtivos.reduce((s, p) => s + (i < p.restantes ? p.valorParcela : 0), 0);
      return { mes: monthLabel(m), Assinaturas: totalAssinaturas, Parcelas: parcelas };
    });
  }, [parcAtivos, totalAssinaturas]);

  // ── Cartão: período (mês calendário OU ciclo de fatura) + resumo ──────────
  const fechamentoDia = cartao?.fechamentoDia ?? null;
  const modoFatura = agrupamento === "fatura" && fechamentoDia != null;

  // Chave do período de uma transação: mês calendário, ou o mês de FECHAMENTO
  // da fatura a que ela pertence (dia ≥ fechamento → fecha no mês seguinte).
  const chavePeriodo = useMemo(() => (t: Trans): string => {
    const ym = t.data.slice(0, 7);
    if (!modoFatura) return ym;
    const dia = Number(t.data.slice(8, 10));
    if (dia < fechamentoDia!) return ym;
    const [y, m] = ym.split("-").map(Number);
    const prox = new Date(Date.UTC(y, m, 1));
    return `${prox.getUTCFullYear()}-${String(prox.getUTCMonth() + 1).padStart(2, "0")}`;
  }, [modoFatura, fechamentoDia]);

  const mesesDisponiveis = useMemo(() => {
    const s = new Set((cartao?.transacoes ?? []).map(chavePeriodo));
    return [...s].sort().reverse();
  }, [cartao, chavePeriodo]);
  const mesAtivo = (mes !== "tudo" && mesesDisponiveis.includes(mes) ? mes : "") || mesesDisponiveis[0] || "";
  const doPeriodo = useMemo(() => {
    const ts = cartao?.transacoes ?? [];
    return mes === "tudo" ? ts : ts.filter((t) => chavePeriodo(t) === mesAtivo);
  }, [cartao, mes, mesAtivo, chavePeriodo]);

  const rotuloPeriodo = (ym: string) => (modoFatura ? `fat. ${mesLabel(ym)}` : mesLabel(ym));

  const resumo = useMemo(() => {
    let gastos = 0, creditos = 0;
    const porCat = new Map<string, number>();
    for (const t of doPeriodo) {
      if (t.categoria === "Pagamento") continue;
      if (t.valor < 0) { gastos += -t.valor; porCat.set(t.categoria, (porCat.get(t.categoria) ?? 0) + -t.valor); }
      else creditos += t.valor;
    }
    const cats = [...porCat.entries()].sort((a, b) => b[1] - a[1]);
    return {
      gastos, creditos, cats,
      liquido: gastos - creditos,
      n: doPeriodo.filter((t) => t.valor < 0 && t.categoria !== "Pagamento").length,
    };
  }, [doPeriodo]);

  const recategorizar = async (t: Trans, categoria: string) => {
    setSalvandoCat(t.estabelecimento);
    setCartao((d) => d && ({ ...d, transacoes: d.transacoes.map((x) => (x.estabelecimento === t.estabelecimento ? { ...x, categoria } : x)) }));
    try {
      const r = await fetch("/api/financas/cartao", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estabelecimento: t.estabelecimento, categoria }),
      });
      if (!r.ok) throw new Error();
    } catch { carregar(); }
    finally { setSalvandoCat(null); }
  };

  // ── Cadastro manual (mesmas abas da planilha de antes) ─────────────────────
  const [novaAssNome, setNovaAssNome] = useState("");
  const [novaAssVal, setNovaAssVal] = useState("");
  const [novaAssDia, setNovaAssDia] = useState("");
  const addAssinatura = () => {
    if (!novaAssNome) return;
    setAssinaturas((prev) => [...prev, { nome: novaAssNome, valor: parseFloat(novaAssVal) || 0, dia: parseInt(novaAssDia) || 0, ativa: true }]);
    setNovaAssNome(""); setNovaAssVal(""); setNovaAssDia("");
  };
  const [novoParNome, setNovoParNome] = useState("");
  const [novoParTotal, setNovoParTotal] = useState("");
  const [novoParN, setNovoParN] = useState("");
  const [novoParData, setNovoParData] = useState("");
  const addParcelamento = () => {
    if (!novoParNome) return;
    setParcelamentos((prev) => [...prev, {
      nome: novoParNome, valor_total: parseFloat(novoParTotal) || 0,
      parcelas: Math.max(parseInt(novoParN) || 1, 1),
      data_compra: novoParData || new Date().toISOString().slice(0, 10),
    }]);
    setNovoParNome(""); setNovoParTotal(""); setNovoParN(""); setNovoParData("");
  };

  const temCartao = (cartao?.transacoes.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      {/* ── Compromissos: 3 números que resumem o mês ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-3.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            {modoFatura ? "Fatura" : "Gastos"} · {temCartao ? (mes === "tudo" ? "tudo" : rotuloPeriodo(mesAtivo)) : "—"}
          </p>
          <p className="font-mono text-xl font-extrabold text-zinc-100">{temCartao ? brl(resumo.liquido) : "—"}</p>
          <p className="text-[10.5px] text-zinc-500">
            {temCartao
              ? `${resumo.n} compras${resumo.creditos > 0 ? ` · ${brl(resumo.gastos)} − estornos ${brl(resumo.creditos)}` : ""}`
              : "importe o OFX"}
          </p>
        </div>
        <div className="glass-card p-3.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Assinaturas</p>
          <p className="font-mono text-xl font-extrabold text-violet-300">{brl(totalAssinaturas)}<span className="text-[11px] text-zinc-500">/mês</span></p>
          <p className="text-[10.5px] text-zinc-500">{assMescladas.filter((a) => a.ativa).length} ativas · manual + cartão</p>
        </div>
        <div className="glass-card p-3.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Parcelas</p>
          <p className="font-mono text-xl font-extrabold text-amber-300">{brl(totalParcelasMes)}<span className="text-[11px] text-zinc-500">/mês</span></p>
          <p className="text-[10.5px] text-zinc-500">{parcAtivos.length} em aberto · restam {brl(parcAtivos.reduce((s, p) => s + p.valorRestante, 0))}</p>
        </div>
      </div>

      {/* ── Cartão (OFX) ── */}
      <Section icon={<CreditCard size={15} />} title="Cartão — dia a dia" defaultOpen
        badge={temCartao ? <span className="text-xs font-bold text-zinc-300">{brl(resumo.gastos)}</span> : undefined}>
        {!temCartao ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-zinc-400">Nenhum lançamento de cartão ainda.</p>
            <p className="text-xs text-zinc-500">
              Exporte o OFX da fatura no app do Nubank e suba em{" "}
              <Link href="/configuracoes" className="text-cyan-400 hover:underline inline-flex items-center gap-1">
                Configurações → Importar Dados <Upload size={11} />
              </Link>. Cada importação soma ao histórico.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {fechamentoDia != null && (
                <div className="flex rounded-md overflow-hidden mr-1" style={{ border: "1px solid var(--line)" }}>
                  {(["fatura", "mes"] as const).map((g) => (
                    <button key={g} onClick={() => { setAgrupamento(g); setMes(""); }}
                      title={g === "fatura" ? `Ciclo da fatura (fecha dia ${fechamentoDia}) — bate com o app do banco` : "Mês calendário"}
                      className="font-mono text-[10px] font-bold px-2 py-1.5 uppercase"
                      style={{ background: agrupamento === g ? "rgba(255,255,255,0.08)" : "transparent", color: agrupamento === g ? "var(--text)" : "var(--faint)" }}>
                      {g === "fatura" ? "Fatura" : "Mês"}
                    </button>
                  ))}
                </div>
              )}
              {mesesDisponiveis.slice(0, 6).map((m) => {
                const on = mes !== "tudo" && m === mesAtivo;
                return (
                  <button key={m} onClick={() => setMes(m)}
                    className="font-mono text-[11px] font-bold px-3 py-1.5 rounded-md"
                    style={{ background: on ? "var(--accent-soft, rgba(52,211,153,0.12))" : "var(--panel)", border: `1px solid ${on ? "var(--pos)" : "var(--line)"}`, color: on ? "var(--pos)" : "var(--muted)" }}>
                    {rotuloPeriodo(m)}
                  </button>
                );
              })}
              <button onClick={() => setMes("tudo")}
                className="font-mono text-[11px] font-bold px-3 py-1.5 rounded-md"
                style={{ background: mes === "tudo" ? "var(--accent-soft, rgba(52,211,153,0.12))" : "var(--panel)", border: `1px solid ${mes === "tudo" ? "var(--pos)" : "var(--line)"}`, color: mes === "tudo" ? "var(--pos)" : "var(--muted)" }}>
                Tudo
              </button>
              <button onClick={carregar} title="Recarregar" className="ml-auto text-zinc-600 hover:text-zinc-400"><RefreshCw size={13} /></button>
            </div>
            {cartao?.cobertura && (
              <p className="text-[10.5px] text-zinc-600">
                Dados importados de <span className="text-zinc-400 font-mono">{dataCurta(cartao.cobertura.de)}</span> a{" "}
                <span className="text-zinc-400 font-mono">{dataCurta(cartao.cobertura.ate)}</span> — cada OFX cobre uma fatura
                (~30 dias); para o histórico antigo, exporte as faturas FECHADAS no app do Nubank e suba uma a uma
                (a importação nunca duplica).
              </p>
            )}

            {/* Categorias */}
            {resumo.cats.length > 0 && (
              <div className="space-y-2">
                {resumo.cats.map(([cat, v]) => (
                  <div key={cat} className="flex items-center gap-2.5">
                    <span className="w-32 shrink-0 text-[11px] text-zinc-400 truncate">{cat}</span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(v / resumo.cats[0][1]) * 100}%`, background: corDe(cat) }} />
                    </div>
                    <span className="w-24 text-right font-mono text-[11px] text-zinc-300">{brl(v)}</span>
                    <span className="w-10 text-right font-mono text-[10px] text-zinc-600">{((v / resumo.gastos) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* Lançamentos */}
            <div className="rounded-xl overflow-hidden border border-white/[0.05]">
              <div className="px-3 py-2 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.02)" }}>
                <span className="text-[11px] font-semibold text-zinc-400">Lançamentos</span>
                <span className="text-[10px] text-zinc-600">mudar a categoria ensina a regra p/ o estabelecimento</span>
              </div>
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {doPeriodo.map((t) => (
                      <tr key={t.chave} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-1.5 px-3 text-zinc-500 font-mono whitespace-nowrap w-14">{dataCurta(t.data)}</td>
                        <td className="px-2 text-zinc-300">
                          <span className="capitalize">{t.estabelecimento}</span>
                          {t.parcela && <span className="ml-1.5 font-mono text-[10px] text-amber-400/80">{t.parcela.n}/{t.parcela.total}</span>}
                        </td>
                        <td className="px-2 w-40">
                          <select
                            value={t.categoria}
                            disabled={salvandoCat === t.estabelecimento}
                            onChange={(e) => recategorizar(t, e.target.value)}
                            className="bg-transparent text-[11px] rounded-md px-1.5 py-0.5 cursor-pointer w-full"
                            style={{ color: corDe(t.categoria), border: `1px solid ${corDe(t.categoria)}44` }}
                          >
                            {(cartao?.categorias ?? []).map((c) => <option key={c} value={c} style={{ background: "#111318", color: "#e4e4e7" }}>{c}</option>)}
                          </select>
                        </td>
                        <td className="text-right px-3 font-mono whitespace-nowrap w-24" style={{ color: t.valor >= 0 ? "var(--pos)" : "var(--text)" }}>
                          {t.valor >= 0 ? "+" : ""}{brl(t.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {erroCartao && <p className="text-xs text-red-400 mt-2">{erroCartao}</p>}
      </Section>

      {/* ── Assinaturas (mescladas) ── */}
      <Section icon={<Repeat size={15} />} title="Assinaturas" defaultOpen
        badge={<span className="text-xs font-bold text-violet-300">{brl(totalAssinaturas)}/mês</span>}>
        <p className="text-[10.5px] text-zinc-600 pt-2 mb-2">
          Detectadas no cartão e cadastradas à mão, juntas — quando as duas fontes casam, vale o valor cobrado no cartão.
        </p>
        {assMescladas.length === 0 && <p className="text-xs text-zinc-600">Nenhuma ainda — importe o OFX ou cadastre abaixo.</p>}
        {assMescladas.map((a) => (
          <div key={`${a.origem}-${a.nome}`} className={`flex items-center py-2 border-b border-white/[0.03] last:border-0 gap-2 ${a.ativa ? "" : "opacity-45"}`}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-zinc-200 capitalize truncate">{a.nome}</div>
              <div className="text-[10.5px] text-zinc-600">
                {a.origem !== "manual" && a.ultimaData ? `última cobrança ${dataCurta(a.ultimaData)}` : a.dia ? `todo dia ${a.dia}` : "manual"}
                {a.meses > 1 ? ` · ${a.meses} meses vistos` : ""}
              </div>
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 ${BADGE_ORIGEM[a.origem].cls}`}>
              {BADGE_ORIGEM[a.origem].label}
            </span>
            <span className="text-sm font-bold text-violet-300 shrink-0">{brl(a.valorMensal)}</span>
            {a.manualIdx != null ? (
              <>
                <button
                  title={a.ativa ? "Pausar" : "Reativar"}
                  onClick={() => setAssinaturas((prev) => prev.map((x, i) => (i === a.manualIdx ? { ...x, ativa: !x.ativa } : x)))}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${a.ativa ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-600/20 text-zinc-500"}`}
                >
                  {a.ativa ? "ativa" : "pausada"}
                </button>
                <button onClick={() => setAssinaturas((prev) => prev.filter((_, i) => i !== a.manualIdx))}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-700 hover:text-red-400 hover:bg-red-500/10 shrink-0">
                  <X size={12} />
                </button>
              </>
            ) : (
              <span className="w-6 shrink-0" title="Detectada no cartão — some sozinha se parar de ser cobrada" />
            )}
          </div>
        ))}
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="text-xs text-zinc-600 mb-2">Nova assinatura manual (fora do Nubank: débito, outro cartão…)</div>
          <div className="flex gap-2">
            <div className="flex-1"><Field placeholder="Nome (ex: Netflix)" value={novaAssNome} onChange={setNovaAssNome} /></div>
            <div className="w-28"><Field placeholder="R$/mês" type="number" min="0" step="10" value={novaAssVal} onChange={setNovaAssVal} /></div>
            <div className="w-20"><Field placeholder="Dia" type="number" min="1" max="31" value={novaAssDia} onChange={setNovaAssDia} /></div>
            <button onClick={addAssinatura} className="px-3 py-2 bg-violet-500/15 text-violet-300 rounded-xl hover:bg-violet-500/25 transition-colors flex-shrink-0"><Plus size={14} /></button>
          </div>
        </div>
        <TotRow label="Total mensal (ativas)" value={brl(totalAssinaturas)} color="text-violet-300" />
      </Section>

      {/* ── Parcelamentos (mesclados) ── */}
      <Section icon={<CalendarDays size={15} />} title="Parcelamentos" defaultOpen
        badge={<span className="text-xs font-bold text-amber-300">{brl(totalParcelasMes)}/mês</span>}>
        <p className="text-[10.5px] text-zinc-600 pt-2 mb-2">
          Lidos do &quot;Parcela X/Y&quot; do cartão e cadastrados à mão, juntos — progresso e fim previstos automáticos.
        </p>
        {parcMesclados.length === 0 && <p className="text-xs text-zinc-600">Nenhum ainda.</p>}
        {parcMesclados.map((p) => (
          <div key={`${p.origem}-${p.nome}-${p.totalParcelas}-${p.valorParcela}`} className={`py-2 border-b border-white/[0.03] last:border-0 ${p.quitado ? "opacity-45" : ""}`}>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-200 capitalize truncate">{p.nome}</span>
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 ${BADGE_ORIGEM[p.origem].cls}`}>
                {BADGE_ORIGEM[p.origem].label}
              </span>
              <span className="font-mono text-[11px] font-bold text-amber-300 shrink-0">{p.parcelaAtual}/{p.totalParcelas}</span>
              {p.manualIdx != null && (
                <button onClick={() => setParcelamentos((prev) => prev.filter((_, i) => i !== p.manualIdx))}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-700 hover:text-red-400 hover:bg-red-500/10 shrink-0">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full rounded-full bg-amber-400/80" style={{ width: `${(p.parcelaAtual / p.totalParcelas) * 100}%` }} />
            </div>
            <p className="mt-1 text-[10.5px] text-zinc-500">
              {brl(p.valorParcela)}/mês · {p.quitado ? "quitado" : `faltam ${p.restantes} (${brl(p.valorRestante)}) · termina ${mesLabel(p.fimPrevisto)}`} · total {brl(p.valorTotal)}
            </p>
          </div>
        ))}
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="text-xs text-zinc-600 mb-2">Novo parcelamento manual (fora do Nubank)</div>
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[140px]"><Field placeholder="Nome (ex: Geladeira)" value={novoParNome} onChange={setNovoParNome} /></div>
            <div className="w-28"><Field placeholder="Total R$" type="number" min="0" step="50" value={novoParTotal} onChange={setNovoParTotal} /></div>
            <div className="w-20"><Field placeholder="Nx" type="number" min="1" max="48" value={novoParN} onChange={setNovoParN} /></div>
            <div className="w-36"><Field placeholder="Data compra" type="date" value={novoParData} onChange={setNovoParData} /></div>
            <button onClick={addParcelamento} className="px-3 py-2 bg-amber-500/15 text-amber-300 rounded-xl hover:bg-amber-500/25 transition-colors flex-shrink-0"><Plus size={14} /></button>
          </div>
        </div>
        <TotRow label="Comprometido por mês" value={brl(totalParcelasMes)} color="text-amber-300" />
      </Section>

      {/* ── Projeção 12 meses ── */}
      {(totalAssinaturas > 0 || parcAtivos.length > 0) && (
        <Section icon={<BarChart3 size={15} />} title="Compromissos — próximos 12 meses" defaultOpen
          badge={<span className="text-xs font-bold text-zinc-300">{brl(totalAssinaturas + totalParcelasMes)}/mês hoje</span>}>
          <p className="text-[10.5px] text-zinc-600 pt-2 mb-2">
            Assinaturas ativas + parcelas que ainda correm — as barras encolhem conforme os parcelamentos terminam.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={projecao} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis dataKey="mes" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} width={52}
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(v: number, n: string) => [brl(v), n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Assinaturas" stackId="c" fill="#a78bfa" fillOpacity={0.75} />
              <Bar dataKey="Parcelas" stackId="c" fill="#fbbf24" fillOpacity={0.75} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}
    </div>
  );
}
