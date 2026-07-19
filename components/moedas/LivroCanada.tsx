"use client";

// Livrinho do Canadá — recriação VETORIAL "como novo" do Commemorative Coin
// Set 2007 da Royal Canadian Mint (o card físico do dono, gasto, vira um
// livreto 3D zero-quilômetro, nítido em qualquer tela/DPR):
//
// • Capa (folha de bordo na água + faixa "COMMEMORATIVE COIN SET 2007" com o
//   furo redondo revelando a moeda de 25¢ colorida) → toque ABRE o livro;
// • Miolo: página de TEXTOS (os 7 painéis EN/FR do card original,
//   transcritos — toque num painel abre o leitor ampliado) | página dos
//   BERÇOS (furos rotulados em arco, listras e folhas azuis, bandeira);
// • Vira mais uma página → CONTRACAPA (furos vazados mostrando o verso do
//   miolo, código de barras e créditos da RCM);
// • Os berços são preenchidos com as moedas DA COLEÇÃO (Canadá, ano 2007,
//   casadas por denominação); berço sem moeda fica vazio. Toque numa moeda
//   VIRA anverso⇄reverso. Folha de bordo = emoji 🍁 (vetorial no iPhone).
//
// Aberto pelo botão "Livro" na toolbar do estojo, SÓ no conjunto
// "Dólar canadense" (mesmo padrão do Quadro do Plano Real).

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { MOEDAS_COLECAO } from "@/lib/moedas-data";
import type { Moeda } from "@/lib/moedas";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function moedaCA(re: RegExp): Moeda | null {
  return MOEDAS_COLECAO.find((m) => m.pais === "Canadá" && m.anoNum === 2007 && re.test(norm(m.denominacao))) ?? null;
}

// ── Conteúdo resgatado do card original (textos EN/FR transcritos) ───────────

interface Painel {
  tituloEn: string; tituloFr: string; valor: string;
  en: string; fr: string; re: RegExp;
}

