"use client";

// ── Hoje — o fechamento do dia, conta por conta ────────────────────────────────
// Ordem pedida pelo dono: Internacional (IBKR) → Brasil → Cripto → Câmbio →
// Total (com a decomposição VISUAL ativos × câmbio) → melhores/piores com
// notícias (imagem) → leitura de IA no topo.
//
// Semântica canônica (lib/portfolio.ts):
//   dayChangeBRL   = variação real da posição no dia em R$ (preço + câmbio)
//   dayChangeFxBRL = parte disso vinda SÓ do câmbio do dia
//   → preço puro   = dayChangeBRL − dayChangeFxBRL
// Os grupos mostram PREÇO PURO (o câmbio tem seção própria); a soma dos grupos
// + câmbio fecha exatamente com o total canônico (dayChangeTotalBRL).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Sparkles, TrendingUp, TrendingDown, Newspaper } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { compactBRL } from "@/lib/format";
import { isRendaFixa } from "@/lib/sectors";

// ── Helpers ────────────────────────────────────────────────────────────────────

function cleanTicker(t: string | null | undefined): string {
  if (!t) return "—";
  return t.replace(/\.SA$/, "").replace(/-USD$/, "").replace(/-BRL$/, "").replace(/=X$/, "");
}

function signedBRL(v: number): string {
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${compactBRL(Math.abs(v))}`;
}

function signedUSD(v: number): string {
  const sign = v >= 0 ? "+" : "−";
  const abs = Math.abs(v);
  const s = abs >= 1000 ? `${(abs / 1000).toFixed(1).replace(".", ",")}k` : abs.toFixed(0);
  return `${sign}US$ ${s}`;
}

function pctSigned(p: number, decimals = 2): string {
  const sign = p >= 0 ? "+" : "−";
  return `${sign}${Math.abs(p).toFixed(decimals).replace(".", ",")}%`;
}

function relTime(dateStr: string): string {
  const t = Date.parse(dateStr);
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 0) return "agora";
  const min = diff / 60000;
  if (min < 60) return `há ${Math.max(1, Math.round(min))}min`;
  const h = min / 60;
  if (h < 24) return `há ${Math.round(h)}h`;
  return `há ${Math.round(h / 24)}d`;
}

/** Proxy de imagem (mesma regra da Home): nunca renderiza host Google direto. */
function proxyImg(url: string | null): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes("google") || h.endsWith("gstatic.com") || h.endsWith("googleusercontent.com") || h.endsWith("ggpht.com")) return null;
  } catch { return null; }
  return `/api/img-proxy?url=${encodeURIComponent(url)}`;
}

function colorOf(v: number): string {
  return Math.abs(v) < 0.5 ? "var(--muted)" : v >= 0 ? "var(--pos)" : "var(--neg)";
}

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Mover {
  ticker: string;
  setor: string;
  priceBRL: number;   // efeito PREÇO do dia em R$ (sem câmbio)
  totalBRL: number;   // efeito total (preço + câmbio) — usado no total canônico
  fxBRL: number;      // efeito câmbio
  pctMove: number;    // variação % do papel no dia (moeda nativa)
  nativeChange: number;
  moeda: string;
  marketState?: string;
  valorAtualBRL: number;
}

interface AssetNewsItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  imagem: string | null;
}

// ── Chip de sessão ─────────────────────────────────────────────────────────────

function sessionChip(states: Set<string>, isCrypto = false): { text: string; color: string } {
  if (isCrypto) return { text: "24H", color: "var(--info)" };
  if (states.has("REGULAR")) return { text: "AO VIVO", color: "var(--pos)" };
  if (states.has("PRE") || states.has("PREPRE")) return { text: "PRÉ-MERCADO", color: "var(--accent)" };
  if (states.has("POST") || states.has("POSTPOST")) return { text: "PÓS-MERCADO", color: "var(--accent)" };
  return { text: "FECHADO", color: "var(--muted)" };
}

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="font-mono inline-flex items-center gap-1.5 px-2 py-0.5 shrink-0"
      style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color, border: `1px solid ${color}`, opacity: 0.9 }}
    >
      <span className="t-blink" style={{ width: 5, height: 5, borderRadius: 99, background: color }} />
      {text}
    </span>
  );
}

// ── Linha de ledger (barra divergente: perda ⟵ | ⟶ ganho) ─────────────────────

function LedgerRow({
  label, value, maxAbs, sub, strong = false, valueText,
}: { label: string; value: number; maxAbs: number; sub?: string; strong?: boolean; valueText?: string }) {
  const pos = value >= 0;
  const w = Math.min(100, (Math.abs(value) / Math.max(maxAbs, 1)) * 100);
  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: "minmax(64px,auto) 1fr auto", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--line)" }}
    >
      <span className="font-mono truncate" style={{ fontSize: strong ? 13.5 : 12.5, fontWeight: 700, color: "var(--text)" }}>
        {label}
      </span>
      <div className="flex items-center" style={{ height: 14 }}>
        <div className="flex-1 flex justify-end">
          {!pos && <div style={{ width: `${w}%`, height: 10, background: "var(--neg)", opacity: strong ? 1 : 0.85 }} />}
        </div>
        <div style={{ width: 1, height: 14, background: "var(--line-strong)" }} />
        <div className="flex-1 flex justify-start">
          {pos && <div style={{ width: `${w}%`, height: 10, background: "var(--pos)", opacity: strong ? 1 : 0.85 }} />}
        </div>
      </div>
      <div className="text-right" style={{ minWidth: 86 }}>
        <div className="font-mono tnum" style={{ fontSize: strong ? 13.5 : 12.5, fontWeight: 700, color: colorOf(value) }}>
          {valueText ?? signedBRL(value)}
        </div>
        {sub && <div className="font-mono tnum" style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Card de grupo (Internacional / Brasil / Cripto) ───────────────────────────

function GroupCard({
  emoji, title, movers, chip, nativeCcy,
}: { emoji: string; title: string; movers: Mover[]; chip: { text: string; color: string }; nativeCcy?: "USD" }) {
  const priceSum = movers.reduce((s, m) => s + m.priceBRL, 0);
  const valueSum = movers.reduce((s, m) => s + m.valorAtualBRL, 0);
  const nativeSum = movers.reduce((s, m) => s + m.nativeChange, 0);
  const pct = valueSum > 0 ? (priceSum / valueSum) * 100 : 0;
  const ranked = [...movers].sort((a, b) => Math.abs(b.priceBRL) - Math.abs(a.priceBRL));
  const shown = ranked.slice(0, 4).filter(m => Math.abs(m.priceBRL) >= 0.5);
  const rest = ranked.slice(4);
  const restSum = rest.reduce((s, m) => s + m.priceBRL, 0);
  const maxAbs = Math.max(...ranked.map(m => Math.abs(m.priceBRL)), 1);

  return (
    <section className="glass-card p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="section-title">{emoji} {title}</h2>
        <Chip {...chip} />
      </div>
      <div className="flex items-baseline gap-3 mt-2 mb-3 flex-wrap">
        <span className="font-mono tnum" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: colorOf(priceSum) }}>
          {signedBRL(priceSum)}
        </span>
        <span className="font-mono tnum" style={{ fontSize: 12, fontWeight: 600, color: colorOf(priceSum) }}>
          {pctSigned(pct)}
        </span>
        {nativeCcy === "USD" && Math.abs(nativeSum) >= 1 && (
          <span className="font-mono tnum" style={{ fontSize: 11, color: "var(--muted)" }}>
            {signedUSD(nativeSum)} em dólar
          </span>
        )}
        <span className="font-mono" style={{ fontSize: 10, color: "var(--faint)", marginLeft: "auto" }}>
          {movers.length} ativo{movers.length === 1 ? "" : "s"} · {compactBRL(valueSum)}
        </span>
      </div>
      {shown.length > 0 ? (
        <div>
          {shown.map(m => (
            <LedgerRow
              key={m.ticker}
              label={m.ticker}
              value={m.priceBRL}
              maxAbs={maxAbs}
              sub={pctSigned(m.pctMove, 1) + " no dia"}
            />
          ))}
          {rest.length > 0 && Math.abs(restSum) >= 0.5 && (
            <LedgerRow label={`+${rest.length} outros`} value={restSum} maxAbs={maxAbs} />
          )}
        </div>
      ) : (
        <p className="font-mono" style={{ fontSize: 11, color: "var(--faint)" }}>
          Sem variação relevante até o último fechamento.
        </p>
      )}
    </section>
  );
}

// ── Notícia com imagem (padrão visual da Home) ────────────────────────────────

function NewsThumb({ imagem }: { imagem: string | null }) {
  const [broken, setBroken] = useState(false);
  const src = proxyImg(imagem);
  if (!src || broken) {
    return (
      <div className="shrink-0 grid place-items-center" style={{ width: 92, height: 64, background: "var(--input)", border: "1px solid var(--line)" }}>
        <Newspaper size={18} style={{ color: "var(--faint)" }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="shrink-0 object-cover"
      style={{ width: 92, height: 64, border: "1px solid var(--line)" }}
    />
  );
}

function MoverNewsCard({
  kind, mover, articles, state,
}: { kind: "melhor" | "pior"; mover: Mover | null; articles: AssetNewsItem[]; state: "loading" | "done" }) {
  const up = kind === "melhor";
  const color = up ? "var(--pos)" : "var(--neg)";
  return (
    <section className="glass-card p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title">
          {up ? <TrendingUp size={14} style={{ color }} /> : <TrendingDown size={14} style={{ color }} />}
          {up ? "Melhor do dia" : "Pior do dia"}
        </h2>
      </div>
      {mover ? (
        <>
          <div className="flex items-baseline gap-3 mt-2.5 flex-wrap">
            <span className="font-mono" style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{mover.ticker}</span>
            <span className="font-mono tnum" style={{ fontSize: 15, fontWeight: 700, color }}>{pctSigned(mover.pctMove, 1)}</span>
            <span className="font-mono tnum" style={{ fontSize: 12, color: "var(--muted)" }}>{signedBRL(mover.totalBRL)} no bolso</span>
          </div>
          <div className="mt-3 space-y-2.5">
            {articles.slice(0, 2).map((a, i) => (
              <a key={i} href={a.link} target="_blank" rel="noopener noreferrer" className="flex gap-3 group">
                <NewsThumb imagem={a.imagem} />
                <div className="min-w-0">
                  <p className="line-clamp-2 group-hover:underline" style={{ fontSize: 12.5, lineHeight: 1.35, color: "var(--text)", fontWeight: 600 }}>
                    {a.titulo}
                  </p>
                  <p className="font-mono truncate" style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                    {a.fonte}{a.data ? ` · ${relTime(a.data)}` : ""}
                  </p>
                </div>
              </a>
            ))}
            {state === "loading" && articles.length === 0 && (
              <div className="animate-pulse space-y-2">
                <div style={{ height: 64, background: "var(--input)" }} />
              </div>
            )}
            {state === "done" && articles.length === 0 && (
              <p className="font-mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>Sem manchete recente sobre {mover.ticker}.</p>
            )}
          </div>
        </>
      ) : (
        <p className="font-mono mt-3" style={{ fontSize: 11, color: "var(--faint)" }}>Sem movimento no dia.</p>
      )}
    </section>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function HojePage() {
  const { data, loading, refetch } = usePortfolio();
  const [refreshing, setRefreshing] = useState(false);
  const [aiLede, setAiLede] = useState<string | null>(null);
  const ledeFetchedRef = useRef(false);
  const [newsBest, setNewsBest] = useState<AssetNewsItem[]>([]);
  const [newsWorst, setNewsWorst] = useState<AssetNewsItem[]>([]);
  const [newsState, setNewsState] = useState<"loading" | "done">("loading");
  const newsFetchedRef = useRef<string | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    ledeFetchedRef.current = false;
    newsFetchedRef.current = null;
    setAiLede(null);
    setNewsBest([]);
    setNewsWorst([]);
    setNewsState("loading");
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!loading && refreshing) setRefreshing(false);
  }, [loading, refreshing]);

  // ── Movers do dia (RV apenas; RF não tem variação diária) ──
  const movers = useMemo<Mover[]>(() => {
    if (!data?.positions) return [];
    const out: Mover[] = [];
    for (const p of data.positions) {
      if (!p?.ticker || (p.quantidade ?? 0) <= 0) continue;
      if (isRendaFixa(p.setor ?? "")) continue;
      const totalBRL = typeof p.dayChangeBRL === "number" ? p.dayChangeBRL : 0;
      const fxBRL = typeof p.dayChangeFxBRL === "number" ? p.dayChangeFxBRL : 0;
      out.push({
        ticker: cleanTicker(p.ticker),
        setor: p.setor || "Outros",
        priceBRL: totalBRL - fxBRL,
        totalBRL,
        fxBRL,
        pctMove: typeof p.dayChangePct === "number" ? p.dayChangePct : 0,
        nativeChange: typeof p.dayChange === "number" ? p.dayChange : 0,
        moeda: p.moeda ?? "BRL",
        marketState: p.marketState,
        valorAtualBRL: p.valorAtualBRL ?? 0,
      });
    }
    return out;
  }, [data?.positions]);

  // ── Grupos: Internacional (IBKR) / Brasil / Cripto ──
  const grupos = useMemo(() => {
    const cripto = movers.filter(m => m.setor === "Cripto");
    const brasil = movers.filter(m => m.setor !== "Cripto" && m.moeda === "BRL");
    const intl = movers.filter(m => m.setor !== "Cripto" && m.moeda !== "BRL");
    const states = (arr: Mover[]) => new Set(arr.map(m => m.marketState).filter(Boolean) as string[]);
    return {
      intl, brasil, cripto,
      chipIntl: sessionChip(states(intl)),
      chipBr: sessionChip(states(brasil)),
      chipCr: sessionChip(states(cripto), true),
    };
  }, [movers]);

  // ── Totais canônicos ──
  const total = data?.dayChangeTotalBRL ?? 0;               // preço + câmbio
  const totalPct = data?.dayChangeTotalPct ?? 0;
  const fxEffect = data?.dayChangeFxTotalBRL ?? 0;          // só câmbio
  const priceEffect = total - fxEffect;                     // só ativos
  const totalPatrim = data?.totalPatrimonioBRL ?? 0;

  const sumPrice = (arr: Mover[]) => arr.reduce((s, m) => s + m.priceBRL, 0);
  const gIntl = sumPrice(grupos.intl);
  const gBr = sumPrice(grupos.brasil);
  const gCr = sumPrice(grupos.cripto);

  // ── Câmbio do dia ──
  const fxRows = useMemo(() => {
    const fx = data?.fxDayChange ?? {};
    const labels: Record<string, string> = { USD: "Dólar", EUR: "Euro", GBP: "Libra", CAD: "Dólar CA" };
    const levels: Record<string, number | undefined> = {
      USD: data?.usdbrl,
      EUR: (data?.fx?.EURBRL as number) ?? undefined,
      GBP: (data?.fx?.GBPBRL as number) ?? undefined,
      CAD: (data?.fx?.CADBRL as number) ?? undefined,
    };
    return ["USD", "EUR", "GBP", "CAD"]
      .filter(k => fx[k] && typeof fx[k].changePct === "number")
      .map(k => ({ k, label: labels[k] ?? k, level: levels[k] ?? null, pct: fx[k].changePct }));
  }, [data?.fxDayChange, data?.usdbrl, data?.fx]);

  const fxPerAsset = useMemo(
    () => movers.filter(m => Math.abs(m.fxBRL) >= 0.5).sort((a, b) => Math.abs(b.fxBRL) - Math.abs(a.fxBRL)),
    [movers],
  );

  // ── Melhor/pior do dia (por variação %, com impacto mínimo) ──
  const best = useMemo(
    () => movers.filter(m => m.pctMove > 0 && Math.abs(m.totalBRL) >= 1).sort((a, b) => b.pctMove - a.pctMove)[0] ?? null,
    [movers],
  );
  const worst = useMemo(
    () => movers.filter(m => m.pctMove < 0 && Math.abs(m.totalBRL) >= 1).sort((a, b) => a.pctMove - b.pctMove)[0] ?? null,
    [movers],
  );

  // ── Notícias com imagem dos melhores/piores ──
  useEffect(() => {
    if (loading) return;
    const key = `${best?.ticker ?? ""}|${worst?.ticker ?? ""}`;
    if (!key.replace("|", "") || newsFetchedRef.current === key) return;
    newsFetchedRef.current = key;
    let cancelled = false;
    setNewsState("loading");
    const fetchFor = (m: Mover | null): Promise<AssetNewsItem[]> => {
      if (!m) return Promise.resolve([]);
      const qs = new URLSearchParams({ ticker: m.ticker, moeda: m.moeda });
      return fetch(`/api/noticias/ativo?${qs}`)
        .then(r => r.json())
        .then(d => (Array.isArray(d?.articles) ? d.articles : []))
        .catch(() => []);
    };
    Promise.all([fetchFor(best), fetchFor(worst)]).then(([b, w]) => {
      if (cancelled) return;
      setNewsBest(b);
      setNewsWorst(w);
      setNewsState("done");
    });
    return () => { cancelled = true; };
  }, [loading, best, worst]);

  // ── Leitura do dia (IA — envia só números canônicos, não recalcula nada) ──
  const usdMovePct = typeof data?.fxDayChange?.USD?.changePct === "number" ? data.fxDayChange.USD.changePct : null;
  useEffect(() => {
    if (loading || !data || ledeFetchedRef.current) return;
    ledeFetchedRef.current = true;
    let cancelled = false;
    const payload = {
      resultadoBRL: Math.round(total),
      resultadoPct: Number(totalPct.toFixed(2)),
      patrimonioBRL: Math.round(totalPatrim),
      dolar: typeof data?.usdbrl === "number" ? data.usdbrl : null,
      dolarVarPct: usdMovePct,
      maiorAlta: best ? { ativo: best.ticker, contribBRL: Math.round(best.totalBRL), varPct: Number(best.pctMove.toFixed(2)) } : null,
      maiorBaixa: worst ? { ativo: worst.ticker, contribBRL: Math.round(worst.totalBRL), varPct: Number(worst.pctMove.toFixed(2)) } : null,
    };
    fetch("/api/hoje/comentario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(r => r.json())
      .then(d => { if (!cancelled && typeof d?.comment === "string" && d.comment.trim()) setAiLede(d.comment.trim()); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data]);

  // ── Dateline ──
  const now = new Date();
  const weekday = now.toLocaleDateString("pt-BR", { weekday: "long" });
  const dateLong = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  const updated = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const maxLedger = Math.max(Math.abs(gIntl), Math.abs(gBr), Math.abs(gCr), Math.abs(fxEffect), Math.abs(total), 1);

  if (loading) {
    return (
      <div className="mx-auto w-full" style={{ maxWidth: 860 }}>
        <div className="animate-pulse flex flex-col gap-3 pt-4">
          <div className="skeleton" style={{ height: 90 }} />
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 860 }}>

      {/* ── Cabeçalho: resultado do dia + leitura de IA ── */}
      <header className="glass-card p-4 mb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".26em", textTransform: "uppercase", color: "var(--muted)" }}>
            Hoje · {weekday}, {dateLong}{updated ? ` · ${updated}` : ""}
          </p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Atualizar cotações"
            className="font-mono inline-flex items-center gap-1.5 px-2 py-1"
            style={{ fontSize: 10, color: "var(--muted)", border: "1px solid var(--line-strong)", cursor: refreshing ? "wait" : "pointer", opacity: refreshing ? 0.5 : 0.85 }}
          >
            <RefreshCw size={11} style={{ animation: refreshing ? "spin 1s linear infinite" : undefined }} />
            Atualizar
          </button>
        </div>

        <div className="flex items-baseline gap-4 mt-3 flex-wrap">
          <span className="font-mono tnum" style={{ fontSize: "clamp(2rem, 8vw, 2.9rem)", fontWeight: 800, lineHeight: 1, color: colorOf(total) }}>
            {signedBRL(total)}
          </span>
          <span className="font-mono tnum" style={{ fontSize: 15, fontWeight: 700, color: colorOf(total) }}>
            {pctSigned(totalPct)}
          </span>
          <span className="font-mono tnum" style={{ fontSize: 12, color: "var(--muted)" }}>
            patrimônio {compactBRL(totalPatrim)}
          </span>
        </div>

        <div className="flex items-start gap-2.5 mt-3.5 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
          <Sparkles size={14} className="shrink-0" style={{ color: "var(--accent)", marginTop: 2 }} />
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text-2)" }}>
            {aiLede ?? (
              Math.abs(total) < 1
                ? "Dia praticamente estável: sem variação relevante até o último fechamento."
                : `${total >= 0 ? "Alta" : "Queda"} de ${pctSigned(totalPct).slice(1)} no patrimônio${best ? `, com ${best.ticker} em destaque (${pctSigned(best.pctMove, 1)})` : ""}${worst ? ` e ${worst.ticker} pressionando (${pctSigned(worst.pctMove, 1)})` : ""}.`
            )}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3">

        {/* ── 1. Internacional (IBKR) ── */}
        <GroupCard emoji="🌎" title="Internacional · IBKR" movers={grupos.intl} chip={grupos.chipIntl} nativeCcy="USD" />

        {/* ── 2. Brasil ── */}
        <GroupCard emoji="🇧🇷" title="Brasil · B3" movers={grupos.brasil} chip={grupos.chipBr} />

        {/* ── 3. Cripto ── */}
        <GroupCard emoji="₿" title="Criptoativos" movers={grupos.cripto} chip={grupos.chipCr} />

        {/* ── 4. Câmbio do dia ── */}
        <section className="glass-card p-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h2 className="section-title">💱 Câmbio do dia</h2>
          </div>
          <div className="flex items-baseline gap-3 mt-2 mb-3 flex-wrap">
            <span className="font-mono tnum" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: colorOf(fxEffect) }}>
              {signedBRL(fxEffect)}
            </span>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
              efeito do câmbio na carteira hoje
            </span>
          </div>

          {fxRows.length > 0 && (
            <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              {fxRows.map(r => (
                <div key={r.k} className="flex items-center justify-between px-3 py-2" style={{ border: "1px solid var(--line)", background: "var(--input)" }}>
                  <div>
                    <p className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: "var(--text-2)" }}>{r.label}</p>
                    {r.level != null && (
                      <p className="font-mono tnum" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>
                        R$ {r.level.toFixed(2).replace(".", ",")}
                      </p>
                    )}
                  </div>
                  <span className="font-mono tnum" style={{ fontSize: 12, fontWeight: 700, color: colorOf(r.pct) }}>
                    {pctSigned(r.pct)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {fxPerAsset.length > 0 && (
            <div>
              {fxPerAsset.slice(0, 3).map(m => (
                <LedgerRow
                  key={m.ticker}
                  label={m.ticker}
                  value={m.fxBRL}
                  maxAbs={Math.max(...fxPerAsset.map(x => Math.abs(x.fxBRL)), 1)}
                  sub={`exposição ${m.moeda}`}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── 5. Fechamento: soma dos grupos + decomposição visual ativos × câmbio ── */}
        <section className="glass-card p-4">
          <h2 className="section-title mb-1">Σ Fechamento do dia</h2>
          <div className="flex items-baseline gap-4 mt-2 mb-3 flex-wrap">
            <span className="font-mono tnum" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: colorOf(total) }}>
              {signedBRL(total)}
            </span>
            <span className="font-mono tnum" style={{ fontSize: 14, fontWeight: 700, color: colorOf(total) }}>
              {pctSigned(totalPct)}
            </span>
          </div>

          <LedgerRow label="Internacional" value={gIntl} maxAbs={maxLedger} />
          <LedgerRow label="Brasil" value={gBr} maxAbs={maxLedger} />
          <LedgerRow label="Cripto" value={gCr} maxAbs={maxLedger} />
          <LedgerRow label="Câmbio" value={fxEffect} maxAbs={maxLedger} />
          <LedgerRow label="Total" value={total} maxAbs={maxLedger} strong sub={`sobre ${compactBRL(totalPatrim)}`} />

          {/* Ativos × Câmbio — a régua pedida: retorno dos ativos SEPARADO do câmbio */}
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
            <p className="stat-label mb-2">Ativos × Câmbio</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="px-3 py-2.5" style={{ border: "1px solid var(--line)", background: "var(--input)" }}>
                <p className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>
                  Retorno dos ativos
                </p>
                <p className="font-mono tnum" style={{ fontSize: 19, fontWeight: 800, color: colorOf(priceEffect), marginTop: 3 }}>
                  {signedBRL(priceEffect)}
                </p>
              </div>
              <div className="px-3 py-2.5" style={{ border: "1px solid var(--line)", background: "var(--input)" }}>
                <p className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>
                  Efeito câmbio
                </p>
                <p className="font-mono tnum" style={{ fontSize: 19, fontWeight: 800, color: colorOf(fxEffect), marginTop: 3 }}>
                  {signedBRL(fxEffect)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. Melhores & piores, com manchetes ilustradas ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MoverNewsCard kind="melhor" mover={best} articles={newsBest} state={newsState} />
          <MoverNewsCard kind="pior" mover={worst} articles={newsWorst} state={newsState} />
        </div>

      </div>
    </div>
  );
}
