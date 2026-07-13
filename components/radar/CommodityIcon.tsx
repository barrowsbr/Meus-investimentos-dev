"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CommodityIcon — ícones ilustrados do painel de commodities: lingotes com a
// cor de cada metal, barril de petróleo e chama de gás (SVG próprio, nítido no
// dark). Agrícolas seguem com o emoji do catálogo (🌽 ☕ 🐂 já são boas imagens).
// ─────────────────────────────────────────────────────────────────────────────

// Cor por metal: [claro (topo), escuro (sombra)]
const METAL_COLORS: Record<string, [string, string]> = {
  "GC=F":  ["#fde68a", "#b45309"], // ouro
  "SI=F":  ["#f1f5f9", "#64748b"], // prata
  "PL=F":  ["#e2e8f0", "#475569"], // platina
  "PA=F":  ["#d6d3d1", "#57534e"], // paládio
  "HG=F":  ["#fdba74", "#c2410c"], // cobre
  "ALI=F": ["#cbd5e1", "#475569"], // alumínio
};

function Ingots({ symbol, size }: { symbol: string; size: number }) {
  const [hi, lo] = METAL_COLORS[symbol] ?? METAL_COLORS["GC=F"];
  const gid = `ing-${symbol.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hi} />
          <stop offset="100%" stopColor={lo} />
        </linearGradient>
      </defs>
      {/* barra de cima */}
      <polygon points="8,5.5 16,5.5 18.2,10 5.8,10" fill={`url(#${gid})`} stroke={lo} strokeWidth="0.6" />
      <polygon points="8.9,6.6 15.1,6.6 16.2,8 7.8,8" fill={hi} opacity="0.55" />
      {/* barras de baixo */}
      <polygon points="3.2,13 10.8,13 13,17.5 1,17.5" fill={`url(#${gid})`} stroke={lo} strokeWidth="0.6" />
      <polygon points="13.2,13 20.8,13 23,17.5 11,17.5" fill={`url(#${gid})`} stroke={lo} strokeWidth="0.6" />
      <polygon points="4.3,14.1 9.9,14.1 10.9,15.4 3,15.4" fill={hi} opacity="0.5" />
      <polygon points="14.3,14.1 19.9,14.1 20.9,15.4 13,15.4" fill={hi} opacity="0.5" />
    </svg>
  );
}

function Barrel({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="brl" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="45%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
      </defs>
      <path d="M6 5 h12 v14 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 Z" fill="url(#brl)" />
      {/* aros */}
      <rect x="5.3" y="4.2" width="13.4" height="1.9" rx="0.95" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.5" />
      <rect x="5.5" y="9.6" width="13" height="1.4" rx="0.7" fill="#991b1b" />
      <rect x="5.5" y="14.2" width="13" height="1.4" rx="0.7" fill="#991b1b" />
      {/* brilho */}
      <rect x="7.6" y="6.5" width="1.6" height="13" rx="0.8" fill="#fca5a5" opacity="0.35" />
    </svg>
  );
}

function Flame({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="flm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <path d="M12 2.2c.6 3.4 4.2 5.1 5.3 8.3.9 2.7.2 5.9-2 7.9a6.9 6.9 0 0 1-10.4-1.6C2.9 13.6 4.6 9.9 7 7.7c-.1 1.4.2 2.5 1.2 3.2C7.9 7.2 9.9 4 12 2.2Z" fill="url(#flm)" />
      <path d="M12 11.2c.4 1.8 2.2 2.7 2.7 4.4.4 1.5-.2 3.1-1.5 3.9a3.7 3.7 0 0 1-5-1.3c-.9-1.6-.2-3.6 1-4.7 0 .7.2 1.3.7 1.7-.1-1.7.9-3 2.1-4Z" fill="#fde047" />
    </svg>
  );
}

export default function CommodityIcon({ symbol, emoji, size = 26 }: { symbol: string; emoji: string; size?: number }) {
  if (symbol === "CL=F" || symbol === "BZ=F") return <Barrel size={size} />;
  if (symbol === "NG=F") return <Flame size={size} />;
  if (METAL_COLORS[symbol]) return <Ingots symbol={symbol} size={size} />;
  return <span style={{ fontSize: size * 0.78, lineHeight: 1 }}>{emoji}</span>;
}