const PAINEIS: Painel[] = [
  {
    tituloEn: "CANADIAN COAT OF ARMS", tituloFr: "ARMOIRIES DU CANADA", valor: "50 cents", re: /^50 centimos/,
    en: "The Canadian Coat of Arms, proclaimed in 1921 and modified in 1996, reminds Canadians of their varied heritage with images from France (fleur-de-lys), England (three royal lions and rose), Scotland (lion and thistle), and Ireland (Irish harp and shamrock).",
    fr: "Les armoiries du Canada, proclamées en 1921 et modifiées en 1996, rappellent aux Canadiens la richesse de leur patrimoine en évoquant symboliquement la France (la fleur de lys), l’Angleterre (les trois lions et la rose), l’Écosse (un lion et un chardon) et l’Irlande (la harpe irlandaise et le trèfle).",
  },
  {
    tituloEn: "COMMON LOON", tituloFr: "PLONGEON HUARD", valor: "1 dollar", re: /^1 dolar/,
    en: "The haunting laughter of the loon is the quintessential sound of the Canadian wilderness. Migrating to warmer climates in winter, the loon is one of the first birds to fly home, and a harbinger of Canadian spring.",
    fr: "Le cri rieur du huard évoque on ne peut mieux la nature sauvage canadienne. Si le huard se dirige vers des climats plus chauds l’hiver, son retour hâtif au pays annonce l’arrivée du printemps canadien.",
  },
  {
    tituloEn: "BEAVER", tituloFr: "CASTOR", valor: "5 cents", re: /^5 centimos/,
    en: "The beaver’s rich fur was in high demand in 17th and 18th century Europe and, for centuries, was the mainstay of the colonial economy. Today, the beaver symbolizes hard work and perseverance.",
    fr: "Très prisé pour sa fourrure aux XVIIᵉ et XVIIIᵉ siècles, le castor a longtemps soutenu l’ensemble de l’économie coloniale. De nos jours, le castor symbolise le travail ardu et la persévérance.",
  },
  {
    tituloEn: "MAPLE LEAF", tituloFr: "FEUILLE D’ÉRABLE", valor: "1 cent", re: /^1 centimo/,
    en: "Native Canadians first discovered the unique properties of the maple tree. The maple leaf began to serve as a Canadian symbol as early as 1700, and became the official Canadian emblem for Confederation in 1867.",
    fr: "Les Premières Nations ont découvert les propriétés de l’érable. Dès 1700, la feuille d’érable fait figure de symbole canadien puis devient, en 1867, l’emblème officiel du Canada.",
  },
  {
    tituloEn: "POLAR BEAR", tituloFr: "OURS POLAIRE", valor: "2 dollars", re: /^2 dolares/,
    en: "The polar bear, one of the world’s largest terrestrial meat-eaters, can weigh as much as 650 kilos. It lives in extreme environmental conditions, the cold seas and frozen ice of the Canadian North.",
    fr: "L’ours polaire, l’un des plus gros carnivores terrestres, peut peser jusqu’à 650 kilos. Il vit dans des conditions environnementales extrêmes sur les côtes et dans les mers arctiques du Nord canadien.",
  },
  {
    tituloEn: "MAPLE LEAF", tituloFr: "FEUILLE D’ÉRABLE", valor: "25 cents", re: /^25 centimos/,
    en: "This set includes a special edition 25-cent coin with a multi-coloured maple leaf design, rather than the antlered caribou in circulation. The maple leaf was featured on coins produced between 1876 and 1901. It has always been with us, changing design in step with the times.",
    fr: "L’édition spéciale de 25 cents ci-jointe met à l’honneur une feuille d’érable multicolore au lieu du majestueux caribou des pièces de circulation. Symbole apparu sur la monnaie produite entre 1876 et 1901, la feuille d’érable a toujours fait partie du paysage, son design changeant selon les époques.",
  },
  {
    tituloEn: "BLUENOSE", tituloFr: "BLUENOSE", valor: "10 cents", re: /^10 centimos/,
    en: "Early 20th century Atlantic Canada built one of the finest fishing and trading vessels known to history, the Bluenose. Most famous for its speed, the Bluenose won the prestigious America’s Cup and continued to serve as part of the Lunenberg Nova Scotia fleet for 25 years, twice as long as other trading vessels of the time.",
    fr: "Au début du XXᵉ siècle, les chantiers navals du Canada atlantique construisent l’un des navires les plus sophistiqués pour la pêche et le commerce de l’histoire : le Bluenose. Renommé pour sa rapidité, le Bluenose a remporté de nombreuses courses, dont la prestigieuse Coupe de l’Amérique, et a servi fidèlement la flotte de pêche de Lunenberg, en Nouvelle-Écosse, pendant 25 ans, soit deux fois plus longtemps que tout autre navire de l’époque.",
  },
];

// Berços da página de moedas: posição (% da página), rótulo e Ø real (mm).
interface SlotCA { rotulo: string; cx: number; cy: number; mm: number; re: RegExp }

const SLOTS: SlotCA[] = [
  { rotulo: "1 DOLLAR", cx: 50, cy: 21, mm: 26.5, re: /^1 dolar/ },
  { rotulo: "5 CENTS", cx: 22, cy: 34, mm: 21.2, re: /^5 centimos/ },
  { rotulo: "25 CENTS", cx: 78, cy: 34, mm: 23.88, re: /^25 centimos/ },
  { rotulo: "2 DOLLARS", cx: 50, cy: 50, mm: 28, re: /^2 dolares/ },
  { rotulo: "1 CENT", cx: 22, cy: 65, mm: 19.05, re: /^1 centimo/ },
  { rotulo: "10 CENTS", cx: 78, cy: 65, mm: 18.03, re: /^10 centimos/ },
  { rotulo: "50 CENTS", cx: 50, cy: 79, mm: 27.13, re: /^50 centimos/ },
];

