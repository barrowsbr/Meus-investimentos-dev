"use client";

// Home do espaço "Barroots" — o resto (notícias, radar, coleções, observatório,
// diversão). Cada destino vira um CARD próprio: cor de assinatura + um motivo
// animado que combina com a página (varredura de radar, colunas de jornal,
// ranking, órbita, moedas, dot-matrix, bloco de notas). Sistema de vidro único
// pra tudo casar — "bem cool".

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { type ReactNode } from "react";
import PageHeader from "@/components/PageHeader";
import { SPACES } from "@/components/terminal/nav";

// hue por destino (a moldura de vidro herda a cor via --h)
const HUE: Record<string, string> = {
  "/noticias": "#f0a63c",
  "/radar": "#38e0d0",
  "/etf-cem": "#f0c93c",
  "/moedas": "#e0a35c",
  "/nasa": "#8aa0ff",
  "/expressoes": "#ff8bd0",
  "/anotacoes": "#c6e64e",
  "/gameboy": "#7dd956",
};

// Cena animada (motivo) por destino — SVG leve, animação em CSS.
function Motif({ href }: { href: string }): ReactNode {
  switch (href) {
    case "/radar":
      return (
        <svg className="brc-m" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g className="brc-stroke">
            <circle cx="100" cy="46" r="14" /><circle cx="100" cy="46" r="27" /><circle cx="100" cy="46" r="40" />
            <line x1="100" y1="4" x2="100" y2="88" /><line x1="56" y1="46" x2="144" y2="46" />
          </g>
          <path className="brc-radar-sweep" d="M100 46 L100 6 A40 40 0 0 1 138 30 Z" />
          <circle className="brc-blip" cx="124" cy="34" r="2.6" />
          <circle className="brc-blip b2" cx="82" cy="62" r="2.2" />
        </svg>
      );
    case "/noticias":
      return (
        <svg className="brc-m" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g className="brc-fill-soft">
            <rect x="18" y="16" width="86" height="7" rx="2" />
            <rect x="18" y="30" width="70" height="4" rx="2" /><rect x="18" y="39" width="78" height="4" rx="2" />
            <rect x="18" y="48" width="64" height="4" rx="2" /><rect x="18" y="57" width="74" height="4" rx="2" />
            <rect x="18" y="66" width="54" height="4" rx="2" />
          </g>
          <rect className="brc-stroke" x="120" y="30" width="62" height="44" rx="4" fill="none" />
          <polyline className="brc-trend" points="126,66 138,54 150,60 164,40 176,46" fill="none" />
          <circle className="brc-blip" cx="176" cy="46" r="2.4" />
        </svg>
      );
    case "/etf-cem":
      return (
        <svg className="brc-m" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path className="brc-stroke" d="M70 26 L82 40 L100 22 L118 40 L130 26 L130 50 L70 50 Z" fill="none" />
          <g className="brc-bars">
            <rect x="44" y="58" width="16" height="20" rx="2" style={{ ["--d" as string]: "0s" }} />
            <rect x="68" y="52" width="16" height="26" rx="2" style={{ ["--d" as string]: ".2s" }} />
            <rect x="92" y="44" width="16" height="34" rx="2" style={{ ["--d" as string]: ".4s" }} />
            <rect x="116" y="50" width="16" height="28" rx="2" style={{ ["--d" as string]: ".6s" }} />
            <rect x="140" y="60" width="16" height="18" rx="2" style={{ ["--d" as string]: ".8s" }} />
          </g>
        </svg>
      );
    case "/moedas":
      return (
        <svg className="brc-m" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g className="brc-coins">
            <g style={{ ["--d" as string]: "0s" }}><circle className="brc-stroke" cx="72" cy="46" r="22" /><circle className="brc-stroke faint" cx="72" cy="46" r="15" /></g>
            <g style={{ ["--d" as string]: ".25s" }}><circle className="brc-stroke" cx="104" cy="46" r="22" /><circle className="brc-stroke faint" cx="104" cy="46" r="15" /></g>
            <g style={{ ["--d" as string]: ".5s" }}><circle className="brc-stroke" cx="136" cy="46" r="22" /><circle className="brc-stroke faint" cx="136" cy="46" r="15" /></g>
          </g>
          <rect className="brc-shine" x="0" y="0" width="200" height="90" />
        </svg>
      );
    case "/nasa":
      return (
        <svg className="brc-m" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g className="brc-stars">
            <circle cx="34" cy="20" r="1.2" /><circle cx="168" cy="26" r="1.5" /><circle cx="150" cy="66" r="1.1" />
            <circle cx="46" cy="70" r="1.3" /><circle cx="182" cy="52" r="1" /><circle cx="22" cy="48" r="1" />
          </g>
          <ellipse className="brc-stroke" cx="100" cy="46" rx="52" ry="24" fill="none" />
          <circle className="brc-planet-core" cx="100" cy="46" r="9" />
          <circle className="brc-orbiter" r="3.2">
            <animateMotion dur="7s" repeatCount="indefinite" path="M152 46 A52 24 0 1 1 48 46 A52 24 0 1 1 152 46" />
          </circle>
        </svg>
      );
    case "/expressoes":
      return (
        <svg className="brc-m" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g className="brc-stroke">
            <ellipse cx="100" cy="45" rx="30" ry="37" />
            <line x1="70" y1="30" x2="130" y2="30" /><line x1="72" y1="45" x2="128" y2="45" /><line x1="74" y1="60" x2="126" y2="60" />
            <line x1="100" y1="10" x2="100" y2="80" />
            <path d="M84 57 Q100 70 116 57" fill="none" />
          </g>
          <circle className="brc-blip" cx="88" cy="40" r="2.6" />
          <circle className="brc-blip b2" cx="112" cy="40" r="2.6" />
        </svg>
      );
    case "/anotacoes":
      return (
        <svg className="brc-m" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect className="brc-note" x="60" y="16" width="80" height="62" rx="6" />
          <path className="brc-note-fold" d="M124 16 L140 32 L124 32 Z" />
          <g className="brc-check">
            <path className="brc-tick" d="M70 34 l5 5 l9 -10" fill="none" />
            <rect className="brc-stroke faint" x="88" y="32" width="40" height="4" rx="2" />
            <rect className="brc-stroke faint" x="70" y="48" width="58" height="4" rx="2" />
            <rect className="brc-stroke faint" x="70" y="60" width="44" height="4" rx="2" />
          </g>
        </svg>
      );
    case "/gameboy":
      return (
        <svg className="brc-m" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g className="brc-matrix">
            {Array.from({ length: 7 }).map((_, r) =>
              Array.from({ length: 14 }).map((_, c) => {
                const on = (r * 3 + c * 5) % 7 < 3;
                return <rect key={`${r}-${c}`} x={24 + c * 8} y={20 + r * 8} width="5" height="5" rx="1" className={on ? "on" : ""} style={{ ["--d" as string]: `${(r + c) * 0.12}s` }} />;
              }),
            )}
          </g>
          <g className="brc-fill-soft">
            <rect x="150" y="44" width="8" height="24" rx="2" /><rect x="142" y="52" width="24" height="8" rx="2" />
          </g>
        </svg>
      );
    default:
      return null;
  }
}

