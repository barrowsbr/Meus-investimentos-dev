"use client";

// Retratos vetoriais dos consoles que temos emulador — grandes, para a grade do
// fliperama. Renders estilizados (não são fotos com direitos; o dono pode mandar
// fotos reais depois para trocar). Cada um em suas cores reais; o brilho néon do
// tile vem por fora (no EmulatorJsPanel), na cor do tema do console.

export type ChaveConsole = "gameboy" | "gbc" | "gba" | "snes" | "megadrive" | string;

function GameBoy() {
  return (
    <svg viewBox="0 0 78 122" className="h-full w-full" role="img" aria-label="Game Boy">
      <defs>
        <linearGradient id="gb-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9e6d6" /><stop offset="0.5" stopColor="#d5d2c1" /><stop offset="1" stopColor="#bcb9a8" />
        </linearGradient>
        <linearGradient id="gb-scr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b5140" /><stop offset="1" stopColor="#333829" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="72" height="116" rx="11" fill="url(#gb-body)" stroke="#9a9784" strokeWidth="1.5" />
      <path d="M3 100 Q3 119 14 119 H30 L30 108 Q30 104 26 104 H3 Z" fill="#c7c4b3" opacity="0.7" />
      {/* screen bezel */}
      <rect x="12" y="12" width="54" height="46" rx="5" fill="#5b5f4d" />
      <rect x="19" y="18" width="40" height="34" rx="2" fill="url(#gb-scr)" />
      <rect x="21" y="20" width="36" height="30" rx="1" fill="#9bbc0f" opacity="0.9" />
      <rect x="21" y="20" width="36" height="30" rx="1" fill="#0f380f" opacity="0.12" />
      <circle cx="17" cy="15" r="1.4" fill="#7a1f3d" />
      {/* d-pad */}
      <g fill="#3a3a3a">
        <rect x="15" y="76" width="7" height="21" rx="1.5" /><rect x="8" y="83" width="21" height="7" rx="1.5" />
      </g>
      {/* A/B */}
      <circle cx="55" cy="92" r="6.5" fill="#8b2f4a" /><circle cx="66" cy="85" r="6.5" fill="#8b2f4a" />
      <text x="55" y="94.5" fontSize="4.6" fill="#e9cdd6" textAnchor="middle" fontWeight="700">B</text>
      <text x="66" y="87.5" fontSize="4.6" fill="#e9cdd6" textAnchor="middle" fontWeight="700">A</text>
      {/* start/select */}
      <g fill="#6d6a5a"><rect x="30" y="104" width="11" height="3.2" rx="1.6" transform="rotate(-25 35 105)" /><rect x="44" y="104" width="11" height="3.2" rx="1.6" transform="rotate(-25 49 105)" /></g>
      {/* speaker */}
      <g stroke="#a5a291" strokeWidth="1.4" strokeLinecap="round">
        <line x1="55" y1="108" x2="66" y2="102" /><line x1="57" y1="111" x2="68" y2="105" /><line x1="59" y1="114" x2="70" y2="108" />
      </g>
    </svg>
  );
}

function GameBoyColor() {
  return (
    <svg viewBox="0 0 78 122" className="h-full w-full" role="img" aria-label="Game Boy Color">
      <defs>
        <linearGradient id="gbc-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" /><stop offset="0.5" stopColor="#7c3aed" /><stop offset="1" stopColor="#5b21b6" />
        </linearGradient>
      </defs>
      <path d="M8 6 H70 Q75 6 75 14 V104 Q75 116 62 116 H16 Q3 116 3 104 V14 Q3 6 8 6 Z" fill="url(#gbc-body)" stroke="#4c1d95" strokeWidth="1.5" />
      {/* screen */}
      <rect x="13" y="13" width="52" height="44" rx="6" fill="#2a1758" />
      <rect x="19" y="18" width="40" height="34" rx="2" fill="#7bc67b" opacity="0.92" />
      <rect x="19" y="18" width="40" height="34" rx="2" fill="#0f380f" opacity="0.1" />
      <circle cx="16" cy="16.5" r="1.3" fill="#f472b6" />
      {/* round d-pad */}
      <circle cx="20" cy="86" r="12" fill="#3b1d78" />
      <g fill="#c4b5fd"><rect x="17" y="78" width="6" height="16" rx="1.5" /><rect x="12" y="83" width="16" height="6" rx="1.5" /></g>
      {/* A/B */}
      <circle cx="56" cy="92" r="6.5" fill="#4c1d95" stroke="#a78bfa" strokeWidth="1" />
      <circle cx="66" cy="84" r="6.5" fill="#4c1d95" stroke="#a78bfa" strokeWidth="1" />
      <text x="56" y="94.5" fontSize="4.6" fill="#ddd6fe" textAnchor="middle" fontWeight="700">B</text>
      <text x="66" y="86.5" fontSize="4.6" fill="#ddd6fe" textAnchor="middle" fontWeight="700">A</text>
      <g fill="#6d28d9"><rect x="30" y="106" width="11" height="3.2" rx="1.6" transform="rotate(-25 35 107)" /><rect x="44" y="106" width="11" height="3.2" rx="1.6" transform="rotate(-25 49 107)" /></g>
    </svg>
  );
}