// As fotos do CoinSnap trazem a EFÍGIE como anverso; o lado do DESENHO
// (castor, huard, folha colorida…) é o reverso — é ele que aparece no card.
const ESCALA_MOEDA = 0.8; // folga entre furos e rótulos em arco (como no card)

// ── Peças visuais ────────────────────────────────────────────────────────────

// Rótulo em ARCO acima do furo (como no card: o texto acompanha o círculo).
function RotuloArco({ texto, r, u, cor }: { texto: string; r: number; u: number; cor: string }) {
  const R = r + u * 3.6;
  const id = `arc-${texto.replace(/\s+/g, "-")}-${cor.replace(/[^a-z0-9]/gi, "")}`;
  const W = R * 2 + 16;
  return (
    <svg width={W} height={R + 10} className="absolute left-1/2 -translate-x-1/2" style={{ top: -(u * 5.2), overflow: "visible" }} aria-hidden>
      <defs><path id={id} d={`M 8 ${R + 4} A ${R} ${R} 0 0 1 ${W - 8} ${R + 4}`} /></defs>
      <text style={{ fill: cor, fontSize: Math.max(7, u * 3.4), fontWeight: 700, letterSpacing: u * 1.1 }}>
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{texto}</textPath>
      </text>
    </svg>
  );
}

// Moeda com flip 3D no toque — ou o furo vazio (recorte no cartão). Pela
// FRENTE do card o lado visível é o do DESENHO (reverso das fotos CoinSnap);
// pela CONTRACAPA (livro vazado) aparece a parte de TRÁS da moeda — a efígie.
function MoedaSlot({ moeda, d, frente = "desenho" }: { moeda: Moeda | null; d: number; frente?: "desenho" | "efigie" }) {
  const [verso, setVerso] = useState(false);
  const desenho = moeda?.fotos[0]?.reverso || moeda?.fotoReverso || moeda?.fotoAnverso || "";
  const efigie = moeda?.fotos[0]?.anverso || moeda?.fotoAnverso || "";
  const anv = frente === "desenho" ? desenho : efigie;
  const rev = frente === "desenho" ? efigie : desenho;
  if (!moeda || !anv) {
    return (
      <div
        className="rounded-full"
        style={{ width: d, height: d, background: "#f4f6f8", boxShadow: "inset 0 3px 7px rgba(30,50,70,0.35), inset 0 -1px 1px rgba(255,255,255,0.9)" }}
      />
    );
  }
  const img = (src: string, atras: boolean) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt="" draggable={false}
      className="absolute inset-0 h-full w-full rounded-full object-cover"
      style={{ backfaceVisibility: "hidden", transform: atras ? "rotateY(180deg)" : undefined, boxShadow: "0 2px 7px rgba(20,40,60,0.5), 0 0 0 1px rgba(0,0,0,0.25)" }}
    />
  );
  return (
    <button
      onClick={() => setVerso((v) => !v)}
      className="relative block"
      style={{ width: d, height: d, perspective: 500 }}
      aria-label={`${moeda.denominacao} ${moeda.ano} — virar`}
    >
      <div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d", transition: "transform 0.55s cubic-bezier(0.2,0.7,0.3,1)", transform: verso ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {img(anv, false)}
        {rev && img(rev, true)}
      </div>
    </button>
  );
}

