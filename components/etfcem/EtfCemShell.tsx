"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ETF Cem — as ~100 maiores empresas do mundo (VOO/S&P 500 como proxy), com o
// olhar de COMPRADOR: preço, P/L, dividend yield e, principalmente, a
// DISTÂNCIA DO TOPO HISTÓRICO (ATH). Filtros para separar o que está em
// desconto do que está no pico; "possíveis barganhas" = longe do topo E com
// P/L abaixo da mediana do grupo (lucro positivo). Dado real > opinião: a
// página não recomenda — ela deixa o caro e o barato visíveis.
//
// ATH: carregado em chunks de /api/etf-cem/ath (fechamento mensal desde 1970,
// cache 7d). Enquanto não chega, usa a máxima de 52 semanas como piso.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Search, ArrowUpDown, Crown, Gem, TrendingDown, Percent, ExternalLink, Landmark, Star } from "lucide-react";
import { fetchJsonCached } from "@/lib/client-cache";
import AssetLogo from "@/components/AssetLogo";

interface EmpresaCem {
  sym: string; nome: string; pesoPct: number;
  preco: number | null; moeda: string; varDiaPct: number | null;
  pe: number | null; peForward: number | null; eps: number | null;
  yieldPct: number | null; pb: number | null; mcap: number | null;
  w52High: number | null; w52Low: number | null; rating: string | null;
}
interface Payload { updatedAt: string; fonte: string; proxy: string; empresas: EmpresaCem[] }
interface AthInfo { ath: number; ano: number | null }

type Ordem = "desconto" | "topo" | "pe" | "yield" | "peso";
const ORDEM_LABEL: Record<Ordem, string> = {
  desconto: "Mais longe do topo", topo: "Mais perto do topo", pe: "Menor P/L", yield: "Maior yield", peso: "Maior peso",
};

const usd = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactUsd = (v: number | null) => {
  if (v === null) return "—";
  if (v >= 1e12) return `US$ ${(v / 1e12).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} tri`;
  if (v >= 1e9) return `US$ ${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} bi`;
  return `US$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mi`;
};
const f1 = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

