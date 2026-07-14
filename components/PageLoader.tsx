"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PageLoader — a animação de carregamento do app, personalizada por página.
// 15 cenas em CSS puro (zero requisição), escolhidas pelo pathname via
// variantForPath(); LoadingSpinner injeta a cena no esqueleto de página.
// Com "Reduzir Movimento" ativo no aparelho, a cena vira um pulso suave
// (nunca parece travado). Vitrine aprovada pelo dono antes de implementar.
// ─────────────────────────────────────────────────────────────────────────────

import { usePathname } from "next/navigation";

export type LoaderVariant =
  | "moeda" | "pregao" | "rolo" | "cofrinho" | "radar" | "arvore"
  | "holo"
  | "engrenagens" | "jornal" | "foguete" | "cripto" | "carimbo"
  | "cambio" | "grafico" | "balanca" | "robo";

const CAPTION: Record<LoaderVariant, string> = {
  moeda: "girando a moeda…",
  pregao: "abrindo o pregão…",
  rolo: "contando os tostões…",
  cofrinho: "alimentando o cofrinho…",
  holo: "girando o globo…",
  radar: "varrendo o mundo…",
  arvore: "regando o patrimônio…",
  engrenagens: "apertando os parafusos…",
  jornal: "rodando a impressão…",
  foguete: "ligando os motores…",
  cripto: "minerando os blocos…",
  carimbo: "carimbando os papéis…",
  cambio: "trocando os dólares…",
  grafico: "desenhando a curva…",
  balanca: "pesando o risco…",
  robo: "acordando o robô…",
};

// Rota → cena. Prefixo mais específico primeiro.
const POR_ROTA: Array<[string, LoaderVariant]> = [
  ["/moedas", "moeda"],
  ["/radar", "radar"], ["/bolsas", "radar"],
  ["/configuracoes", "engrenagens"],
  ["/noticias", "jornal"],
  ["/nasa", "foguete"],
  ["/criptoativos", "cripto"], ["/bitcoin", "cripto"],
  ["/impostos", "carimbo"],
  ["/cambio", "cambio"],
  ["/performance", "grafico"], ["/setores", "grafico"],
  ["/evolucao", "arvore"], ["/patrimonio", "arvore"],
  ["/alavancagem", "balanca"], ["/caixa", "balanca"],
  ["/agente-ia", "robo"],
  ["/renda-variavel", "pregao"], ["/trades", "pregao"], ["/opcoes", "pregao"], ["/resumo", "pregao"],
  ["/financas", "cofrinho"], ["/proventos", "rolo"], ["/renda-fixa", "rolo"], ["/fluxos", "rolo"], ["/ibkr", "rolo"],
  ["/", "holo"], // Home (por último: prefixo pega tudo)
];

export function variantForPath(pathname: string | null): LoaderVariant {
  const p = pathname ?? "/";
  for (const [rota, v] of POR_ROTA) {
    if (rota === "/" ? p === "/" : p.startsWith(rota)) return v;
  }
  return "moeda";
}

// ── Cenas ─────────────────────────────────────────────────────────────────────