// Folhas de bordo azuladas do padrão de fundo (🍁 tingida via CSS filter).
function FolhasFundo({ u }: { u: number }) {
  const folhas = useMemo(() => {
    const out: Array<{ x: number; y: number; s: number; r: number }> = [];
    const cols = [8, 36, 64, 92];
    for (let c = 0; c < cols.length; c++) {
      for (let l = 0; l < 7; l++) {
        out.push({ x: cols[c], y: 4 + l * 14 + (c % 2 ? 7 : 0), s: 7 + ((c + l) % 3) * 2, r: ((c * 7 + l * 13) % 40) - 20 });
      }
    }
    return out;
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {folhas.map((f, i) => (
        <span
          key={i}
          className="absolute select-none"
          style={{
            left: `${f.x}%`, top: `${f.y}%`, fontSize: f.s * u,
            transform: `translate(-50%,-50%) rotate(${f.r}deg)`,
            filter: "sepia(1) saturate(0.9) hue-rotate(165deg) brightness(1.55) opacity(0.5)",
          }}
        >🍁</span>
      ))}
    </div>
  );
}

function BandeiraCanada({ w }: { w: number }) {
  const h = w / 2;
  return (
    <div className="relative overflow-hidden" style={{ width: w, height: h, borderRadius: w * 0.02, boxShadow: "0 3px 9px rgba(20,40,60,0.4)", transform: "rotate(-4deg)" }}>
      <div className="absolute inset-0 bg-white" />
      <div className="absolute left-0 top-0 h-full bg-[#d52b1e]" style={{ width: "25%" }} />
      <div className="absolute right-0 top-0 h-full bg-[#d52b1e]" style={{ width: "25%" }} />
      <span className="absolute left-1/2 top-1/2 select-none" style={{ fontSize: h * 0.62, transform: "translate(-50%,-54%)", filter: "sepia(1) saturate(8) hue-rotate(-18deg) brightness(0.82)" }}>🍁</span>
    </div>
  );
}

// ── As quatro faces do livrinho ──────────────────────────────────────────────

function Capa({ u, moeda25 }: { u: number; moeda25: Moeda | null }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(160deg, #4a7fb5 0%, #2c5a8f 45%, #1c3d68 100%)" }}>
      {/* ondulações da água */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(70% 40% at 30% 62%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(50% 30% at 55% 80%, rgba(0,20,50,0.25), transparent 70%), radial-gradient(60% 35% at 20% 30%, rgba(255,255,255,0.06), transparent 60%)" }} />
      {/* folha de bordo flutuando + reflexo */}
      <span className="absolute select-none" style={{ left: "30%", top: "52%", fontSize: u * 34, transform: "translate(-50%,-50%) rotate(-14deg)", filter: "saturate(1.25) drop-shadow(0 10px 14px rgba(0,15,40,0.55))" }}>🍁</span>
      <span className="absolute select-none" style={{ left: "30%", top: "70%", fontSize: u * 34, transform: "translate(-50%,-50%) rotate(-166deg) scaleX(-1)", opacity: 0.18, filter: "blur(2px)" }}>🍁</span>

      {/* faixa direita */}
      <div className="absolute inset-y-0 right-0" style={{ width: "37%", background: "linear-gradient(180deg, #9dbdd6 0%, #7ea6c6 55%, #92b6d2 100%)", boxShadow: "-4px 0 14px rgba(10,30,60,0.25)" }}>
        <div style={{ padding: `${u * 6}px ${u * 3}px 0 ${u * 3.5}px` }}>
          <p className="font-bold uppercase text-white" style={{ fontSize: u * 3.1, lineHeight: 1.35, letterSpacing: "0.04em", textShadow: "0 1px 2px rgba(20,40,70,0.4)" }}>
            Commemorative<br />Coin Set
          </p>
          <p className="mt-1 font-bold uppercase text-white/95" style={{ fontSize: u * 2.8, lineHeight: 1.35, letterSpacing: "0.03em" }}>
            Ensemble souvenir<br />de pièces de monnaie
          </p>
          <div className="flex items-center" style={{ gap: u * 2.2, marginTop: u * 2 }}>
            <span className="font-bold text-white" style={{ fontSize: u * 6.5, textShadow: "0 1px 3px rgba(20,40,70,0.45)" }}>2007</span>
            <BandeiraCanada w={u * 10} />
          </div>
        </div>

        {/* furo revelando a 25¢ colorida (como no card físico) */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: "47%" }}>
          <div className="rounded-full" style={{ padding: u * 1.1, background: "#e8eef4", boxShadow: "inset 0 2px 4px rgba(30,50,70,0.5), 0 1px 0 rgba(255,255,255,0.6)" }}>
            <div className="overflow-hidden rounded-full" style={{ width: u * 22, height: u * 22 }}>
              {moeda25 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={moeda25.fotos[0]?.reverso || moeda25.fotoReverso || moeda25.fotoAnverso} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="h-full w-full" style={{ background: "#dfe7ee" }} />
              )}
            </div>
          </div>
        </div>

        {/* selo da RCM */}
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ bottom: u * 5, gap: u * 1.8 }}>
          <div className="flex items-center justify-center rounded-full" style={{ width: u * 8.5, height: u * 8.5, background: "radial-gradient(circle at 38% 32%, #2a2318, #0d0b07 75%)", border: `${Math.max(1, u * 0.5)}px solid #c9a24c`, boxShadow: "0 2px 6px rgba(20,30,50,0.4)" }}>
            <span className="select-none" style={{ fontSize: u * 4.2, filter: "sepia(1) saturate(4) hue-rotate(-8deg) brightness(1.15)" }}>👑</span>
          </div>
          <p className="text-center font-semibold uppercase" style={{ fontSize: u * 2.5, letterSpacing: "0.14em", color: "#e9c877", textShadow: "0 1px 2px rgba(20,30,50,0.5)" }}>
            Royal Canadian Mint<br />Monnaie royale canadienne
          </p>
        </div>
      </div>

      {/* brilho de "novo em folha" varrendo a capa */}
      <div className="lc-sheen pointer-events-none absolute inset-y-0" style={{ width: "42%", background: "linear-gradient(102deg, transparent 12%, rgba(255,255,255,0.32) 48%, rgba(255,255,255,0.10) 60%, transparent 88%)" }} />
    </div>
  );
}