// Tom do badge de desconto: quanto MAIOR o desconto do topo, mais "oportunidade".
function descontoTone(d: number | null): { bg: string; border: string; color: string; label: string } {
  if (d === null) return { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", color: "#71717a", label: "—" };
  const pct = `−${Math.abs(d).toFixed(0)}%`;
  if (d <= -30) return { bg: "rgba(16,185,129,0.16)", border: "rgba(16,185,129,0.45)", color: "#34d399", label: pct };
  if (d <= -15) return { bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.4)", color: "#fbbf24", label: pct };
  if (d <= -5) return { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.14)", color: "#a1a1aa", label: pct };
  return { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", color: "#60a5fa", label: "no topo" };
}

export default function EtfCemShell() {
  const [data, setData] = useState<Payload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ath, setAth] = useState<Record<string, AthInfo>>({});
  const [athPend, setAthPend] = useState(true);

  const [busca, setBusca] = useState("");
  const [distMin, setDistMin] = useState(0);        // % mínimo abaixo do topo
  const [peMax, setPeMax] = useState<number | null>(null);
  const [soBarganhas, setSoBarganhas] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>("desconto");

  // Observando (watchlist) — persiste no aparelho (localStorage), para marcar
  // empresas e reencontrá-las com um toque ao voltar no app.
  const [watch, setWatch] = useState<Set<string>>(new Set());
  const [soObservando, setSoObservando] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("etfcem_watch");
      if (raw) setWatch(new Set(JSON.parse(raw) as string[]));
    } catch { /* primeiro uso */ }
  }, []);
  const alternarWatch = (sym: string) => {
    setWatch((prev) => {
      const s = new Set(prev);
      if (s.has(sym)) s.delete(sym); else s.add(sym);
      try { localStorage.setItem("etfcem_watch", JSON.stringify([...s])); } catch { /* sem storage */ }
      if (s.size === 0) setSoObservando(false);
      return s;
    });
  };

  useEffect(() => {
    fetchJsonCached<Payload>("/api/etf-cem", 10 * 60_000)
      .then((d) => {
        if ((d as unknown as { error?: string }).error) throw new Error((d as unknown as { error: string }).error);
        setData(d);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"));
  }, []);

  // ATH em chunks de 25, em paralelo (cache CDN/cliente 24h por chunk).
  useEffect(() => {
    if (!data) return;
    const syms = data.empresas.map((e) => e.sym);
    const chunks: string[][] = [];
    for (let i = 0; i < syms.length; i += 25) chunks.push(syms.slice(i, i + 25));
    let vivos = chunks.length;
    for (const c of chunks) {
      fetchJsonCached<{ ath: Record<string, AthInfo> }>(`/api/etf-cem/ath?symbols=${c.join(",")}`, 24 * 60 * 60_000)
        .then((r) => setAth((prev) => ({ ...prev, ...(r.ath ?? {}) })))
        .catch(() => {})
        .finally(() => { vivos -= 1; if (vivos === 0) setAthPend(false); });
    }
  }, [data]);

  // Linhas enriquecidas: ATH efetivo = max(ATH histórico, máx. 52s, preço).
  const linhas = useMemo(() => {
    return (data?.empresas ?? []).map((e) => {
      const a = ath[e.sym]?.ath ?? null;
      const athEff = Math.max(a ?? 0, e.w52High ?? 0, e.preco ?? 0) || null;
      const distAth = e.preco !== null && athEff ? ((e.preco / athEff) - 1) * 100 : null; // ≤ 0
      const pos52 = e.preco !== null && e.w52High !== null && e.w52Low !== null && e.w52High > e.w52Low
        ? Math.min(100, Math.max(0, ((e.preco - e.w52Low) / (e.w52High - e.w52Low)) * 100))
        : null;
      return { ...e, athEff, athAno: ath[e.sym]?.ano ?? null, athReal: a !== null, distAth, pos52 };
    });
  }, [data, ath]);

  const medianaPE = useMemo(() => {
    const pes = linhas.map((l) => l.pe).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
    return pes.length ? pes[Math.floor(pes.length / 2)] : null;
  }, [linhas]);

  const kpis = useMemo(() => {
    const comDist = linhas.filter((l) => l.distAth !== null);
    const desc20 = comDist.filter((l) => l.distAth! <= -20).length;
    const noTopo = comDist.filter((l) => l.distAth! > -5).length;
    const maior = comDist.reduce<{ sym: string; d: number } | null>((acc, l) => (!acc || l.distAth! < acc.d ? { sym: l.sym, d: l.distAth! } : acc), null);
    return { desc20, noTopo, maior };
  }, [linhas]);

  const ehBarganha = (l: (typeof linhas)[number]) =>
    l.distAth !== null && l.distAth <= -15 && l.pe !== null && l.pe > 0 && medianaPE !== null && l.pe < medianaPE;

  const filtradas = useMemo(() => {
    let out = linhas;
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      out = out.filter((l) => `${l.sym} ${l.nome}`.toLowerCase().includes(q));
    }
    if (distMin > 0) out = out.filter((l) => l.distAth !== null && l.distAth <= -distMin);
    if (peMax !== null) out = out.filter((l) => l.pe !== null && l.pe > 0 && l.pe <= peMax);
    if (soBarganhas) out = out.filter(ehBarganha);
    if (soObservando) out = out.filter((l) => watch.has(l.sym));
    const cmp: Record<Ordem, (a: typeof out[number], b: typeof out[number]) => number> = {
      desconto: (a, b) => (a.distAth ?? 0) - (b.distAth ?? 0),
      topo: (a, b) => (b.distAth ?? -999) - (a.distAth ?? -999),
      pe: (a, b) => (a.pe !== null && a.pe > 0 ? a.pe : 9e9) - (b.pe !== null && b.pe > 0 ? b.pe : 9e9),
      yield: (a, b) => (b.yieldPct ?? -1) - (a.yieldPct ?? -1),
      peso: (a, b) => b.pesoPct - a.pesoPct,
    };
    return [...out].sort(cmp[ordem]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, busca, distMin, peMax, soBarganhas, soObservando, watch, ordem, medianaPE]);

  if (erro) return <p className="p-6 text-center text-xs text-red-400">ETF Cem indisponível: {erro}</p>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-100"><Crown size={18} className="text-amber-400" /> ETF Cem</h1>
        <p className="text-xs text-zinc-500">
          As 100 maiores empresas do mundo via {data?.proxy ?? "VOO (S&P 500)"} — preço, P/L e distância do topo histórico
          {athPend && <span className="ml-1 text-zinc-600">· calculando ATHs…</span>}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { icon: <TrendingDown size={13} />, label: "Com desconto ≥ 20%", valor: `${kpis.desc20}`, sub: "abaixo do topo histórico" },
          { icon: <Crown size={13} />, label: "No topo (< 5%)", valor: `${kpis.noTopo}`, sub: "perto da máxima" },
          { icon: <Percent size={13} />, label: "P/L mediano", valor: medianaPE !== null ? f1(medianaPE) : "—", sub: "trailing, lucro positivo" },
          { icon: <Gem size={13} />, label: "Maior desconto", valor: kpis.maior ? `${kpis.maior.d.toFixed(0)}%` : "—", sub: kpis.maior?.sym ?? "—" },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">{c.icon} {c.label}</p>
            <p className="mt-1 font-mono text-base font-bold text-zinc-100">{c.valor}</p>
            <p className="truncate text-[10px] text-zinc-500">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[170px] flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa ou ticker…"
            className="w-full rounded-lg bg-white/[0.05] py-2 pl-8 pr-3 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-amber-500/50"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }}
          />
        </div>
        <select value={distMin} onChange={(e) => setDistMin(Number(e.target.value))} className="rounded-lg bg-white/[0.05] px-2.5 py-2 text-xs text-zinc-200" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
          <option value={0}>Distância do topo: todas</option>
          <option value={10}>≥ 10% abaixo do topo</option>
          <option value={20}>≥ 20% abaixo do topo</option>
          <option value={30}>≥ 30% abaixo do topo</option>
        </select>
        <select value={peMax ?? ""} onChange={(e) => setPeMax(e.target.value ? Number(e.target.value) : null)} className="rounded-lg bg-white/[0.05] px-2.5 py-2 text-xs text-zinc-200" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
          <option value="">P/L: todos</option>
          <option value={15}>P/L ≤ 15</option>
          <option value={20}>P/L ≤ 20</option>
          <option value={30}>P/L ≤ 30</option>
        </select>
        <button
          onClick={() => setSoObservando((v) => !v)}
          disabled={watch.size === 0}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors disabled:opacity-40"
          style={{
            background: soObservando ? "rgba(245,158,11,0.16)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${soObservando ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.1)"}`,
            color: soObservando ? "#fbbf24" : "#a1a1aa",
          }}
          title={watch.size === 0 ? "Toque na estrela de uma empresa para observá-la" : "Mostrar só as que estou observando"}
        >
          <Star size={12} fill={soObservando ? "currentColor" : "none"} /> Observando ({watch.size})
        </button>
        <button
          onClick={() => setSoBarganhas((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors"
          style={{
            background: soBarganhas ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${soBarganhas ? "rgba(16,185,129,0.45)" : "rgba(255,255,255,0.1)"}`,
            color: soBarganhas ? "#34d399" : "#a1a1aa",
          }}
          title="≥15% abaixo do topo E P/L positivo abaixo da mediana do grupo"
        >
          <Gem size={12} /> Possíveis barganhas
        </button>
        <button
          onClick={() => setOrdem((o) => (o === "desconto" ? "pe" : o === "pe" ? "yield" : o === "yield" ? "peso" : o === "peso" ? "topo" : "desconto"))}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-2 text-xs text-zinc-300"
          style={{ border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <ArrowUpDown size={12} /> {ORDEM_LABEL[ordem]}
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-1.5">
        {filtradas.length === 0 && <p className="py-10 text-center text-xs text-zinc-600">Nenhuma empresa com esses filtros.</p>}
        {filtradas.map((l) => {
          const tone = descontoTone(l.distAth);
          const barganha = ehBarganha(l);
          const observada = watch.has(l.sym);
          return (
            <a
              key={l.sym}
              href={`https://finance.yahoo.com/quote/${encodeURIComponent(l.sym)}`}
              target="_blank" rel="noopener noreferrer"
              className="block rounded-2xl p-3 transition-colors hover:bg-white/[0.05]"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${observada ? "rgba(245,158,11,0.35)" : barganha ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.07)"}` }}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); alternarWatch(l.sym); }}
                  className="shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10"
                  style={{ color: observada ? "#fbbf24" : "#52525b" }}
                  aria-label={observada ? `Deixar de observar ${l.sym}` : `Observar ${l.sym}`}
                  title={observada ? "Observando — toque para remover" : "Marcar como observando"}
                >
                  <Star size={15} fill={observada ? "currentColor" : "none"} />
                </button>
                <AssetLogo ticker={l.sym} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-zinc-100">
                    {l.nome}
                    {barganha && <Gem size={11} className="shrink-0 text-emerald-400" />}
                  </p>
                  <p className="truncate text-[10px] text-zinc-500">
                    {l.sym} · peso {l.pesoPct.toFixed(2)}%{l.rating ? ` · ${l.rating}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-zinc-100">US$ {usd(l.preco)}</p>
                  <p className={`font-mono text-[10px] ${l.varDiaPct !== null && l.varDiaPct < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {l.varDiaPct !== null ? `${l.varDiaPct >= 0 ? "+" : ""}${l.varDiaPct.toFixed(2)}% hoje` : "—"}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg px-2 py-1 font-mono text-[11px] font-bold" style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color }} title={l.athEff ? `Topo ${l.athReal ? "histórico" : "(52s, ATH carregando)"}: US$ ${usd(l.athEff)}${l.athAno ? ` em ${l.athAno}` : ""}` : undefined}>
                  {tone.label}
                </span>
              </div>

              {/* Fundamentals + posição na faixa de 52 semanas */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[46px] text-[10px] text-zinc-500">
                <span>P/L <span className={`font-mono ${l.pe !== null && medianaPE !== null && l.pe > 0 && l.pe < medianaPE ? "text-emerald-400" : "text-zinc-300"}`}>{f1(l.pe)}</span>{l.peForward !== null && <span className="text-zinc-600"> (proj. {f1(l.peForward)})</span>}</span>
                <span>yield <span className="font-mono text-zinc-300">{l.yieldPct !== null ? `${l.yieldPct.toFixed(1)}%` : "—"}</span></span>
                <span>P/VP <span className="font-mono text-zinc-300">{f1(l.pb)}</span></span>
                <span className="flex items-center gap-1"><Landmark size={9} /> {compactUsd(l.mcap)}</span>
                {l.pos52 !== null && (
                  <span className="flex min-w-[110px] flex-1 items-center gap-1.5" title={`Faixa 52 semanas: US$ ${usd(l.w52Low)} – US$ ${usd(l.w52High)}`}>
                    <span className="font-mono text-[9px] text-zinc-600">52s</span>
                    <span className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${l.pos52}%`, background: l.pos52 >= 80 ? "#60a5fa" : l.pos52 <= 30 ? "#34d399" : "#a1a1aa" }} />
                    </span>
                  </span>
                )}
                <ExternalLink size={10} className="text-zinc-700" />
              </div>
            </a>
          );
        })}
      </div>

      <p className="text-[10px] text-zinc-600">
        Proxy: {data?.proxy ?? "VOO (S&P 500)"} — as ~100 maiores posições cobrem as maiores empresas listadas do mundo.
        Topo histórico pelo fechamento mensal (Yahoo, desde 1970); enquanto o ATH carrega, vale a máxima de 52 semanas.
        P/L trailing (projetado entre parênteses). 💎 barganha = ≥15% abaixo do topo com P/L positivo abaixo da mediana —
        é filtro quantitativo, não recomendação: preço baixo pode ter motivo.
      </p>
    </div>
  );
}
