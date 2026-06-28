"use client";

import { useState, useEffect } from "react";

// Normaliza o ticker para o nome do arquivo de logo em /public/logos.
// Ex: "PETR4.SA" → "PETR4", "tsm" → "TSM".
export function logoSlug(ticker: string): string {
  return (ticker ?? "").toUpperCase().replace(/\.[A-Z0-9]+$/, "").trim();
}

// Paleta determinística (mesma cor sempre para o mesmo ticker).
const PALETTE = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

function colorFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string, ticker: string): string {
  const base = (name || ticker || "").trim();
  if (!base) return "?";
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/**
 * Logo do ativo com cascata de fontes:
 *  1. Arquivo commitado em /public/logos/<SLUG>.png (prioritário — permanente/offline)
 *  2. Resolver /api/logo/<TICKER> — busca por ticker (Clearbit/FMP/logo.dev) e o
 *     CDN cacheia por 1 ano. ESCALÁVEL: qualquer ativo novo resolve sozinho.
 *  3. Avatar de iniciais coloridas (sempre bonito, zero dependência).
 */
export default function AssetLogo({
  ticker,
  name,
  size = 40,
  rounded = "rounded-xl",
}: {
  ticker: string;
  name?: string;
  size?: number;
  rounded?: string;
}) {
  const slug = logoSlug(ticker);

  // Cascata de URLs candidatas (em ordem).
  const sources = [
    slug ? `/logos/${slug}.png` : "",
    ticker ? `/api/logo/${encodeURIComponent(ticker)}` : "",
  ].filter(Boolean);

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [ticker]);

  const src = sources[idx];

  if (!src) {
    const bg = colorFor(slug || ticker || "?");
    return (
      <div
        className={`flex shrink-0 items-center justify-center font-bold text-white ${rounded}`}
        style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
        aria-hidden
      >
        {initials(name ?? "", ticker)}
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden ${rounded}`}
      style={{ width: size, height: size, background: "#fff" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={name ?? ticker}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setIdx((i) => i + 1)}
        style={{ width: "100%", height: "100%", objectFit: "contain", padding: size * 0.12 }}
      />
    </div>
  );
}