function PaginaTextos({ u, aoLer }: { u: number; aoLer: (p: Painel) => void }) {
  const fs = Math.max(3.2, u * 1.5);
  const painel = (p: Painel) => {
    const m = moedaCA(p.re);
    const foto = m?.fotos[0]?.reverso || m?.fotoReverso || m?.fotoAnverso;
    return (
      <button key={p.tituloEn + p.valor} onClick={() => aoLer(p)} className="block w-full text-left" style={{ marginBottom: u * 2.2 }}>
        <div className="flex items-center justify-between text-white" style={{ background: "linear-gradient(90deg, #2e6da8, #58a0cf)", padding: `${u * 0.8}px ${u * 1.4}px`, borderRadius: u * 0.6 }}>
          <span className="font-bold uppercase" style={{ fontSize: fs, lineHeight: 1.25 }}>{p.tituloEn}<br />{p.tituloFr}</span>
          {foto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" className="shrink-0 rounded-full object-cover" style={{ width: u * 6, height: u * 6, boxShadow: "0 1px 3px rgba(20,40,60,0.5)" }} draggable={false} />
          )}
        </div>
        <p className="font-bold" style={{ fontSize: fs, color: "#1d3a55", margin: `${u * 0.8}px 0` }}>{p.valor}</p>
        <p style={{ fontSize: fs, lineHeight: 1.4, color: "#2b3a47" }}>{p.en}</p>
        <p style={{ fontSize: fs, lineHeight: 1.4, color: "#40566b", marginTop: u * 0.8 }}>{p.fr}</p>
      </button>
    );
  };
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#fbfcfd]" style={{ padding: u * 3.2 }}>
      <div className="pointer-events-none absolute inset-y-0 right-0" style={{ width: u * 5, background: "linear-gradient(90deg, transparent, rgba(30,60,90,0.10))" }} />
      <div className="grid h-full" style={{ gridTemplateColumns: "1fr 1fr 1fr", columnGap: u * 2.6 }}>
        <div>{[PAINEIS[0], PAINEIS[1]].map(painel)}</div>
        <div>{[PAINEIS[2], PAINEIS[3], PAINEIS[4]].map(painel)}</div>
        <div>{[PAINEIS[5], PAINEIS[6]].map(painel)}</div>
      </div>
    </div>
  );
}

