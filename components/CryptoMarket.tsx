"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Bitcoin,
  Search,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  CircleDollarSign,
} from "lucide-react";

// Mercado global de criptomoedas (CoinGecko via /api/bolsas/crypto).
// Subpágina "Mercado" da página de Criptoativos — visual de terminal de mercado.

interface CryptoAsset {
  id: string; symbol: string; name: string; image: string;
  price: number; marketCap: number; rank: number;
  change1h: number | null; change24h: number | null; change7d: number | null;
  volume24h: number; sparkline: number[]; ath: number; athChangePct: number;
}

type SortKey = "rank" | "price" | "change1h" | "change24h" | "change7d" | "marketCap" | "volume24h";

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (v >= 1) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 0.01) return v.toFixed(4);
  return v.toPrecision(2);
}

function fmtCompact(v: number): string {
  if (!isFinite(v) || v <= 0) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function pctColor(v: number | null): string {
  if (v == null || !isFinite(v)) return "text-zinc-600";
  return v >= 0 ? "text-emerald-400" : "text-red-400";
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

function Sparkline({ data, trend, width = 96, height = 28 }: { data: number[]; trend: number | null; width?: number; height?: number }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = range > 0 ? height - ((v - min) / range) * height : height / 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const up = (trend ?? 0) >= 0;
  const stroke = up ? "#34d399" : "#f87171";
  const gradId = `spark-${up ? "up" : "down"}`;
  const areaPoints = `0,${height} ${points.join(" ")} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ─── Stat tile for the header strip ───────────────────────────────────────────

function StatTile({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent?: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${accent ?? "#f59e0b"}1a`, color: accent ?? "#f59e0b" }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="text-sm font-semibold text-zinc-100 font-mono truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Top mover card ───────────────────────────────────────────────────────────

function MoverCard({ asset, kind }: { asset: CryptoAsset; kind: "best" | "worst" }) {
  const best = kind === "best";
  const change = asset.change24h ?? 0;
  const color = best ? "#34d399" : "#f87171";
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3.5 py-3"
      style={{
        background: best ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)",
        border: `1px solid ${best ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"}`,
      }}
    >
      <div className="flex items-center gap-1.5 shrink-0">
        {best ? <TrendingUp size={14} style={{ color }} /> : <TrendingDown size={14} style={{ color }} />}
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color }}>
          {best ? "Maior alta" : "Maior queda"}
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.image} alt={asset.symbol} className="w-6 h-6 rounded-full ml-auto" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-zinc-100 truncate">{asset.symbol.toUpperCase()}</p>
        <p className="text-[10px] text-zinc-500 font-mono">${fmtPrice(asset.price)}</p>
      </div>
      <span className="text-sm font-bold font-mono shrink-0" style={{ color }}>
        {fmtPct(change)}
      </span>
    </div>
  );
}

// ─── Sortable column header ────────────────────────────────────────────────────