function Cena({ v }: { v: LoaderVariant }) {
  switch (v) {
    case "moeda":
      return (
        <div className="ldr-coin-rig">
          <div className="ldr-coin">R$</div>
          <div className="ldr-coin-sombra" />
        </div>
      );
    case "pregao":
      return (
        <div className="ldr-pregao">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="ldr-vela" />)}
        </div>
      );
    case "rolo":
      return (
        <div className="ldr-slot">
          <span className="ldr-fixo">R$</span>
          {["729418360", "381609427", "508271964"].map((seq, i) => (
            <span key={i} style={{ display: "contents" }}>
              {i === 2 && <span className="ldr-fixo">,</span>}
              <span className="ldr-rolo">
                <span className="ldr-fita">{(seq + seq[0]).split("").map((d, j) => <span key={j}>{d}</span>)}</span>
              </span>
            </span>
          ))}
        </div>
      );
    case "cofrinho":
      return (
        <div className="ldr-cofre-rig">
          <div className="ldr-moedinha" />
          <div className="ldr-plim" />
          <div className="ldr-porco">
            <div className="ldr-orelha" /><div className="ldr-olho" />
            <div className="ldr-pata ldr-pa" /><div className="ldr-pata ldr-pb" />
          </div>
        </div>
      );
    case "holo":
      return (
        <div className="ldr-holo">
          <div className="ldr-holo-halo" />
          <div className="ldr-holo-esfera">
            <div className="ldr-holo-mer" /><div className="ldr-holo-mer ldr-hm2" /><div className="ldr-holo-mer ldr-hm3" />
            <div className="ldr-holo-eq" />
          </div>
          <div className="ldr-holo-ping ldr-hp1" /><div className="ldr-holo-ping ldr-hp2" />
        </div>
      );
    case "radar":
      return (
        <div className="ldr-radar">
          <div className="ldr-varredura" />
          <div className="ldr-blip ldr-b1" /><div className="ldr-blip ldr-b2" /><div className="ldr-blip ldr-b3" />
        </div>
      );
    case "arvore":
      return (
        <div className="ldr-arvore">
          <div className="ldr-chao" /><div className="ldr-tronco" />
          <div className="ldr-folha ldr-f1" /><div className="ldr-folha ldr-f2" /><div className="ldr-folha ldr-f3" />
          <div className="ldr-folha ldr-f4" /><div className="ldr-folha ldr-f5" />
        </div>
      );
    case "engrenagens":
      return (
        <div className="ldr-gears">
          <div className="ldr-gear ldr-g1" />
          <div className="ldr-gear ldr-g2" />
        </div>
      );
    case "jornal":
      return (
        <div className="ldr-jornal">
          <div className="ldr-manchete" />
          <div className="ldr-linha ldr-l1" /><div className="ldr-linha ldr-l2" />
          <div className="ldr-linha ldr-l3" /><div className="ldr-linha ldr-l4" />
        </div>
      );
    case "foguete":
      return (
        <div className="ldr-ceu">
          <div className="ldr-estrela ldr-e1" /><div className="ldr-estrela ldr-e2" /><div className="ldr-estrela ldr-e3" />
          <div className="ldr-foguete">🚀</div>
        </div>
      );
    case "cripto":
      return (
        <div className="ldr-orbita-rig">
          <div className="ldr-btc">₿</div>
          <div className="ldr-orbita"><div className="ldr-satelite" /></div>
        </div>
      );
    case "carimbo":
      return (
        <div className="ldr-mesa">
          <div className="ldr-papel"><span className="ldr-marca">IR</span></div>
          <div className="ldr-carimbo" />
        </div>
      );
    case "cambio":
      return (
        <div className="ldr-troca">
          <div className="ldr-tc ldr-real">R$</div>
          <div className="ldr-tc ldr-dolar">$</div>
        </div>
      );
    case "grafico":
      return (
        <svg className="ldr-chart" viewBox="0 0 120 70" aria-hidden>
          <polyline className="ldr-grid" points="0,60 120,60" />
          <polyline className="ldr-curva" points="4,58 24,46 40,52 58,32 76,38 96,16 116,10" />
          <circle className="ldr-ponta" r="3.4" cx="116" cy="10" />
        </svg>
      );
    case "balanca":
      return (
        <div className="ldr-balanca">
          <div className="ldr-pilar" />
          <div className="ldr-braco">
            <div className="ldr-prato ldr-pe" /><div className="ldr-prato ldr-pd" />
          </div>
        </div>
      );
    case "robo":
      return (
        <div className="ldr-robo">
          <div className="ldr-antena" />
          <div className="ldr-cabeca">
            <div className="ldr-zoio ldr-ze" /><div className="ldr-zoio ldr-zd" />
            <div className="ldr-boca" />
          </div>
        </div>
      );
  }
}

export default function PageLoader({ variant, caption }: { variant?: LoaderVariant; caption?: string }) {
  const pathname = usePathname();
  const v = variant ?? variantForPath(pathname);
  return (
    <div className="ldr-wrap" role="status" aria-label="Carregando">
      <style>{CSS}</style>
      <div className="ldr-stage"><Cena v={v} /></div>
      <p className="ldr-caption">{caption ?? CAPTION[v]}</p>
    </div>
  );
}