function PaginaMoedas({ u }: { u: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "repeating-linear-gradient(90deg, #ffffff 0, #ffffff 6%, #e8f1f8 6%, #e8f1f8 12%)" }}>
      <FolhasFundo u={u} />
      <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: u * 5, background: "linear-gradient(270deg, transparent, rgba(30,60,90,0.10))" }} />
      {SLOTS.map((s) => {
        const d = s.mm * u * ESCALA_MOEDA;
        return (
          <div key={s.rotulo} className="absolute" style={{ left: `${s.cx}%`, top: `${s.cy}%`, transform: "translate(-50%,-50%)" }}>
            <RotuloArco texto={s.rotulo} r={d / 2} u={u} cor="#3b74a8" />
            <div className="rounded-full" style={{ padding: u * 0.9, background: "#ffffff", boxShadow: "inset 0 2px 5px rgba(30,50,70,0.4), 0 1px 0 rgba(255,255,255,0.8)" }}>
              <MoedaSlot moeda={moedaCA(s.re)} d={d} />
            </div>
          </div>
        );
      })}
      <div className="absolute" style={{ right: "4%", bottom: "3.5%" }}>
        <BandeiraCanada w={u * 26} />
      </div>
    </div>
  );
}

function Contracapa({ u }: { u: number }) {
  const barras = useMemo(() => Array.from({ length: 34 }, (_, i) => 1 + ((i * 7) % 3)), []);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(200deg, #6e97bd 0%, #3f6a97 50%, #2a4c74 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 40% at 35% 40%, rgba(255,255,255,0.10), transparent 65%)" }} />
      {/* furos vazados — pela contracapa se vê a parte de TRÁS das moedas */}
      {SLOTS.map((s) => {
        const d = s.mm * u * ESCALA_MOEDA;
        const m = moedaCA(s.re);
        return (
          <div key={s.rotulo} className="absolute" style={{ left: `${100 - s.cx}%`, top: `${s.cy}%`, transform: "translate(-50%,-50%)" }}>
            <RotuloArco texto={s.rotulo} r={d / 2} u={u} cor="#ffffff" />
            {m ? (
              <div className="rounded-full" style={{ padding: u * 0.9, background: "#31547b", boxShadow: "inset 0 3px 7px rgba(10,25,45,0.6), 0 1px 0 rgba(255,255,255,0.15)" }}>
                <MoedaSlot moeda={m} d={d} frente="efigie" />
              </div>
            ) : (
              <div
                className="rounded-full"
                style={{
                  width: d, height: d,
                  background: "repeating-linear-gradient(0deg, #f6f8f9 0, #f6f8f9 3px, #dfe6ea 3px, #dfe6ea 4px)",
                  boxShadow: "inset 0 3px 7px rgba(15,35,60,0.5)",
                }}
              />
            )}
          </div>
        );
      })}
      {/* código de barras + créditos */}
      <div className="absolute flex items-end bg-white" style={{ left: "4%", bottom: "2%", padding: u * 1.2, borderRadius: u * 0.8, gap: 1 }}>
        {barras.map((w, i) => (
          <div key={i} style={{ width: Math.max(1, w * u * 0.3), height: u * 5.5, background: i % 2 ? "#fff" : "#111" }} />
        ))}
      </div>
      <div className="absolute" style={{ left: "27%", bottom: "1.6%", right: "3%" }}>
        <p className="text-white/90" style={{ fontSize: Math.max(4.5, u * 1.5), lineHeight: 1.45, textAlign: "left" }}>
          BLUENOSE © Bluenose II Preservation Trust (2007)<br />
          © 2007 ROYAL CANADIAN MINT. ALL RIGHTS RESERVED.<br />
          © 2007 MONNAIE ROYALE CANADIENNE – TOUS DROITS RÉSERVÉS.<br />
          320 SUSSEX DRIVE / 320, PROMENADE SUSSEX, OTTAWA, ONTARIO K1A 0G8<br />
          1-800-267-1871 · MINT.CA / MONNAIE.CA
        </p>
      </div>
    </div>
  );
}