export default function BarrootsHome() {
  const space = SPACES.find((s) => s.id === "barroots");
  const items = (space?.items ?? []).filter((i) => i.href !== "/barroots");

  return (
    <>
      <PageHeader
        title="Barroots"
        description="O resto — notícias, radar, coleções, observatório e diversão."
      />

      <div className="brc-grid">
        {items.map(({ href, label, icon: Icon, sub }) => (
          <Link key={href} href={href} className="brc-card" style={{ ["--h" as string]: HUE[href] ?? "#8aa0ff" }} aria-label={label}>
            <div className="brc-scene">
              <Motif href={href} />
              <span className="brc-fade" />
              <span className="brc-chip"><Icon size={18} strokeWidth={1.9} /></span>
            </div>
            <div className="brc-body">
              <div className="brc-title">
                <span>{label}</span>
                <ArrowRight size={14} className="brc-arrow" />
              </div>
              {sub && <p className="brc-sub">{sub}</p>}
            </div>
          </Link>
        ))}
      </div>

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.brc-grid{display:grid;grid-template-columns:1fr;gap:14px;max-width:64rem;}
@media(min-width:640px){.brc-grid{grid-template-columns:1fr 1fr;}}
@media(min-width:1024px){.brc-grid{grid-template-columns:1fr 1fr 1fr;}}

.brc-card{position:relative;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;text-decoration:none;
  background:linear-gradient(180deg,color-mix(in srgb,var(--h) 7%,var(--surface,#0e1214)),var(--surface,#0b0f11));
  border:1px solid color-mix(in srgb,var(--h) 26%,var(--line,rgba(255,255,255,0.08)));
  box-shadow:0 1px 0 rgba(255,255,255,0.04) inset,0 18px 30px -22px rgba(0,0,0,0.7);
  transition:transform .28s cubic-bezier(.2,.7,.2,1),box-shadow .28s,border-color .28s;will-change:transform;}
.brc-card:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--h) 55%,transparent);
  box-shadow:0 26px 44px -24px rgba(0,0,0,0.85),0 0 34px -10px color-mix(in srgb,var(--h) 55%,transparent);}
.brc-card:focus-visible{outline:2px solid color-mix(in srgb,var(--h) 70%,transparent);outline-offset:2px;}

.brc-scene{position:relative;height:96px;overflow:hidden;
  background:radial-gradient(120% 130% at 78% 8%,color-mix(in srgb,var(--h) 26%,transparent),transparent 60%),
    radial-gradient(90% 120% at 12% 100%,color-mix(in srgb,var(--h) 14%,transparent),transparent 55%),
    linear-gradient(180deg,#0a0f11,#080c0e);}
.brc-scene::before{content:"";position:absolute;inset:0;opacity:.5;
  background:linear-gradient(color-mix(in srgb,var(--h) 12%,transparent) 1px,transparent 1px) 0 0/100% 12px,
    linear-gradient(90deg,color-mix(in srgb,var(--h) 12%,transparent) 1px,transparent 1px) 0 0/12px 100%;
  -webkit-mask-image:radial-gradient(120% 120% at 50% 30%,#000,transparent 75%);mask-image:radial-gradient(120% 120% at 50% 30%,#000,transparent 75%);}
.brc-fade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 45%,color-mix(in srgb,var(--h) 5%,#0b0f11) 96%);}
.brc-m{position:absolute;inset:0;width:100%;height:100%;display:block;}

.brc-stroke{fill:none;stroke:color-mix(in srgb,var(--h) 78%,transparent);stroke-width:1.5;}
.brc-stroke.faint{stroke:color-mix(in srgb,var(--h) 40%,transparent);stroke-width:1.1;}
.brc-fill-soft rect,.brc-fill-soft{fill:color-mix(in srgb,var(--h) 55%,transparent);}
.brc-blip{fill:#eafcff;filter:drop-shadow(0 0 4px var(--h));animation:brc-pulse 1.8s ease-in-out infinite;}
.brc-blip.b2{animation-delay:.7s;}
@keyframes brc-pulse{0%,100%{opacity:.35;}50%{opacity:1;}}

/* radar */
.brc-radar-sweep{fill:color-mix(in srgb,var(--h) 55%,transparent);transform-box:view-box;transform-origin:100px 46px;animation:brc-spin 4.4s linear infinite;opacity:.8;}
@keyframes brc-spin{to{transform:rotate(360deg);}}

/* notícias */
.brc-trend{stroke:var(--h);stroke-width:2;filter:drop-shadow(0 0 3px color-mix(in srgb,var(--h) 80%,transparent));stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:120;stroke-dashoffset:120;animation:brc-draw 2.6s ease-in-out infinite;}
@keyframes brc-draw{0%{stroke-dashoffset:120;}45%,100%{stroke-dashoffset:0;}}

/* etf cem — barras */
.brc-bars rect{fill:color-mix(in srgb,var(--h) 62%,transparent);transform-box:fill-box;transform-origin:bottom;animation:brc-grow 2.4s ease-in-out infinite;animation-delay:var(--d);}
@keyframes brc-grow{0%,100%{transform:scaleY(.6);}50%{transform:scaleY(1);}}

/* moedas */
.brc-coins g{transform-box:fill-box;transform-origin:center;animation:brc-bob 3.2s ease-in-out infinite;animation-delay:var(--d);}
@keyframes brc-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-4px);}}
.brc-shine{fill:color-mix(in srgb,var(--h) 20%,transparent);opacity:.0;mix-blend-mode:screen;
  -webkit-mask-image:linear-gradient(115deg,transparent 42%,#000 50%,transparent 58%);mask-image:linear-gradient(115deg,transparent 42%,#000 50%,transparent 58%);
  -webkit-mask-size:250% 100%;mask-size:250% 100%;animation:brc-sweepx 4.5s ease-in-out infinite;}
@keyframes brc-sweepx{0%,60%{-webkit-mask-position:130% 0;mask-position:130% 0;opacity:0;}61%{opacity:.9;}100%{-webkit-mask-position:-40% 0;mask-position:-40% 0;opacity:.9;}}

/* nasa */
.brc-stars circle{fill:#dfe7ff;animation:brc-twinkle 2.4s ease-in-out infinite;}
.brc-stars circle:nth-child(2n){animation-delay:.8s;}.brc-stars circle:nth-child(3n){animation-delay:1.4s;}
@keyframes brc-twinkle{0%,100%{opacity:.3;}50%{opacity:1;}}
.brc-planet-core{fill:color-mix(in srgb,var(--h) 60%,#0b0f11);stroke:var(--h);stroke-width:1.5;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--h) 70%,transparent));}
.brc-orbiter{fill:#eef3ff;filter:drop-shadow(0 0 5px var(--h));}

/* anotações */
.brc-note{fill:color-mix(in srgb,var(--h) 12%,#0c1012);stroke:color-mix(in srgb,var(--h) 55%,transparent);stroke-width:1.4;}
.brc-note-fold{fill:color-mix(in srgb,var(--h) 40%,#0c1012);}
.brc-tick{stroke:var(--h);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 3px color-mix(in srgb,var(--h) 80%,transparent));
  stroke-dasharray:26;stroke-dashoffset:26;animation:brc-draw2 3s ease-in-out infinite;}
@keyframes brc-draw2{0%,20%{stroke-dashoffset:26;}45%,100%{stroke-dashoffset:0;}}

/* game boy — dot matrix */
.brc-matrix rect{fill:color-mix(in srgb,var(--h) 16%,transparent);}
.brc-matrix rect.on{fill:color-mix(in srgb,var(--h) 85%,transparent);animation:brc-flick 2.6s steps(1) infinite;animation-delay:var(--d);}
@keyframes brc-flick{0%,70%{opacity:1;}72%{opacity:.35;}74%,100%{opacity:1;}}

.brc-chip{position:absolute;left:14px;bottom:-16px;z-index:2;width:38px;height:38px;display:grid;place-items:center;border-radius:11px;
  color:var(--h);background:linear-gradient(180deg,color-mix(in srgb,var(--h) 22%,#0c1114),#0a0e10);
  border:1px solid color-mix(in srgb,var(--h) 55%,transparent);
  box-shadow:0 0 16px -4px color-mix(in srgb,var(--h) 75%,transparent),0 8px 14px -8px rgba(0,0,0,0.7);transition:transform .28s;}
.brc-card:hover .brc-chip{transform:scale(1.06);}

.brc-body{padding:22px 15px 15px;display:flex;flex-direction:column;gap:3px;}
.brc-title{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:var(--text,#eaf0f2);letter-spacing:.01em;}
.brc-arrow{color:var(--h);opacity:0;transform:translateX(-4px);transition:opacity .25s,transform .25s;}
.brc-card:hover .brc-arrow{opacity:1;transform:translateX(0);}
.brc-sub{margin:0;font-size:11.5px;line-height:1.35;color:var(--muted,#93a1a6);}

@media(prefers-reduced-motion:reduce){
  .brc-radar-sweep,.brc-trend,.brc-bars rect,.brc-coins g,.brc-shine,.brc-stars circle,.brc-orbiter,.brc-tick,.brc-matrix rect.on,.brc-blip{animation:none;}
  .brc-trend,.brc-tick{stroke-dashoffset:0;}
}
`;
