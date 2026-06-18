"use client";

import React, { useEffect, useState } from "react";
import { Bitcoin } from "lucide-react";

// Mercado global de criptomoedas (CoinGecko via /api/bolsas/crypto).
// Movido do Radar para a página de Criptoativos como subpágina "Mercado".

interface CryptoAsset {
  id: string; symbol: string; name: string; image: string;
  price: number; marketCap: number; rank: number;
  change1h: number | null; change24h: number | null; change7d: number | null;
  volume24h: number; sparkline: number[]; ath: number; athChangePct: number;
}

export default function CryptoMarket() {
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([]);
  const [btcDominance, setBtcDominance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bolsas/crypto")
      .then(r => r.json())
      .then(d => {
        if (d.assets?.length) {
          setCryptoAssets(d.assets);
          setBtcDominance(d.btcDominance ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
      className="rounded-2xl p-4 md:p-6"
      style={{ background: "rgba(13,14,20,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Bitcoin size={16} className="text-orange-400" />
          Mercado Global
        </h2>
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          <span>BTC Dominância: <span className="text-orange-400 font-semibold">{(btcDominance * 100).toFixed(1)}%</span></span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {cryptoAssets.map(c => {
          const up = (c.change24h ?? 0) >= 0;
          return (
            <div
              key={c.id}
              className="rounded-xl p-3 transition-all hover:scale-[1.02]"
              style={{
                background: up ? "rgba(16,185,129,0.04)" : "rgba(239,68,68,0.04)",
                border: `1px solid ${up ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)"}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <img src={c.image} alt={c.symbol} className="w-5 h-5 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-zinc-200 truncate">{c.name}</p>
                  <p className="text-[9px] text-zinc-500 uppercase">{c.symbol} · #{c.rank}</p>
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-zinc-100 font-mono">
                  ${c.price >= 1000 ? c.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : c.price < 1 ? c.price.toFixed(4) : c.price.toFixed(2)}
                </span>
                <span className={`text-[10px] font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
                  {up ? "+" : ""}{(c.change24h ?? 0).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[8px] text-zinc-600">7d</span>
                <span className={`text-[9px] font-semibold ${(c.change7d ?? 0) >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                  {(c.change7d ?? 0) >= 0 ? "+" : ""}{(c.change7d ?? 0).toFixed(1)}%
                </span>
                <span className="text-[8px] text-zinc-600">MCap</span>
                <span className="text-[9px] text-zinc-400 font-mono">
                  ${c.marketCap >= 1e12 ? `${(c.marketCap / 1e12).toFixed(2)}T` : c.marketCap >= 1e9 ? `${(c.marketCap / 1e9).toFixed(0)}B` : `${(c.marketCap / 1e6).toFixed(0)}M`}
                </span>
              </div>
              {/* Mini sparkline */}
              {c.sparkline.length > 10 && (
                <svg viewBox={`0 0 ${c.sparkline.length} 20`} className="w-full h-4 mt-1.5" preserveAspectRatio="none">
                  <polyline
                    points={c.sparkline.map((v, i) => {
                      const min = Math.min(...c.sparkline);
                      const max = Math.max(...c.sparkline);
                      const y = max > min ? 20 - ((v - min) / (max - min)) * 20 : 10;
                      return `${i},${y}`;
                    }).join(" ")}
                    fill="none"
                    stroke={up ? "#34d399" : "#f87171"}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-[10px] text-zinc-700 pt-4">
        Crypto via CoinGecko
      </p>
    </div>
  );
}