function SortHead({
  label, col, sortKey, sortAsc, onSort, align = "right",
}: {
  label: string; col: SortKey; sortKey: SortKey; sortAsc: boolean;
  onSort: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = sortKey === col;
  return (
    <th
      className={`px-3 py-2.5 select-none cursor-pointer transition-colors ${align === "right" ? "text-right" : "text-left"} ${active ? "text-amber-400" : "text-zinc-500 hover:text-zinc-300"}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider font-semibold ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        {active && (sortAsc ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
      </span>
    </th>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function CryptoMarket() {
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([]);
  const [btcDominance, setBtcDominance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch("/api/bolsas/crypto")
      .then(r => r.json())
      .then(d => {
        if (d.assets?.length) {
          setCryptoAssets(d.assets as CryptoAsset[]);
          setBtcDominance(d.btcDominance ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalMcap = cryptoAssets.reduce((s, c) => s + (c.marketCap || 0), 0);
    const totalVol = cryptoAssets.reduce((s, c) => s + (c.volume24h || 0), 0);
    return { totalMcap, totalVol, count: cryptoAssets.length };
  }, [cryptoAssets]);

  // Top movers (24h) — only among assets with a real change value
  const movers = useMemo(() => {
    const withChange = cryptoAssets.filter(c => c.change24h != null && isFinite(c.change24h));
    if (withChange.length === 0) return { best: null as CryptoAsset | null, worst: null as CryptoAsset | null };
    const sorted = [...withChange].sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  }, [cryptoAssets]);

  // Filtered + sorted list
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = cryptoAssets;
    if (q) {
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
      );
    }
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const na = va == null || !isFinite(va as number) ? -Infinity : (va as number);
      const nb = vb == null || !isFinite(vb as number) ? -Infinity : (vb as number);
      return (na - nb) * dir;
    });
  }, [cryptoAssets, query, sortKey, sortAsc]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(a => !a);
    else { setSortKey(k); setSortAsc(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[11px] text-zinc-500 animate-pulse">
        Carregando mercado de criptomoedas...
      </div>
    );
  }

  if (cryptoAssets.length === 0) {
    return (
      <div className="glass-card p-10 text-center border-amber-500/10">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <Bitcoin size={32} className="text-amber-500/40" />
        </div>
        <p className="text-zinc-400 text-sm font-medium">Dados de mercado indisponíveis no momento</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(13,14,20,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* ── Header ── */}
      <div className="px-4 md:px-6 pt-5 pb-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Bitcoin size={16} className="text-orange-400" />
            Mercado Global
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 border-l border-zinc-700 pl-2 ml-1">
              CoinGecko
            </span>
          </h2>
          {/* Search */}
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 w-full sm:w-auto"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <Search size={13} className="text-zinc-500 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar moeda..."
              className="bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none w-full sm:w-44"
            />
          </div>
        </div>

        {/* Aggregate stats strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatTile label="Market Cap" value={fmtCompact(stats.totalMcap)} icon={<Layers size={15} />} accent="#f59e0b" />
          <StatTile label="Volume 24h" value={fmtCompact(stats.totalVol)} icon={<Activity size={15} />} accent="#818cf8" />
          <StatTile label="Dominância BTC" value={`${(btcDominance * 100).toFixed(1)}%`} icon={<Bitcoin size={15} />} accent="#fb923c" />
          <StatTile label="Ativos" value={String(stats.count)} icon={<CircleDollarSign size={15} />} accent="#34d399" />
        </div>

        {/* Top movers */}
        {(movers.best || movers.worst) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2.5">
            {movers.best && <MoverCard asset={movers.best} kind="best" />}
            {movers.worst && <MoverCard asset={movers.worst} kind="worst" />}
          </div>
        )}
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <SortHead label="#" col="rank" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} align="left" />
              <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-wider font-semibold text-zinc-500">Ativo</th>
              <SortHead label="Preço" col="price" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              <SortHead label="1h" col="change1h" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              <SortHead label="24h" col="change24h" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              <SortHead label="7d" col="change7d" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              <SortHead label="Market Cap" col="marketCap" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              <SortHead label="Volume 24h" col="volume24h" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-wider font-semibold text-zinc-500">7d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr
                key={c.id}
                className="border-b transition-colors hover:bg-white/[0.025]"
                style={{ borderColor: "rgba(255,255,255,0.035)" }}
              >
                <td className="px-3 py-2.5 text-zinc-600 font-mono">{c.rank}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image} alt={c.symbol} className="w-6 h-6 rounded-full shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-100 truncate max-w-[160px]">{c.name}</p>
                      <p className="text-[10px] text-zinc-500 uppercase font-mono">{c.symbol}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-zinc-100">${fmtPrice(c.price)}</td>
                <td className={`px-3 py-2.5 text-right font-mono ${pctColor(c.change1h)}`}>{fmtPct(c.change1h)}</td>
                <td className={`px-3 py-2.5 text-right font-mono font-semibold ${pctColor(c.change24h)}`}>{fmtPct(c.change24h)}</td>
                <td className={`px-3 py-2.5 text-right font-mono ${pctColor(c.change7d)}`}>{fmtPct(c.change7d)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">{fmtCompact(c.marketCap)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">{fmtCompact(c.volume24h)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end">
                    <Sparkline data={c.sparkline} trend={c.change7d} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-10 text-center text-xs text-zinc-500">Nenhuma moeda encontrada para &ldquo;{query}&rdquo;</div>
        )}
      </div>

      {/* ── Mobile cards ── */}
      <div className="md:hidden p-3 space-y-2">
        {rows.map(c => {
          const up = (c.change24h ?? 0) >= 0;
          return (
            <div
              key={c.id}
              className="rounded-xl p-3"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${up ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)"}`,
              }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image} alt={c.symbol} className="w-6 h-6 rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-100 truncate">{c.name}</p>
                  <p className="text-[9px] text-zinc-500 uppercase font-mono">{c.symbol} · #{c.rank}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-100 font-mono">${fmtPrice(c.price)}</p>
                  <p className={`text-[10px] font-bold font-mono ${pctColor(c.change24h)}`}>{fmtPct(c.change24h)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Sparkline data={c.sparkline} trend={c.change7d} width={120} height={26} />
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-zinc-500">7d <span className={pctColor(c.change7d)}>{fmtPct(c.change7d)}</span></span>
                  <span className="text-zinc-500">MCap <span className="text-zinc-300">{fmtCompact(c.marketCap)}</span></span>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="py-8 text-center text-xs text-zinc-500">Nenhuma moeda encontrada para &ldquo;{query}&rdquo;</div>
        )}
      </div>

      <p className="text-center text-[10px] text-zinc-700 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        Crypto via CoinGecko · {rows.length} de {cryptoAssets.length} ativos
      </p>
    </div>
  );
}
