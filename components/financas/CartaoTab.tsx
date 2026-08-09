"use client";

// Aba "Cartão" da página Finanças — consumo do cartão de crédito importado do
// OFX do Nubank (Configurações → Importar Dados). Mostra o dia a dia com
// categoria (recategorizar aqui vira REGRA por estabelecimento e vale para o
// histórico inteiro + importações futuras), mais as assinaturas e os
// parcelamentos DETECTADOS automaticamente nos lançamentos.

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Repeat, CalendarDays, Upload, RefreshCw } from "lucide-react";
import Link from "next/link";
import { COR_CATEGORIA, type Categoria } from "@/lib/financas/categorias";

interface Trans {
  chave: string; data: string; valor: number; descricao: string;
  estabelecimento: string; categoria: string; parcela: { n: number; total: number } | null;
}
interface AssinaturaDet { nome: string; valorMensal: number; ultimaData: string; ocorrencias: number; meses: number }
interface ParcelamentoDet {
  nome: string; valorParcela: number; totalParcelas: number; parcelaAtual: number;
  restantes: number; valorTotal: number; valorRestante: number; fimPrevisto: string; ultimaData: string;
}
interface Resp {
  transacoes: Trans[]; categorias: string[];
  assinaturas: AssinaturaDet[]; parcelamentos: ParcelamentoDet[]; error?: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MESES_PT[m - 1]}/${String(y).slice(2)}`; };
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const corDe = (cat: string) => COR_CATEGORIA[cat as Categoria] ?? "#71717a";

export default function CartaoTab() {
  const [dados, setDados] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mes, setMes] = useState<string>("");        // "" = mês mais recente; "tudo" = tudo
  const [salvandoCat, setSalvandoCat] = useState<string | null>(null);

  const carregar = () => {
    fetch("/api/financas/cartao")
      .then((r) => r.json())
      .then((d: Resp) => { if (d.error) throw new Error(d.error); setDados(d); })
      .catch((e) => setErro(e.message));
  };
  useEffect(carregar, []);

  const mesesDisponiveis = useMemo(() => {
    const s = new Set((dados?.transacoes ?? []).map((t) => t.data.slice(0, 7)));
    return [...s].sort().reverse();
  }, [dados]);
  const mesAtivo = mes || mesesDisponiveis[0] || "";

  const doPeriodo = useMemo(() => {
    const ts = dados?.transacoes ?? [];
    if (mes === "tudo") return ts;
    return ts.filter((t) => t.data.slice(0, 7) === mesAtivo);
  }, [dados, mes, mesAtivo]);

  const resumo = useMemo(() => {
    let gastos = 0, creditos = 0;
    const porCat = new Map<string, number>();
    for (const t of doPeriodo) {
      if (t.categoria === "Pagamento") continue;           // pagar a fatura não é consumo
      if (t.valor < 0) {
        gastos += -t.valor;
        porCat.set(t.categoria, (porCat.get(t.categoria) ?? 0) + -t.valor);
      } else {
        creditos += t.valor;                                // estornos/IOF de volta
      }
    }
    const cats = [...porCat.entries()].sort((a, b) => b[1] - a[1]);
    return { gastos, creditos, cats, n: doPeriodo.filter((t) => t.valor < 0 && t.categoria !== "Pagamento").length };
  }, [doPeriodo]);

  const recategorizar = async (t: Trans, categoria: string) => {
    setSalvandoCat(t.estabelecimento);
    // Otimista: aplica a TODAS as transações do mesmo estabelecimento.
    setDados((d) => d && ({
      ...d,
      transacoes: d.transacoes.map((x) => (x.estabelecimento === t.estabelecimento ? { ...x, categoria } : x)),
    }));
    try {
      const r = await fetch("/api/financas/cartao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estabelecimento: t.estabelecimento, categoria }),
      });
      if (!r.ok) throw new Error();
    } catch {
      carregar(); // desfaz o otimismo recarregando a verdade
    } finally {
      setSalvandoCat(null);
    }
  };

  if (erro) return <p className="text-sm text-red-400">{erro}</p>;
  if (!dados) return <p className="text-sm text-zinc-500 py-8 text-center">Carregando cartão…</p>;

  if (dados.transacoes.length === 0) {
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <CreditCard size={28} className="mx-auto text-zinc-600" />
        <p className="text-sm text-zinc-400">Nenhum lançamento de cartão ainda.</p>
        <p className="text-xs text-zinc-500">
          Exporte o OFX no app do Nubank (fatura → exportar) e suba em{" "}
          <Link href="/configuracoes" className="text-cyan-400 hover:underline inline-flex items-center gap-1">
            Configurações → Importar Dados <Upload size={11} />
          </Link>
          . Cada importação soma ao histórico — assinaturas e parcelamentos são detectados sozinhos.
        </p>
      </div>
    );
  }

  const totalAssinaturas = dados.assinaturas.reduce((s, a) => s + a.valorMensal, 0);
  const totalParcelasMes = dados.parcelamentos.filter((p) => p.restantes > 0).reduce((s, p) => s + p.valorParcela, 0);

  return (
    <div className="space-y-4">
      {/* ── Período + resumo ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {mesesDisponiveis.slice(0, 6).map((m) => {
          const on = mes !== "tudo" && m === mesAtivo;
          return (
            <button key={m} onClick={() => setMes(m)}
              className="font-mono text-[11px] font-bold px-3 py-1.5 rounded-md"
              style={{ background: on ? "var(--accent-soft, rgba(52,211,153,0.12))" : "var(--panel)", border: `1px solid ${on ? "var(--pos)" : "var(--line)"}`, color: on ? "var(--pos)" : "var(--muted)" }}>
              {mesLabel(m)}
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card p-3.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Gastos · {mes === "tudo" ? "tudo" : mesLabel(mesAtivo)}</p>
          <p className="font-mono text-xl font-extrabold text-zinc-100">{brl(resumo.gastos)}</p>
          <p className="text-[10.5px] text-zinc-500">{resumo.n} compras{resumo.creditos > 0 ? ` · estornos ${brl(resumo.creditos)}` : ""}</p>
        </div>
        <div className="glass-card p-3.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Maior categoria</p>
          <p className="font-mono text-xl font-extrabold" style={{ color: corDe(resumo.cats[0]?.[0] ?? "") }}>{resumo.cats[0]?.[0] ?? "—"}</p>
          <p className="text-[10.5px] text-zinc-500">{resumo.cats[0] ? brl(resumo.cats[0][1]) : ""}</p>
        </div>
        <div className="glass-card p-3.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Assinaturas detectadas</p>
          <p className="font-mono text-xl font-extrabold text-violet-300">{brl(totalAssinaturas)}<span className="text-[11px] text-zinc-500">/mês</span></p>
          <p className="text-[10.5px] text-zinc-500">{dados.assinaturas.length} serviços</p>
        </div>
        <div className="glass-card p-3.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Parcelas em aberto</p>
          <p className="font-mono text-xl font-extrabold text-amber-300">{brl(totalParcelasMes)}<span className="text-[11px] text-zinc-500">/mês</span></p>
          <p className="text-[10.5px] text-zinc-500">{dados.parcelamentos.filter((p) => p.restantes > 0).length} compras parceladas</p>
        </div>
      </div>

      {/* ── Categorias (barras) ── */}
      {resumo.cats.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-zinc-300 mb-3">Por categoria · {mes === "tudo" ? "tudo" : mesLabel(mesAtivo)}</h3>
          <div className="space-y-2">
            {resumo.cats.map(([cat, v]) => (
              <div key={cat} className="flex items-center gap-2.5">
                <span className="w-32 shrink-0 text-[11px] text-zinc-400 truncate">{cat}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(v / resumo.cats[0][1]) * 100}%`, background: corDe(cat) }} />
                </div>
                <span className="w-24 text-right font-mono text-[11px] text-zinc-300">{brl(v)}</span>
                <span className="w-12 text-right font-mono text-[10px] text-zinc-600">{((v / resumo.gastos) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Assinaturas + Parcelamentos detectados ── */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5"><Repeat size={13} /> Assinaturas detectadas</h3>
          <p className="text-[10.5px] text-zinc-600 mb-3">Cobranças recorrentes (ou serviços de assinatura conhecidos) achadas nos lançamentos — sem cadastro manual.</p>
          {dados.assinaturas.length === 0 ? <p className="text-xs text-zinc-600">Nenhuma ainda.</p> : (
            <div className="space-y-1.5">
              {dados.assinaturas.map((a) => (
                <div key={a.nome} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.18)" }}>
                  <span className="text-xs text-zinc-200 capitalize truncate">{a.nome}</span>
                  <span className="text-[10px] text-zinc-600 shrink-0">{a.meses > 1 ? `${a.meses} meses` : `vista ${dataCurta(a.ultimaData)}`}</span>
                  <span className="font-mono text-xs font-bold text-violet-300 shrink-0">{brl(a.valorMensal)}/mês</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5"><CalendarDays size={13} /> Parcelamentos detectados</h3>
          <p className="text-[10.5px] text-zinc-600 mb-3">Lidos do "Parcela X/Y" dos lançamentos — progresso e fim previstos automáticos.</p>
          {dados.parcelamentos.length === 0 ? <p className="text-xs text-zinc-600">Nenhum ainda.</p> : (
            <div className="space-y-2">
              {dados.parcelamentos.map((p) => (
                <div key={`${p.nome}-${p.totalParcelas}-${p.valorParcela}`} className="rounded-lg px-2.5 py-2" style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-200 capitalize truncate">{p.nome}</span>
                    <span className="font-mono text-[11px] font-bold text-amber-300 shrink-0">{p.parcelaAtual}/{p.totalParcelas}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full bg-amber-400/80" style={{ width: `${(p.parcelaAtual / p.totalParcelas) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[10.5px] text-zinc-500">
                    {brl(p.valorParcela)}/mês · {p.restantes > 0 ? `faltam ${p.restantes} (${brl(p.valorRestante)}) · termina ${mesLabel(p.fimPrevisto)}` : "quitado"} · total {brl(p.valorTotal)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Transações ── */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-300">Lançamentos · {mes === "tudo" ? "tudo" : mesLabel(mesAtivo)}</h3>
          <span className="text-[10px] text-zinc-600">mudar a categoria ensina a regra para o estabelecimento inteiro</span>
        </div>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: "var(--panel)" }}>
              <tr className="text-[10px] text-zinc-600 uppercase">
                <th className="text-left font-semibold py-2 px-3">Data</th>
                <th className="text-left font-semibold px-3">Estabelecimento</th>
                <th className="text-left font-semibold px-3">Categoria</th>
                <th className="text-right font-semibold px-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {doPeriodo.map((t) => (
                <tr key={t.chave} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-1.5 px-3 text-zinc-500 font-mono whitespace-nowrap">{dataCurta(t.data)}</td>
                  <td className="px-3 text-zinc-300">
                    <span className="capitalize">{t.estabelecimento}</span>
                    {t.parcela && <span className="ml-1.5 font-mono text-[10px] text-amber-400/80">{t.parcela.n}/{t.parcela.total}</span>}
                  </td>
                  <td className="px-3">
                    <select
                      value={t.categoria}
                      disabled={salvandoCat === t.estabelecimento}
                      onChange={(e) => recategorizar(t, e.target.value)}
                      className="bg-transparent text-[11px] rounded-md px-1.5 py-0.5 cursor-pointer"
                      style={{ color: corDe(t.categoria), border: `1px solid ${corDe(t.categoria)}44` }}
                    >
                      {dados.categorias.map((c) => <option key={c} value={c} style={{ background: "#111318", color: "#e4e4e7" }}>{c}</option>)}
                    </select>
                  </td>
                  <td className="text-right px-3 font-mono whitespace-nowrap" style={{ color: t.valor >= 0 ? "var(--pos)" : "var(--text)" }}>
                    {t.valor >= 0 ? "+" : ""}{brl(t.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10.5px] text-zinc-600 text-center">
        Fonte: aba cartao_transacoes (OFX importado em Configurações). Pagamentos de fatura ficam fora dos totais.
      </p>
    </div>
  );
}