// ── O livro (2 folhas × 2 faces, lombada ao centro) ──────────────────────────

export default function LivroCanada({ onClose }: { onClose: () => void }) {
  // 0 = fechado (capa) · 1 = aberto (textos | moedas) · 2 = contracapa
  const [passo, setPasso] = useState(0);
  const [leitor, setLeitor] = useState<Painel | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  // Zoom: pinça (mobile) / roda (desktop) + arrastar quando ampliado.
  const [vista, setVista] = useState({ s: 1, x: 0, y: 0, animar: true });
  const gestoRef = useRef<{ modo: "pan" | "pinch" | null; d0: number; s0: number; x0: number; y0: number; px: number; py: number }>(
    { modo: null, d0: 0, s0: 1, x0: 0, y0: 0, px: 0, py: 0 },
  );

  useEffect(() => {
    const medir = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  // Virar página zera o zoom (senão a página nova nasce cortada).
  useEffect(() => { setVista({ s: 1, x: 0, y: 0, animar: true }); }, [passo]);

  const pageW = Math.min((dims.w - 28) / 2, dims.h * 0.72, 540);
  const pageH = pageW * 1.04;
  const u = pageW / 110; // ~110 "mm" por página (escala do card físico)
  const moeda25 = moedaCA(/^25 centimos/);

  // Centraliza a página visível: fechado, só a metade DIREITA existe (capa) →
  // desloca o miolo para a esquerda; na contracapa é a metade ESQUERDA.
  const shift = passo === 0 ? -pageW / 2 : passo === 2 ? pageW / 2 : 0;

  const clampVista = (s: number, x: number, y: number) => {
    const cs = Math.min(4, Math.max(1, s));
    const mx = pageW * cs * 0.9, my = pageH * cs * 0.6;
    return { s: cs, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)), animar: false };
  };
  const distToques = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      gestoRef.current = { modo: "pinch", d0: distToques(e.touches), s0: vista.s, x0: vista.x, y0: vista.y, px: 0, py: 0 };
    } else if (e.touches.length === 1 && vista.s > 1.02) {
      gestoRef.current = { modo: "pan", d0: 0, s0: vista.s, x0: vista.x, y0: vista.y, px: e.touches[0].clientX, py: e.touches[0].clientY };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const g = gestoRef.current;
    if (g.modo === "pinch" && e.touches.length === 2) {
      const f = distToques(e.touches) / g.d0;
      setVista(clampVista(g.s0 * f, g.x0 * f, g.y0 * f));
    } else if (g.modo === "pan" && e.touches.length === 1) {
      setVista(clampVista(g.s0, g.x0 + e.touches[0].clientX - g.px, g.y0 + e.touches[0].clientY - g.py));
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      gestoRef.current.modo = null;
      setVista((v) => (v.s < 1.05 ? { s: 1, x: 0, y: 0, animar: true } : { ...v, animar: true }));
    } else if (e.touches.length === 1 && gestoRef.current.modo === "pinch") {
      // sobrou 1 dedo da pinça → vira arrasto contínuo
      gestoRef.current = { modo: "pan", d0: 0, s0: vista.s, x0: vista.x, y0: vista.y, px: e.touches[0].clientX, py: e.touches[0].clientY };
    }
  };
  const folha = (rot: number, z: number, frente: JSX.Element, verso: JSX.Element) => (
    <div
      className="absolute top-0 h-full"
      style={{
        left: "50%", width: "50%", zIndex: z,
        transformStyle: "preserve-3d", transformOrigin: "left center",
        transition: "transform 1s cubic-bezier(0.35, 0.05, 0.2, 1)",
        transform: `rotateY(${rot}deg)`,
      }}
    >
      {/* a face virada para trás não pode capturar toques (backface só some do
          desenho, não do hit-testing) — senão a contracapa fica "bloqueada" */}
      <div className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: "hidden", borderRadius: u * 1.6, boxShadow: "0 10px 30px -12px rgba(0,0,0,0.7)", pointerEvents: rot === 0 ? "auto" : "none" }}>{frente}</div>
      <div className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: u * 1.6, boxShadow: "0 10px 30px -12px rgba(0,0,0,0.7)", pointerEvents: rot === 0 ? "none" : "auto" }}>{verso}</div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[260] flex flex-col items-center justify-center overflow-hidden" style={{ background: "radial-gradient(120% 100% at 50% 0%, #17090d 0%, #0a0407 55%, #050203 100%)" }}>
      <style>{`
        @keyframes lc-sheen-anim { 0% { transform: translateX(-160%) skewX(-12deg); } 55%, 100% { transform: translateX(320%) skewX(-12deg); } }
        .lc-sheen { animation: lc-sheen-anim 3.6s ease-in-out infinite; }
      `}</style>

      <button
        onClick={onClose}
        className="fixed right-4 z-[262] rounded-lg p-2 text-amber-200/90"
        style={{ top: "max(1rem, env(safe-area-inset-top))", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)" }}
        aria-label="Fechar livro"
      >
        <X size={16} />
      </button>

      <div
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={(e) => setVista((v) => clampVista(v.s * Math.exp(-e.deltaY * 0.0015), v.x, v.y))}
      >
        <div style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.s})`, transition: vista.animar ? "transform 0.25s ease-out" : "none" }}>
          <div style={{ perspective: 2400 }}>
            <div
              className="relative"
              style={{ width: pageW * 2, height: pageH, transition: "transform 1s cubic-bezier(0.35, 0.05, 0.2, 1)", transform: `translateX(${shift}px)` }}
            >
              {/* folha 1: capa / textos · folha 2: moedas / contracapa */}
              {folha(passo >= 2 ? -180 : 0, passo >= 2 ? 5 : 3, <PaginaMoedas u={u} />, <Contracapa u={u} />)}
              {folha(passo >= 1 ? -180 : 0, passo === 0 ? 4 : 2, <Capa u={u} moeda25={moeda25} />, <PaginaTextos u={u} aoLer={setLeitor} />)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3" style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <button
          onClick={() => setPasso((p) => Math.max(0, p - 1))}
          disabled={passo === 0}
          className="rounded-lg p-2 text-amber-200/90 disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)" }}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-[11px] text-amber-200/60">
          {passo === 0 ? "Toque na seta para abrir o livrinho" : passo === 1 ? "toque: moeda vira · painel amplia — pinça dá zoom" : "contracapa — o verso das moedas pelos furos"}
        </p>
        <button
          onClick={() => setPasso((p) => Math.min(2, p + 1))}
          disabled={passo === 2}
          className="rounded-lg p-2 text-amber-200/90 disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)" }}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* leitor ampliado de um painel */}
      {leitor && (
        <div className="absolute inset-0 z-[263] flex items-center justify-center p-4" style={{ background: "rgba(4,2,3,0.82)", backdropFilter: "blur(4px)" }} onClick={() => setLeitor(null)}>
          <div
            className="max-h-[84vh] w-[min(92vw,440px)] overflow-y-auto rounded-2xl bg-[#fbfcfd] p-5"
            style={{ boxShadow: "0 24px 60px -20px rgba(0,0,0,0.9)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between rounded-lg px-3 py-2 text-white" style={{ background: "linear-gradient(90deg, #2e6da8, #58a0cf)" }}>
              <span className="text-sm font-bold uppercase leading-tight">{leitor.tituloEn}<br />{leitor.tituloFr}</span>
              {(() => {
                const m = moedaCA(leitor.re);
                return m?.fotoAnverso ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.fotos[0]?.anverso || m.fotoAnverso} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" draggable={false} />
                ) : null;
              })()}
            </div>
            <p className="mt-2 text-sm font-bold text-[#1d3a55]">{leitor.valor}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#2b3a47]">{leitor.en}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-[#40566b]">{leitor.fr}</p>
            <button onClick={() => setLeitor(null)} className="mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: "linear-gradient(90deg, #2e6da8, #58a0cf)" }}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
