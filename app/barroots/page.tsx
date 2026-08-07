"use client";

// Home do espaço "Barroots" — o resto (notícias, radar, coleções, observatório,
// diversão). Mesmo estilo editorial da tela inicial (modo sóbrio): cards de
// vidro com título em serifa, ícone de linha, índice discreto, fio de separação
// e seta. Sem animação — sóbrio e elegante.

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { SPACES } from "@/components/terminal/nav";

const HUE: Record<string, string> = {
  "/moedas": "#d6a878", "/nasa": "#a99be6", "/expressoes": "#e08bc0",
  "/morse": "#7fc9d8", "/anotacoes": "#b9c88a",
};

export default function BarrootsHome() {
  const space = SPACES.find((s) => s.id === "barroots");
  const items = (space?.items ?? []).filter((i) => i.href !== "/barroots");

  return (
    <>
      <PageHeader
        title="Baú"
        description="O baú do Barroots — coleções, observatório e diversão."
      />

      <div className="bec-grid">
        {items.map(({ href, label, icon: Icon, sub }, i) => (
          <Link key={href} href={href} className="bec-card" style={{ ["--h" as string]: HUE[href] ?? "#a99be6" }} aria-label={label}>
            <span className="bec-idx">{String(i + 1).padStart(2, "0")}</span>
            <span className="bec-chip"><Icon size={18} strokeWidth={1.5} /></span>
            <div className="bec-name">{label}</div>
            {sub && <p className="bec-desc">{sub}</p>}
            <span className="bec-rule" />
            <span className="bec-foot"><span className="bec-arrow" aria-hidden="true">→</span></span>
          </Link>
        ))}
      </div>

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.bec-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(11px,2.6vw,15px);max-width:64rem;--line:rgba(255,255,255,0.08);}
@media(min-width:680px){.bec-grid{grid-template-columns:1fr 1fr 1fr;}}
@media(min-width:1040px){.bec-grid{grid-template-columns:1fr 1fr 1fr 1fr;}}

.bec-card{--h:#a99be6;position:relative;overflow:hidden;isolation:isolate;display:flex;flex-direction:column;
  gap:clamp(8px,2vw,11px);padding:clamp(15px,3.4vw,20px) clamp(14px,3.2vw,20px) clamp(13px,3vw,16px);
  border-radius:16px;text-decoration:none;
  background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.011));
  border:1px solid var(--line);
  box-shadow:0 1px 0 rgba(255,255,255,0.04) inset,0 22px 44px -30px rgba(0,0,0,0.85);
  transition:transform .3s cubic-bezier(.2,.7,.2,1),border-color .3s ease,box-shadow .3s ease;}
.bec-card::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--h) 70%,transparent),transparent);opacity:.3;transition:opacity .3s ease;}
.bec-card:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--h) 26%,var(--line));
  box-shadow:0 1px 0 rgba(255,255,255,0.06) inset,0 30px 54px -30px rgba(0,0,0,0.9),0 0 32px -16px color-mix(in srgb,var(--h) 55%,transparent);}
.bec-card:hover::before{opacity:.85;}
.bec-card:focus-visible{outline:1px solid color-mix(in srgb,var(--h) 55%,transparent);outline-offset:3px;}

.bec-idx{position:absolute;top:clamp(14px,3.4vw,18px);right:clamp(14px,3.4vw,18px);z-index:1;
  font-family:ui-monospace,"SF Mono","Cascadia Code",monospace;font-size:10px;letter-spacing:.14em;color:rgba(255,255,255,0.22);}
.bec-chip{width:clamp(32px,8vw,36px);height:clamp(32px,8vw,36px);display:grid;place-items:center;border-radius:10px;color:var(--h);
  background:rgba(255,255,255,0.025);border:1px solid color-mix(in srgb,var(--h) 22%,var(--line));}
.bec-name{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif;
  font-size:clamp(16px,4.4vw,20px);font-weight:500;letter-spacing:-0.006em;color:#f3f6f7;line-height:1.05;}
.bec-desc{flex:1;margin:0;font-size:clamp(11px,2.8vw,12.5px);line-height:1.4;color:var(--muted,#8b969b);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.bec-rule{height:1px;background:var(--line);margin-top:2px;}
.bec-foot{display:flex;justify-content:flex-end;}
.bec-arrow{color:var(--faint,#79868c);font-size:15px;line-height:1;opacity:.45;transform:translateX(-2px);transition:transform .25s ease,opacity .25s ease,color .25s ease;}
.bec-card:hover .bec-arrow{opacity:1;transform:translateX(0);color:color-mix(in srgb,var(--h) 75%,#79868c);}
`;