function GBA() {
  return (
    <svg viewBox="0 0 132 78" className="h-full w-full" role="img" aria-label="Game Boy Advance">
      <defs>
        <linearGradient id="gba-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      {/* shoulders */}
      <path d="M10 14 Q4 8 16 8 H40 V16 H14 Q10 16 10 14 Z" fill="#4338ca" />
      <path d="M122 14 Q128 8 116 8 H92 V16 H118 Q122 16 122 14 Z" fill="#4338ca" />
      <rect x="6" y="12" width="120" height="58" rx="26" fill="url(#gba-body)" stroke="#312e81" strokeWidth="1.5" />
      {/* screen */}
      <rect x="40" y="20" width="52" height="42" rx="4" fill="#1e1b4b" />
      <rect x="46" y="25" width="40" height="32" rx="1.5" fill="#5eead4" opacity="0.9" />
      <rect x="46" y="25" width="40" height="32" rx="1.5" fill="#0f2f2a" opacity="0.12" />
      {/* d-pad */}
      <g fill="#312e81"><rect x="20" y="34" width="6.5" height="19" rx="1.5" /><rect x="13.5" y="40.5" width="19" height="6.5" rx="1.5" /></g>
      {/* A/B */}
      <circle cx="106" cy="46" r="6.5" fill="#4f46e5" stroke="#a5b4fc" strokeWidth="1" />
      <circle cx="116" cy="38" r="6.5" fill="#4f46e5" stroke="#a5b4fc" strokeWidth="1" />
      <text x="106" y="48.5" fontSize="4.6" fill="#e0e7ff" textAnchor="middle" fontWeight="700">B</text>
      <text x="116" y="40.5" fontSize="4.6" fill="#e0e7ff" textAnchor="middle" fontWeight="700">A</text>
      <circle cx="66" cy="66" r="1.3" fill="#f472b6" />
    </svg>
  );
}

function SNES() {
  return (
    <svg viewBox="0 0 132 96" className="h-full w-full" role="img" aria-label="Super Nintendo">
      <defs>
        <linearGradient id="snes-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6e6ea" /><stop offset="1" stopColor="#b9b9c4" />
        </linearGradient>
      </defs>
      <rect x="10" y="30" width="112" height="52" rx="8" fill="url(#snes-body)" stroke="#8f8fa0" strokeWidth="1.5" />
      {/* raised center */}
      <rect x="40" y="16" width="52" height="26" rx="6" fill="#d3d3dc" stroke="#9a9aab" strokeWidth="1.2" />
      <rect x="47" y="21" width="38" height="7" rx="2" fill="#8f8fa0" />
      {/* purple ridges */}
      <g fill="#7c5cc4"><rect x="18" y="36" width="70" height="3.4" rx="1.7" /><rect x="18" y="43" width="70" height="3.4" rx="1.7" /></g>
      {/* eject + power */}
      <circle cx="103" cy="45" r="6" fill="#6d28d9" /><rect x="97" y="58" width="14" height="5" rx="2.5" fill="#6d28d9" />
      <rect x="18" y="70" width="30" height="5" rx="2.5" fill="#c9c9d4" stroke="#9a9aab" strokeWidth="0.8" />
      <text x="66" y="93" fontSize="7" fill="#8f8fa0" textAnchor="middle" fontWeight="800" letterSpacing="1">SNES</text>
    </svg>
  );
}

function MegaDrive() {
  return (
    <svg viewBox="0 0 132 96" className="h-full w-full" role="img" aria-label="Mega Drive">
      <defs>
        <linearGradient id="md-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2b33" /><stop offset="1" stopColor="#141418" />
        </linearGradient>
      </defs>
      <path d="M14 34 H118 Q124 34 124 42 V78 Q124 84 118 84 H14 Q8 84 8 78 V42 Q8 34 14 34 Z" fill="url(#md-body)" stroke="#000" strokeWidth="1.2" />
      {/* cartridge slot */}
      <rect x="42" y="20" width="48" height="20" rx="3" fill="#1c1c22" stroke="#3a3a44" strokeWidth="1.2" />
      <rect x="47" y="24" width="38" height="4" rx="2" fill="#0a0a0c" />
      {/* red stripe */}
      <rect x="16" y="46" width="100" height="4" rx="2" fill="#dc2626" />
      <text x="20" y="64" fontSize="6.5" fill="#60a5fa" fontWeight="800" letterSpacing="0.5">16-BIT</text>
      {/* power led + volume */}
      <circle cx="108" cy="60" r="2" fill="#ef4444" />
      <g stroke="#4b5563" strokeWidth="1.4" strokeLinecap="round"><line x1="96" y1="72" x2="112" y2="72" /><line x1="99" y1="68" x2="99" y2="76" /></g>
    </svg>
  );
}

function Cartucho() {
  return (
    <svg viewBox="0 0 96 108" className="h-full w-full" role="img" aria-label="Console">
      <path d="M14 8 H74 Q82 8 82 16 V96 Q82 100 78 100 H18 Q14 100 14 96 V8 Z" fill="#3f3f46" stroke="#52525b" strokeWidth="1.5" />
      <rect x="24" y="18" width="40" height="26" rx="3" fill="#18181b" />
      <g fill="#52525b"><rect x="22" y="52" width="48" height="4" rx="2" /><rect x="22" y="60" width="48" height="4" rx="2" /><rect x="22" y="68" width="48" height="4" rx="2" /></g>
    </svg>
  );
}

const MAPA: Record<string, () => JSX.Element> = {
  gameboy: GameBoy, gbc: GameBoyColor, gba: GBA, snes: SNES, megadrive: MegaDrive,
};

export default function ConsoleArt({ chave }: { chave: ChaveConsole }) {
  const Comp = MAPA[chave] ?? Cartucho;
  return <Comp />;
}
