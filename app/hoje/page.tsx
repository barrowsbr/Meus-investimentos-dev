"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePortfolio } from "@/lib/hooks";
import { compactBRL } from "@/lib/format";
import { isRendaFixa } from "@/lib/sectors";

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanTicker(t: string | null | undefined): string {
  if (!t) return "—";
  return t.replace(/\.SA$/, "").replace(/-USD$/, "").replace(/-BRL$/, "").replace(/=X$/, "");
}

/** "+R$ 1,2k" / "−R$ 340" — sinal tipográfico + magnitude compacta. */
function signedBRL(v: number): string {
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${compactBRL(Math.abs(v))}`;
}

function pctAbs(p: number, decimals = 1): string {
  return `${Math.abs(p).toFixed(decimals).replace(".", ",")}%`;
}

function pctSigned(p: number, decimals = 1): string {
  const sign = p >= 0 ? "+" : "−";
  return `${sign}${Math.abs(p).toFixed(decimals).replace(".", ",")}%`;
}

/** Tempo relativo a partir de um pubDate RFC-822 ("há 3h", "há 2d"). */
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

// ── News types (espelha /api/noticias) ─────────────────────────────────────────

interface NewsItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  ticker: string;
  categoria: "mercado" | "portfolio" | "economia" | "macro" | "setor";
  impacto: "alto" | "medio" | "baixo";
}

interface Contrib {
  ticker: string;
  setor: string;
  value: number;   // dayChangeBRL — contribuição ao resultado do dia
  pctMove: number; // dayChangePct — variação % do papel no dia
}

// ── Kicker (rótulo de seção com fio) ────────────────────────────────────────────

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-9 mb-3.5">
      <span
        className="font-mono shrink-0"
        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--muted)" }}
      >
        {children}
      </span>
      <div className="h-px flex-1" style={{ background: "var(--line-strong)" }} />
    </div>
  );
}

// ── Linha do ledger (barra divergente: perda ⟵ | ⟶ ganho) ──────────────────────

function LedgerRow({
  label, value, maxAbs, sub, strong = false,
}: { label: string; value: number; maxAbs: number; sub?: string; strong?: boolean }) {
  const pos = value >= 0;
  const w = Math.min(100, (Math.abs(value) / maxAbs) * 100);
  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: "minmax(58px,auto) 1fr auto", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line-strong)" }}
    >
      <span
        className="font-mono truncate"
        style={{ fontSize: strong ? 14 : 13, fontWeight: 700, color: "var(--text)", letterSpacing: ".01em" }}
      >
        {label}
      </span>

      <div className="flex items-center" style={{ height: 16 }}>
        <div className="flex-1 flex justify-end">
          {!pos && <div style={{ width: `${w}%`, height: 11, background: "var(--neg)" }} />}
        </div>
        <div style={{ width: 1, height: 16, background: "var(--line-strong)" }} />
        <div className="flex-1 flex justify-start">
          {pos && <div style={{ width: `${w}%`, height: 11, background: "var(--pos)" }} />}
        </div>
      </div>

      <div className="text-right" style={{ minWidth: 88 }}>
        <div className="font-mono tnum" style={{ fontSize: 13, fontWeight: 700, color: pos ? "var(--pos)" : "var(--neg)" }}>
          {signedBRL(value)}
        </div>
        {sub && (
          <div className="font-mono tnum" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Parágrafo de abertura com capitular ─────────────────────────────────────────

function Lede({ text }: { text: string }) {
  const first = text.charAt(0);
  const rest = text.slice(1);
  return (
    <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--text-2)" }}>
      <span
        aria-hidden
        style={{
          float: "left", fontSize: "3.1em", lineHeight: 0.78, fontWeight: 800,
          paddingRight: "0.09em", marginTop: "0.06em", color: "var(--text)",
        }}
      >
        {first}
      </span>
      {rest}
    </p>
  );
}

// ── Construtor da frase-resumo (templado, factual — não-IA) ──────────────────────

function buildLede(
  total: number, totalPct: number,
  topGain: Contrib | null, topLoss: Contrib | null,
  usdMovePct: number | null,
): string {
  if (Math.abs(total) < 1) {
    return "Dia praticamente estável: o patrimônio não registrou variação relevante até o último fechamento.";
  }
  const up = total > 0;
  let s = up
    ? `Alta de ${pctAbs(totalPct)} no patrimônio`
    : `Queda de ${pctAbs(totalPct)} no patrimônio`;

  if (up && topGain) s += `, puxada por ${topGain.ticker} (${signedBRL(topGain.value)})`;
  else if (!up && topLoss) s += `, pressionada por ${topLoss.ticker} (${signedBRL(topLoss.value)})`;

  if (up && topLoss && topLoss.value < 0) s += `, apesar do recuo de ${topLoss.ticker}`;
  else if (!up && topGain && topGain.value > 0) s += `, com alívio vindo de ${topGain.ticker}`;

  s += ".";

  if (typeof usdMovePct === "number" && Math.abs(usdMovePct) >= 0.25) {
    s += ` No câmbio, o dólar ${usdMovePct > 0 ? "subiu" : "caiu"} ${pctAbs(usdMovePct)} no dia.`;
  }
  return s;
}

// ── Página ──────────────────────────────────────────────────────────────────────

export default function HojePage() {
  const { data, loading } = usePortfolio();
  const [rawNews, setRawNews] = useState<NewsItem[]>([]);
  const [newsState, setNewsState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const newsFetchedRef = useRef(false);
  const [aiLede, setAiLede] = useState<string | null>(null);
  const ledeFetchedRef = useRef(false);

  // Contribuições do dia, por ativo (campo canônico dayChangeBRL).
  const contribs = useMemo<Contrib[]>(() => {
    if (!data?.positions) return [];
    const out: Contrib[] = [];
    for (const p of data.positions) {
      if (!p?.ticker) continue;
      if ((p.quantidade ?? 0) <= 0) continue;
      if (isRendaFixa(p.setor ?? "")) continue;
      if (typeof p.dayChangeBRL !== "number" || p.dayChangeBRL === 0) continue;
      out.push({
        ticker: cleanTicker(p.ticker),
        setor: p.setor || "Outros",
        value: p.dayChangeBRL,
        pctMove: typeof p.dayChangePct === "number" ? p.dayChangePct : 0,
      });
    }
    out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return out;
  }, [data?.positions]);

  const topGain = useMemo(
    () => contribs.reduce<Contrib | null>((best, c) => (c.value > 0 && (!best || c.value > best.value) ? c : best), null),
    [contribs],
  );
  const topLoss = useMemo(
    () => contribs.reduce<Contrib | null>((worst, c) => (c.value < 0 && (!worst || c.value < worst.value) ? c : worst), null),
    [contribs],
  );

  const bySetor = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contribs) map.set(c.setor, (map.get(c.setor) ?? 0) + c.value);
    return [...map.entries()]
      .map(([setor, value]) => ({ setor, value }))
      .filter((s) => Math.abs(s.value) > 0.5)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 6);
  }, [contribs]);

  // Notícias — papéis da carteira por tamanho de posição.
  const newsTickers = useMemo(() => {
    if (!data?.positions) return "";
    return data.positions
      .filter((p) => p?.ticker && (p.quantidade ?? 0) > 0 && !isRendaFixa(p.setor ?? ""))
      .sort((a, b) => (b.valorAtualBRL ?? 0) - (a.valorAtualBRL ?? 0))
      .slice(0, 15)
      .map((p) => p.ticker)
      .join(",");
  }, [data?.positions]);

  useEffect(() => {
    // Dispara UMA vez quando os tickers estão prontos. (Não depender de newsState
    // nem dos movers aqui: re-rodar o efeito acionava a cleanup e cancelava o
    // próprio fetch em andamento — por isso ficava preso em "Buscando…".)
    if (!newsTickers || newsFetchedRef.current) return;
    newsFetchedRef.current = true;
    let cancelled = false;
    setNewsState("loading");
    fetch(`/api/noticias?tickers=${encodeURIComponent(newsTickers)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setRawNews(Array.isArray(d?.articles) ? d.articles : []);
        setNewsState("done");
      })
      .catch(() => {
        if (!cancelled) setNewsState("error");
      });
    return () => { cancelled = true; };
  }, [newsTickers]);

  // Ranking reativo aos movers do dia (sem refazer o fetch).
  const news = useMemo<NewsItem[]>(() => {
    const moverSet = new Set([topGain?.ticker, topLoss?.ticker].filter(Boolean) as string[]);
    const impactOrder = { alto: 0, medio: 1, baixo: 2 } as const;
    return rawNews
      .filter((a) => a.impacto !== "baixo" || a.categoria === "portfolio")
      .sort((a, b) => {
        const am = moverSet.has(cleanTicker(a.ticker)) ? 0 : 1;
        const bm = moverSet.has(cleanTicker(b.ticker)) ? 0 : 1;
        if (am !== bm) return am - bm;
        const ap = a.categoria === "portfolio" ? 0 : 1;
        const bp = b.categoria === "portfolio" ? 0 : 1;
        if (ap !== bp) return ap - bp;
        const ai = impactOrder[a.impacto] - impactOrder[b.impacto];
        if (ai !== 0) return ai;
        return (Date.parse(b.data) || 0) - (Date.parse(a.data) || 0);
      })
      .slice(0, 10);
  }, [rawNews, topGain?.ticker, topLoss?.ticker]);

  // ── Dateline ──
  const now = new Date();
  const weekday = now.toLocaleDateString("pt-BR", { weekday: "long" });
  const dateLong = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const updated = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const total = data?.dayChangeTotalBRL ?? 0;
  const totalPct = data?.dayChangeTotalPct ?? 0;
  const totalPatrim = data?.totalPatrimonioBRL ?? 0;
  const usdLevel = typeof data?.usdbrl === "number" ? data.usdbrl : null;
  const usdMovePct = typeof data?.fxDayChange?.USD?.changePct === "number" ? data.fxDayChange!.USD.changePct : null;
  const isUp = total >= 0;
  const totalColor = Math.abs(total) < 1 ? "var(--text)" : isUp ? "var(--pos)" : "var(--neg)";

  // Ledger: top 10 + reconciliação dos demais.
  const TOPN = 10;
  const shown = contribs.slice(0, TOPN);
  const rest = contribs.slice(TOPN);
  const restSum = rest.reduce((s, c) => s + c.value, 0);
  const maxAbs = Math.max(...contribs.map((c) => Math.abs(c.value)), 1);
  const maxAbsSetor = Math.max(...bySetor.map((s) => Math.abs(s.value)), 1);

  // Resultado por corretora (IBKR em USD nativo, demais em BRL).
  const byCorretora = useMemo(() => {
    if (!data?.positions) return [];
    const map = new Map<string, { corretora: string; changeBRL: number; changeNative: number; moeda: string; count: number }>();
    for (const p of data.positions) {
      if (!p?.ticker || (p.quantidade ?? 0) <= 0) continue;
      if (typeof p.dayChangeBRL !== "number") continue;
      const corr = (p.corretora || "Outros").trim();
      const existing = map.get(corr);
      const nativeChg = typeof p.dayChange === "number" ? p.dayChange : 0;
      if (existing) {
        existing.changeBRL += p.dayChangeBRL;
        existing.changeNative += nativeChg;
        existing.count++;
      } else {
        map.set(corr, { corretora: corr, changeBRL: p.dayChangeBRL, changeNative: nativeChg, moeda: p.moeda ?? "BRL", count: 1 });
      }
    }
    return [...map.values()]
      .filter(c => Math.abs(c.changeBRL) > 0.5)
      .sort((a, b) => Math.abs(b.changeBRL) - Math.abs(a.changeBRL));
  }, [data?.positions]);

  const maxAbsCorretora = Math.max(...byCorretora.map(c => Math.abs(c.changeBRL)), 1);

  // Pares de câmbio com movimento no dia.
  const fxRows = useMemo(() => {
    const fx = data?.fxDayChange ?? {};
    const labels: Record<string, string> = { USD: "Dólar", EUR: "Euro", GBP: "Libra", CAD: "Dólar CA" };
    const levels: Record<string, number | undefined> = {
      USD: data?.usdbrl, EUR: (data?.fx?.EURBRL as number) ?? undefined,
      GBP: (data?.fx?.GBPBRL as number) ?? undefined, CAD: (data?.fx?.CADBRL as number) ?? undefined,
    };
    return ["USD", "EUR", "GBP", "CAD"]
      .filter((k) => fx[k] && typeof fx[k].changePct === "number")
      .map((k) => ({ k, label: labels[k] ?? k, level: levels[k] ?? null, pct: fx[k].changePct }));
  }, [data?.fxDayChange, data?.usdbrl, data?.fx]);

  // ── Efeito do câmbio HOJE — decompõe o resultado do dia em preço × câmbio ──
  // Para cada posição em moeda estrangeira: efeito câmbio = valor de ontem (BRL)
  // × variação % da moeda no dia. Efeito preço = resto. A soma reconcilia com o
  // total do dia (dayChangeTotalBRL, canônico).
  const fxToday = useMemo(() => {
    const fxFracByCcy = (ccy: string): number => {
      const c = data?.fxDayChange?.[ccy];
      return typeof c?.changePct === "number" ? c.changePct / 100 : 0;
    };
    let fxEffect = 0;
    const perAsset: { ticker: string; moeda: string; fxBRL: number }[] = [];
    for (const p of data?.positions ?? []) {
      if (!p?.ticker || (p.quantidade ?? 0) <= 0) continue;
      const moeda = p.moeda ?? "BRL";
      if (moeda === "BRL") continue;
      const fxFrac = fxFracByCcy(moeda);
      if (fxFrac === 0) continue;
      const assetFrac = typeof p.dayChangePct === "number" ? p.dayChangePct / 100 : 0;
      const valueBRL = p.valorAtualBRL ?? 0;
      const denom = (1 + assetFrac) * (1 + fxFrac);
      const valueYestBRL = denom !== 0 ? valueBRL / denom : valueBRL;
      const eff = valueYestBRL * fxFrac;
      if (Math.abs(eff) < 0.5) continue;
      fxEffect += eff;
      perAsset.push({ ticker: cleanTicker(p.ticker), moeda, fxBRL: eff });
    }
    perAsset.sort((a, b) => Math.abs(b.fxBRL) - Math.abs(a.fxBRL));
    // O total canônico (dayChangeTotalBRL) é o efeito-PREÇO: a variação de preço
    // dos ativos convertida ao câmbio de HOJE (dayChangeBRL = ΔP·qtd·fxHoje). Ele
    // NÃO inclui a reavaliação cambial do principal — o engine só conhece o câmbio
    // de hoje, não o de ontem. Logo o efeito-câmbio é ADITIVO ao total canônico:
    //   resultado em R$ no dia = preço (total) + câmbio (fxEffect).
    // (Subtrair fxEffect do total — como antes — invertia o sinal do preço.)
    return { fxEffect, priceEffect: total, totalComCambio: total + fxEffect, perAsset };
  }, [data?.positions, data?.fxDayChange, total]);

  // ── Efeito do câmbio ACUMULADO (campos canônicos do snapshot — DRE do Resumo) ──
  const fxAccum = data?.ganhoCambioTotalBRL ?? 0;
  const priceAccum = data?.ganhoAtivoPuroTotalBRL ?? 0;
  const hasFx = fxToday.perAsset.length > 0 || Math.abs(fxAccum) > 1 || Math.abs(fxToday.fxEffect) > 1;

  // ── Comentário do dia (manchete) — gerado por IA (Grok, com fallback) ──
  // Envia só os números canônicos já computados; a IA apenas redige a leitura
  // editorial (não recalcula nada). Enquanto carrega/falha, usa a frase templada.
  useEffect(() => {
    if (loading || !data || ledeFetchedRef.current) return;
    ledeFetchedRef.current = true;
    let cancelled = false;
    const payload = {
      resultadoBRL: Math.round(total),
      resultadoPct: Number(totalPct.toFixed(2)),
      patrimonioBRL: Math.round(totalPatrim),
      dolar: usdLevel,
      dolarVarPct: usdMovePct,
      maiorAlta: topGain ? { ativo: topGain.ticker, contribBRL: Math.round(topGain.value), varPct: Number(topGain.pctMove.toFixed(2)) } : null,
      maiorBaixa: topLoss ? { ativo: topLoss.ticker, contribBRL: Math.round(topLoss.value), varPct: Number(topLoss.pctMove.toFixed(2)) } : null,
    };
    fetch("/api/hoje/comentario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && typeof d?.comment === "string" && d.comment.trim()) setAiLede(d.comment.trim()); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data]);

  if (loading) {
    return (
      <div className="mx-auto w-full" style={{ maxWidth: 760 }}>
        <div className="animate-pulse flex flex-col gap-3 pt-6">
          <div style={{ height: 14, width: "40%", background: "var(--line-strong)" }} />
          <div style={{ height: 64, width: "70%", background: "var(--line-strong)", marginTop: 12 }} />
          <div style={{ height: 12, width: "90%", background: "var(--line)" }} />
          <div style={{ height: 12, width: "85%", background: "var(--line)" }} />
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 18, width: "100%", background: "var(--line)", marginTop: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 760 }}>

      {/* ── Nameplate ── */}
      <header className="text-center pt-1">
        <div className="flex items-center gap-4">
          <div className="h-px flex-1" style={{ background: "var(--line-strong)" }} />
          <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".34em", textTransform: "uppercase", color: "var(--muted)" }}>
            Edição Diária
          </span>
          <div className="h-px flex-1" style={{ background: "var(--line-strong)" }} />
        </div>

        <h1 className="font-mono" style={{ fontSize: "clamp(2.4rem, 11vw, 4.2rem)", fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1, color: "var(--text)", marginTop: 10 }}>
          Hoje
        </h1>

        <p className="font-mono" style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)", marginTop: 10 }}>
          {weekday}, {dateLong}{updated ? ` — Atualizado ${updated}` : ""}
        </p>

        <div style={{ marginTop: 12, borderTop: "3px double var(--line-strong)" }} />
      </header>

      {/* ── Manchete: o resultado do dia ── */}
      <section className="pt-6">
        <span className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--muted)" }}>
          Resultado de hoje
        </span>

        <div className="flex items-baseline flex-wrap gap-x-4 gap-y-1 mt-1.5">
          <span className="font-mono tnum" style={{ fontSize: "clamp(2.5rem, 13vw, 4.6rem)", fontWeight: 800, lineHeight: 1, letterSpacing: "-.02em", color: totalColor }}>
            {signedBRL(total)}
          </span>
          <span className="font-mono tnum" style={{ fontSize: "clamp(1.1rem, 5vw, 1.7rem)", fontWeight: 700, color: totalColor }}>
            {pctSigned(totalPct)}
          </span>
        </div>

        <p className="font-mono" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>
          Patrimônio em {compactBRL(totalPatrim)}
          {usdLevel ? ` · dólar a R$ ${usdLevel.toFixed(3).replace(".", ",")}` : ""}
        </p>

        <div className="mt-5">
          <Lede text={aiLede ?? buildLede(total, totalPct, topGain, topLoss, usdMovePct)} />
          {aiLede && (
            <p className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", marginTop: 8 }}>
              Comentário do dia · IA
            </p>
          )}
        </div>

        {/* ── Sub-manchete: destaques rápidos ── */}
        {(topGain || topLoss) && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line-strong)" }}>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {topGain && (
                <div className="flex items-baseline gap-2">
                  <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--pos)" }}>
                    Destaque
                  </span>
                  <span className="font-mono" style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>
                    {topGain.ticker}
                  </span>
                  <span className="font-mono tnum" style={{ fontSize: 13, fontWeight: 700, color: "var(--pos)" }}>
                    {pctSigned(topGain.pctMove)} ({signedBRL(topGain.value)})
                  </span>
                </div>
              )}
              {topLoss && (
                <div className="flex items-baseline gap-2">
                  <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--neg)" }}>
                    Pressão
                  </span>
                  <span className="font-mono" style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>
                    {topLoss.ticker}
                  </span>
                  <span className="font-mono tnum" style={{ fontSize: 13, fontWeight: 700, color: "var(--neg)" }}>
                    {pctSigned(topLoss.pctMove)} ({signedBRL(topLoss.value)})
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Resultado por corretora ── */}
      {byCorretora.length > 0 && (
        <section>
          <Kicker>Resultado por corretora</Kicker>
          {byCorretora.map((c) => {
            const isIBKR = c.corretora.toLowerCase().includes("ibkr") || c.corretora.toLowerCase().includes("interactive");
            const isUSD = isIBKR || c.moeda === "USD";
            return (
              <LedgerRow
                key={c.corretora}
                label={c.corretora}
                value={c.changeBRL}
                maxAbs={maxAbsCorretora}
                sub={isUSD && Math.abs(c.changeNative) > 0.01
                  ? `US$ ${c.changeNative >= 0 ? "+" : "−"}${Math.abs(c.changeNative).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `${c.count} ativos`}
              />
            );
          })}
          <p className="font-mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 8 }}>
            Variação do dia agrupada por corretora. IBKR exibida em dólar nativo.
          </p>
        </section>
      )}

      {/* ── De onde vem o resultado ── */}
      <section>
        <Kicker>De onde vem o resultado</Kicker>

        {shown.length === 0 ? (
          <p className="font-mono" style={{ fontSize: 13, color: "var(--muted)" }}>
            Nenhuma variação de mercado registrada hoje — provavelmente o pregão está fechado ou os preços ainda não atualizaram.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)" }}>← Perdas</span>
              <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)" }}>Ganhos →</span>
            </div>

            {shown.map((c) => (
              <LedgerRow
                key={c.ticker}
                label={c.ticker}
                value={c.value}
                maxAbs={maxAbs}
                sub={pctSigned(c.pctMove)}
              />
            ))}

            {Math.abs(restSum) > 0.5 && (
              <LedgerRow label={`+${rest.length} outros`} value={restSum} maxAbs={maxAbs} />
            )}

            <p className="font-mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 8 }}>
              Cada barra é a contribuição do ativo ao resultado do dia (preço × posição). A soma reconcilia com o total acima.
            </p>
          </>
        )}
      </section>

      {/* ── Por setor ── */}
      {bySetor.length > 0 && (
        <section>
          <Kicker>Por setor</Kicker>
          {bySetor.map((s) => (
            <LedgerRow key={s.setor} label={s.setor} value={s.value} maxAbs={maxAbsSetor} />
          ))}
        </section>
      )}

      {/* ── Câmbio hoje ── */}
      {fxRows.length > 0 && (
        <section>
          <Kicker>Câmbio hoje</Kicker>
          <div className="flex flex-wrap gap-x-7 gap-y-2.5">
            {fxRows.map((f) => {
              const up = f.pct >= 0;
              return (
                <div key={f.k} className="flex items-baseline gap-2">
                  <span className="font-mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)" }}>
                    {f.label}
                  </span>
                  {f.level != null && (
                    <span className="font-mono tnum" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                      R$ {f.level.toFixed(f.level >= 10 ? 2 : 3).replace(".", ",")}
                    </span>
                  )}
                  <span className="font-mono tnum" style={{ fontSize: 12.5, fontWeight: 600, color: up ? "var(--pos)" : "var(--neg)" }}>
                    {pctSigned(f.pct)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="font-mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 10 }}>
            Movimento das moedas no dia — referência para a parcela internacional da carteira.
          </p>
        </section>
      )}

      {/* ── Efeito do câmbio: quanto do resultado veio de preço × moeda ── */}
      {hasFx && (
        <section>
          <Kicker>Efeito do câmbio</Kicker>

          <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 4 }}>
            Resultado de hoje, em reais
          </p>
          {(() => {
            const m = Math.max(Math.abs(fxToday.priceEffect), Math.abs(fxToday.fxEffect), 1);
            return (
              <>
                <LedgerRow label="Preço" value={fxToday.priceEffect} maxAbs={m} sub="variação dos ativos (resultado do dia)" />
                <LedgerRow label="Câmbio" value={fxToday.fxEffect} maxAbs={m} sub={usdMovePct != null ? `dólar ${pctSigned(usdMovePct)} sobre a parcela internacional` : "moedas estáveis"} />
              </>
            );
          })()}
          <p className="font-mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 8 }}>
            O preço dos ativos rendeu <strong style={{ color: "var(--text-2)" }}>{signedBRL(fxToday.priceEffect)}</strong> hoje (resultado canônico do dia).
            A variação das moedas {fxToday.fxEffect >= 0 ? "somou" : "subtraiu"}{" "}
            <strong style={{ color: "var(--text-2)" }}>{signedBRL(fxToday.fxEffect)}</strong> sobre a parcela internacional —
            totalizando <strong style={{ color: fxToday.totalComCambio >= 0 ? "var(--pos)" : "var(--neg)" }}>{signedBRL(fxToday.totalComCambio)}</strong> em reais no dia.
          </p>

          {fxToday.perAsset.length > 0 && (
            <>
              <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", margin: "16px 0 4px" }}>
                Câmbio por ativo, hoje
              </p>
              {fxToday.perAsset.slice(0, 8).map((a) => {
                const pos = a.fxBRL >= 0;
                return (
                  <div
                    key={a.ticker}
                    className="grid items-center"
                    style={{ gridTemplateColumns: "minmax(58px,auto) 1fr auto", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--line)" }}
                  >
                    <span className="font-mono" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{a.ticker}</span>
                    <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".08em", color: "var(--muted)" }}>{a.moeda}</span>
                    <span className="font-mono tnum text-right" style={{ fontSize: 12.5, fontWeight: 700, color: pos ? "var(--pos)" : "var(--neg)" }}>
                      {signedBRL(a.fxBRL)}
                    </span>
                  </div>
                );
              })}
              <p className="font-mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 8 }}>
                Parcela do resultado de cada ativo estrangeiro atribuível só à moeda (não ao preço).
              </p>
            </>
          )}

          {(Math.abs(fxAccum) > 1 || Math.abs(priceAccum) > 1) && (
            <>
              <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--faint)", margin: "16px 0 4px" }}>
                No acumulado da carteira
              </p>
              {(() => {
                const m = Math.max(Math.abs(priceAccum), Math.abs(fxAccum), 1);
                const pmDolar = data?.cambio?.pmDolar ?? 0;
                const fxSub = usdLevel && pmDolar > 0
                  ? `dólar R$ ${usdLevel.toFixed(2).replace(".", ",")} vs PM R$ ${pmDolar.toFixed(2).replace(".", ",")}`
                  : undefined;
                return (
                  <>
                    <LedgerRow label="Preço" value={priceAccum} maxAbs={m} strong sub="valorização dos ativos" />
                    <LedgerRow label="Câmbio" value={fxAccum} maxAbs={m} strong sub={fxSub} />
                  </>
                );
              })()}
              <p className="font-mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 8 }}>
                Decomposição canônica do ganho da carteira — quanto veio do preço dos ativos vs. da valorização das moedas (mesma base do Resumo).
              </p>
            </>
          )}
        </section>
      )}

      {/* ── No noticiário ── */}
      <section className="pb-6">
        <Kicker>No noticiário</Kicker>

        {newsState === "loading" && (
          <p className="font-mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>Buscando manchetes…</p>
        )}
        {newsState === "error" && (
          <p className="font-mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>Não foi possível carregar as notícias agora.</p>
        )}
        {newsState === "done" && news.length === 0 && (
          <p className="font-mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>Sem manchetes relevantes para a carteira no momento.</p>
        )}

        {news.length > 0 && (
          <div className="grid md:grid-cols-2 md:gap-x-8">
            {news.map((a, i) => {
              const isMover = a.ticker && (a.ticker === topGain?.ticker || a.ticker === topLoss?.ticker || a.categoria === "portfolio");
              return (
                <a
                  key={`${a.link}-${i}`}
                  href={a.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                  style={{ padding: "11px 0", borderBottom: "1px solid var(--line-strong)" }}
                >
                  <div className="flex items-center justify-between mb-1.5" style={{ gap: 8 }}>
                    <span className="font-mono truncate" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: isMover ? "var(--accent)" : "var(--muted)" }}>
                      {isMover && a.ticker ? `${cleanTicker(a.ticker)} · ` : ""}{a.fonte}
                    </span>
                    <span className="font-mono shrink-0" style={{ fontSize: 9.5, color: "var(--faint)" }}>
                      {relTime(a.data)}
                    </span>
                  </div>
                  <p style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.34, color: "var(--text)" }}>
                    {a.titulo}
                    {a.impacto === "alto" && (
                      <span className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: "var(--neg)", marginLeft: 6, verticalAlign: "middle" }}>
                        ● ALTO
                      </span>
                    )}
                  </p>
                </a>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