// ── CSS (uma vez por loader montado; classes prefixadas ldr-) ────────────────

const CSS = `
.ldr-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 20px 0; }
.ldr-stage { height: 130px; width: 180px; display: flex; align-items: center; justify-content: center; position: relative; }
.ldr-caption { margin: 0; font-size: 12px; color: #8b8e98; letter-spacing: 0.04em; animation: ldr-resp 1.6s ease-in-out infinite; }
@keyframes ldr-resp { 0%,100% { opacity: .55; } 50% { opacity: 1; } }

/* moeda */
.ldr-coin-rig { display: flex; flex-direction: column; align-items: center; margin-top: 30px; }
.ldr-coin { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg,#F5CE85 0%,#E8A33D 45%,#B27423 100%); border: 2px solid #8a5a1a; color: #5c3a0e; display: flex; align-items: center; justify-content: center; font-family: ui-monospace,monospace; font-weight: 800; font-size: 16px; box-shadow: inset 0 2px 4px rgba(255,255,255,.55), inset 0 -3px 5px rgba(0,0,0,.3); animation: ldr-caracoroa 1.7s cubic-bezier(.45,0,.35,1) infinite; }
.ldr-coin-sombra { width: 40px; height: 7px; margin-top: 16px; border-radius: 50%; background: rgba(0,0,0,.55); filter: blur(3px); animation: ldr-sombra 1.7s cubic-bezier(.45,0,.35,1) infinite; }
@keyframes ldr-caracoroa { 0%,100% { transform: translateY(0) rotateX(0); } 50% { transform: translateY(-46px) rotateX(540deg); } }
@keyframes ldr-sombra { 0%,100% { transform: scaleX(1); opacity: .8; } 50% { transform: scaleX(.45); opacity: .3; } }

/* pregão */
.ldr-pregao { display: flex; align-items: flex-end; gap: 8px; height: 78px; border-bottom: 1px solid rgba(255,255,255,.15); padding: 0 4px; }
.ldr-vela { width: 11px; border-radius: 2px; position: relative; animation: ldr-vela 1.9s ease-in-out infinite; transform-origin: bottom; }
.ldr-vela::before { content: ""; position: absolute; left: 50%; top: -10px; bottom: -7px; width: 2px; transform: translateX(-50%); background: inherit; opacity: .7; border-radius: 1px; }
.ldr-vela:nth-child(odd) { background: #34d399; } .ldr-vela:nth-child(even) { background: #f87171; }
.ldr-vela:nth-child(1){height:38px;animation-delay:0s} .ldr-vela:nth-child(2){height:54px;animation-delay:.14s}
.ldr-vela:nth-child(3){height:30px;animation-delay:.28s} .ldr-vela:nth-child(4){height:62px;animation-delay:.42s}
.ldr-vela:nth-child(5){height:44px;animation-delay:.56s} .ldr-vela:nth-child(6){height:58px;animation-delay:.7s}
@keyframes ldr-vela { 0%,100% { transform: scaleY(.35); opacity: .55; } 50% { transform: scaleY(1); opacity: 1; } }

/* rolo */
.ldr-slot { display: flex; align-items: center; gap: 5px; font-family: ui-monospace,monospace; font-weight: 700; font-size: 22px; color: #F0B860; }
.ldr-fixo { color: #8b8e98; font-size: 16px; }
.ldr-rolo { height: 1.5em; overflow: hidden; border-radius: 6px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); padding: 0 5px; box-shadow: inset 0 6px 8px rgba(0,0,0,.5), inset 0 -6px 8px rgba(0,0,0,.5); display: inline-block; }
.ldr-fita { display: flex; flex-direction: column; line-height: 1.5em; animation: ldr-rolar 1.2s linear infinite; }
.ldr-rolo:nth-of-type(2) .ldr-fita { animation-duration: .9s; }
.ldr-rolo:nth-of-type(3) .ldr-fita { animation-duration: .7s; }
@keyframes ldr-rolar { from { transform: translateY(0); } to { transform: translateY(-13.5em); } }

/* cofrinho */
.ldr-cofre-rig { position: relative; width: 120px; height: 118px; }
.ldr-porco { position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); width: 82px; height: 53px; border-radius: 46% 46% 42% 42%; background: linear-gradient(150deg,#f9a8d4 0%,#ec6aa8 70%); box-shadow: inset 0 3px 5px rgba(255,255,255,.4), inset 0 -4px 6px rgba(0,0,0,.25); }
.ldr-porco::before { content: ""; position: absolute; top: 6px; left: 50%; transform: translateX(-50%); width: 24px; height: 4px; border-radius: 3px; background: #7c2d55; }
.ldr-porco::after { content: ""; position: absolute; right: -9px; top: 19px; width: 17px; height: 14px; border-radius: 45%; background: #f472b6; box-shadow: inset -2px 0 3px rgba(0,0,0,.25); }
.ldr-orelha { position: absolute; top: -6px; left: 13px; width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 11px solid #ec6aa8; }
.ldr-olho { position: absolute; top: 15px; right: 15px; width: 5px; height: 5px; border-radius: 50%; background: #4a1030; }
.ldr-pata { position: absolute; bottom: -5px; width: 10px; height: 8px; border-radius: 0 0 4px 4px; background: #d6488c; }
.ldr-pa { left: 12px; } .ldr-pb { right: 12px; }
.ldr-moedinha { position: absolute; left: 50%; top: 0; margin-left: -8px; width: 15px; height: 15px; border-radius: 50%; background: linear-gradient(135deg,#F5CE85,#C9852E); border: 1px solid #8a5a1a; animation: ldr-cair 1.5s cubic-bezier(.55,0,.8,.4) infinite; }
@keyframes ldr-cair { 0% { transform: translateY(-6px) rotate(0) scaleX(1); opacity: 0; } 12% { opacity: 1; } 55% { transform: translateY(46px) rotate(160deg) scaleX(1); opacity: 1; } 68% { transform: translateY(56px) rotate(180deg) scaleX(.25); opacity: 1; } 76%,100% { transform: translateY(58px) rotate(180deg) scaleX(.1); opacity: 0; } }
.ldr-plim { position: absolute; left: 50%; top: 58px; width: 28px; height: 28px; margin-left: -14px; border: 2px solid #E8A33D; border-radius: 50%; opacity: 0; animation: ldr-plim 1.5s ease-out infinite; }
@keyframes ldr-plim { 0%,66% { transform: scale(.2); opacity: 0; } 72% { opacity: .9; } 100% { transform: scale(1.6); opacity: 0; } }

/* holo-globo (Home) */
.ldr-holo { width: 104px; height: 104px; position: relative; perspective: 620px; }
.ldr-holo-esfera { position: absolute; inset: 0; transform-style: preserve-3d; animation: ldr-holo-rodar 5.5s linear infinite; }
@keyframes ldr-holo-rodar { from { transform: rotateX(-14deg) rotateY(0); } to { transform: rotateX(-14deg) rotateY(360deg); } }
.ldr-holo-mer { position: absolute; inset: 0; border-radius: 50%; border: 1px solid rgba(232,163,61,.55); }
.ldr-hm2 { transform: rotateY(60deg); } .ldr-hm3 { transform: rotateY(120deg); }
.ldr-holo-eq { position: absolute; inset: 0; border-radius: 50%; border: 1px solid rgba(240,184,96,.75); transform: rotateX(90deg); }
.ldr-holo-halo { position: absolute; inset: -10px; border-radius: 50%; background: radial-gradient(circle, rgba(232,163,61,.14) 55%, transparent 72%); animation: ldr-resp 2.6s ease-in-out infinite; }
.ldr-holo-ping { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: #F0B860; box-shadow: 0 0 10px rgba(240,184,96,.9); animation: ldr-holo-ping 2.6s ease-in-out infinite; }
.ldr-hp1 { top: 30%; left: 26%; } .ldr-hp2 { top: 58%; left: 66%; animation-delay: 1.3s; }
@keyframes ldr-holo-ping { 0%,100% { transform: scale(.6); opacity: .4; } 50% { transform: scale(1.15); opacity: 1; } }

/* radar */
.ldr-radar { width: 96px; height: 96px; border-radius: 50%; position: relative; border: 1px solid rgba(232,163,61,.5); background: radial-gradient(circle, transparent 62%, rgba(232,163,61,.18) 63%, transparent 65%), radial-gradient(circle, transparent 30%, rgba(232,163,61,.18) 31%, transparent 33%); }
.ldr-varredura { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 0deg, rgba(232,163,61,.55) 0deg, transparent 70deg); animation: ldr-girar 2.2s linear infinite; }
@keyframes ldr-girar { to { transform: rotate(360deg); } }
.ldr-blip { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #F0B860; opacity: 0; animation: ldr-blip 2.2s linear infinite; }
.ldr-b1 { top: 24%; left: 62%; animation-delay: .35s; } .ldr-b2 { top: 64%; left: 30%; animation-delay: 1.35s; } .ldr-b3 { top: 46%; left: 74%; animation-delay: .85s; }
@keyframes ldr-blip { 0%,100% { opacity: 0; } 6% { opacity: 1; } 45% { opacity: 0; } }

/* árvore */
.ldr-arvore { position: relative; width: 110px; height: 110px; }
.ldr-tronco { position: absolute; bottom: 14px; left: 50%; width: 6px; height: 50px; margin-left: -3px; border-radius: 3px 3px 0 0; background: linear-gradient(180deg,#a5673f,#6b3f22); transform-origin: bottom; animation: ldr-crescer 2.6s ease-in-out infinite; }
.ldr-chao { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); width: 62px; height: 5px; border-radius: 50%; background: rgba(232,163,61,.25); }
.ldr-folha { position: absolute; width: 19px; height: 19px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #F0B860, #C9852E); box-shadow: 0 0 10px rgba(232,163,61,.45); transform: scale(0); animation: ldr-brotar 2.6s ease-in-out infinite; }
.ldr-f1 { bottom: 60px; left: 50%; margin-left: -9px; animation-delay: .5s; }
.ldr-f2 { bottom: 48px; left: 24px; width: 14px; height: 14px; animation-delay: .75s; }
.ldr-f3 { bottom: 48px; right: 24px; width: 14px; height: 14px; animation-delay: 1s; }
.ldr-f4 { bottom: 70px; left: 33px; width: 10px; height: 10px; animation-delay: 1.2s; }
.ldr-f5 { bottom: 70px; right: 33px; width: 10px; height: 10px; animation-delay: 1.4s; }
@keyframes ldr-crescer { 0% { transform: scaleY(0); } 25%,82% { transform: scaleY(1); } 96%,100% { transform: scaleY(0); } }
@keyframes ldr-brotar { 0%,12% { transform: scale(0); } 28%,78% { transform: scale(1); } 92%,100% { transform: scale(0); } }

/* engrenagens (borda tracejada girando = dentes) */
.ldr-gears { position: relative; width: 120px; height: 100px; }
.ldr-gear { position: absolute; border-radius: 50%; border: 7px dashed #E8A33D; background: radial-gradient(circle, rgba(232,163,61,.15) 30%, transparent 32%); }
.ldr-g1 { width: 58px; height: 58px; left: 12px; top: 14px; animation: ldr-girar 3s linear infinite; }
.ldr-g2 { width: 40px; height: 40px; right: 14px; top: 44px; border-color: #F0B860; animation: ldr-girar-rev 2.1s linear infinite; }
@keyframes ldr-girar-rev { to { transform: rotate(-360deg); } }

/* jornal */
.ldr-jornal { width: 130px; padding: 12px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
.ldr-manchete { height: 10px; width: 70%; border-radius: 3px; background: #E8A33D; margin-bottom: 9px; animation: ldr-escrever 2.2s ease-in-out infinite; transform-origin: left; }
.ldr-linha { height: 5px; border-radius: 3px; background: rgba(255,255,255,.28); margin-top: 6px; transform-origin: left; animation: ldr-escrever 2.2s ease-in-out infinite; }
.ldr-l1 { width: 96%; animation-delay: .2s; } .ldr-l2 { width: 88%; animation-delay: .4s; }
.ldr-l3 { width: 92%; animation-delay: .6s; } .ldr-l4 { width: 60%; animation-delay: .8s; }
@keyframes ldr-escrever { 0%,8% { transform: scaleX(0); } 34%,80% { transform: scaleX(1); } 96%,100% { transform: scaleX(0); } }

/* foguete */
.ldr-ceu { position: relative; width: 120px; height: 120px; overflow: hidden; }
.ldr-foguete { position: absolute; left: 50%; top: 50%; margin: -22px 0 0 -20px; font-size: 40px; transform: rotate(-45deg); animation: ldr-voar 1.6s ease-in-out infinite; }
@keyframes ldr-voar { 0%,100% { transform: rotate(-45deg) translate(0,0); } 50% { transform: rotate(-45deg) translate(5px,-7px); } }
.ldr-estrela { position: absolute; width: 3px; height: 12px; border-radius: 2px; background: rgba(255,255,255,.5); animation: ldr-passar 1.1s linear infinite; }
.ldr-e1 { left: 24%; animation-delay: 0s; } .ldr-e2 { left: 55%; animation-delay: .4s; } .ldr-e3 { left: 78%; animation-delay: .75s; }
@keyframes ldr-passar { 0% { top: -14px; opacity: 0; } 15% { opacity: 1; } 100% { top: 124px; opacity: .2; } }

/* cripto */
.ldr-orbita-rig { position: relative; width: 110px; height: 110px; display: flex; align-items: center; justify-content: center; }
.ldr-btc { width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(135deg,#fbbf24,#d97706); color: #fff; font-weight: 800; font-size: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 22px rgba(251,191,36,.4); animation: ldr-pulsar 1.6s ease-in-out infinite; }
@keyframes ldr-pulsar { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.ldr-orbita { position: absolute; inset: 4px; border-radius: 50%; border: 1px dashed rgba(251,191,36,.3); animation: ldr-girar 2.6s linear infinite; }
.ldr-satelite { position: absolute; top: -4px; left: 50%; width: 9px; height: 9px; margin-left: -4px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px rgba(52,211,153,.7); }

/* carimbo */
.ldr-mesa { position: relative; width: 120px; height: 110px; }
.ldr-papel { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); width: 72px; height: 54px; border-radius: 5px; background: #e7e5e4; box-shadow: 0 3px 8px rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; }
.ldr-marca { font-family: ui-monospace,monospace; font-weight: 800; font-size: 17px; color: #dc2626; border: 2.5px solid #dc2626; border-radius: 5px; padding: 1px 7px; transform: rotate(-12deg); opacity: 0; animation: ldr-marcar 1.9s ease-out infinite; }
@keyframes ldr-marcar { 0%,42% { opacity: 0; transform: rotate(-12deg) scale(1.7); } 50%,84% { opacity: 1; transform: rotate(-12deg) scale(1); } 100% { opacity: 0; } }
.ldr-carimbo { position: absolute; left: 50%; top: 0; margin-left: -17px; width: 34px; height: 26px; border-radius: 5px 5px 2px 2px; background: linear-gradient(180deg,#8a5a1a,#5c3a0e); animation: ldr-bater 1.9s ease-in-out infinite; }
.ldr-carimbo::before { content: ""; position: absolute; top: -14px; left: 50%; margin-left: -5px; width: 10px; height: 15px; border-radius: 4px; background: #8a5a1a; }
@keyframes ldr-bater { 0%,30% { transform: translateY(0); } 44%,52% { transform: translateY(42px); } 68%,100% { transform: translateY(0); } }

/* câmbio */
.ldr-troca { position: relative; width: 130px; height: 70px; }
.ldr-tc { position: absolute; top: 50%; margin-top: -21px; width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: ui-monospace,monospace; font-weight: 800; font-size: 15px; border: 2px solid; }
.ldr-real { background: linear-gradient(135deg,#F5CE85,#C9852E); border-color: #8a5a1a; color: #5c3a0e; animation: ldr-vai 2s ease-in-out infinite; }
.ldr-dolar { background: linear-gradient(135deg,#6ee7b7,#059669); border-color: #065f46; color: #043d2e; animation: ldr-vem 2s ease-in-out infinite; }
@keyframes ldr-vai { 0%,100% { left: 6px; transform: translateY(0); z-index: 2; } 50% { left: 82px; transform: translateY(-16px); z-index: 2; } }
@keyframes ldr-vem { 0%,100% { left: 82px; transform: translateY(0); z-index: 1; } 50% { left: 6px; transform: translateY(16px); z-index: 1; } }

/* gráfico */
.ldr-chart { width: 140px; height: 84px; }
.ldr-grid { stroke: rgba(255,255,255,.15); stroke-width: 1; fill: none; }
.ldr-curva { stroke: #34d399; stroke-width: 2.4; fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 200; animation: ldr-tracar 2.4s ease-in-out infinite; }
@keyframes ldr-tracar { 0% { stroke-dashoffset: 200; } 55%,82% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -200; } }
.ldr-ponta { fill: #34d399; animation: ldr-piscar 2.4s ease-in-out infinite; }
@keyframes ldr-piscar { 0%,45% { opacity: 0; } 60%,82% { opacity: 1; } 100% { opacity: 0; } }

/* balança */
.ldr-balanca { position: relative; width: 120px; height: 100px; }
.ldr-pilar { position: absolute; bottom: 8px; left: 50%; margin-left: -3px; width: 6px; height: 62px; border-radius: 3px; background: #8a5a1a; }
.ldr-pilar::after { content: ""; position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 44px; height: 6px; border-radius: 3px; background: #8a5a1a; }
.ldr-braco { position: absolute; top: 26px; left: 50%; width: 96px; height: 4px; margin-left: -48px; border-radius: 2px; background: #E8A33D; transform-origin: center; animation: ldr-pesar 2.4s ease-in-out infinite; }
.ldr-prato { position: absolute; top: 4px; width: 30px; height: 12px; border-radius: 0 0 15px 15px; background: #F0B860; }
.ldr-prato::before { content: ""; position: absolute; top: -9px; left: 50%; width: 1.5px; height: 9px; background: rgba(240,184,96,.7); transform: translateX(-50%); }
.ldr-pe { left: -4px; } .ldr-pd { right: -4px; }
@keyframes ldr-pesar { 0%,100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }

/* robô */
.ldr-robo { position: relative; width: 100px; height: 108px; display: flex; justify-content: center; align-items: flex-end; }
.ldr-cabeca { width: 68px; height: 56px; border-radius: 14px; background: linear-gradient(160deg,#3f4759,#242a38); border: 1px solid rgba(255,255,255,.15); position: relative; animation: ldr-ladear 2.8s ease-in-out infinite; }
@keyframes ldr-ladear { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
.ldr-zoio { position: absolute; top: 17px; width: 12px; height: 12px; border-radius: 50%; background: #E8A33D; box-shadow: 0 0 8px rgba(232,163,61,.8); animation: ldr-piscada 2.8s ease-in-out infinite; }
.ldr-ze { left: 14px; } .ldr-zd { right: 14px; animation-delay: .06s; }
@keyframes ldr-piscada { 0%,42%,50%,100% { transform: scaleY(1); } 46% { transform: scaleY(.1); } }
.ldr-boca { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); width: 26px; height: 4px; border-radius: 2px; background: rgba(232,163,61,.5); }
.ldr-antena { position: absolute; top: 34px; left: 50%; margin-left: -1.5px; width: 3px; height: 16px; background: #3f4759; }
.ldr-antena::after { content: ""; position: absolute; top: -8px; left: 50%; transform: translateX(-50%); width: 9px; height: 9px; border-radius: 50%; background: #f87171; animation: ldr-resp 1.2s ease-in-out infinite; }

/* Reduzir Movimento: cena estática + legenda pulsando suave */
@media (prefers-reduced-motion: reduce) {
  .ldr-stage * { animation: none !important; }
  .ldr-caption { animation: ldr-resp 2.6s ease-in-out infinite; }
}
`;
