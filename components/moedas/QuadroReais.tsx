"use client";

// Quadro do Plano Real — recriação VETORIAL (nítida em qualquer tela/DPR) da
// placa clássica de comemorativas: bandeira olímpica, caixa "50 anos da FAO",
// as 16 olímpicas/paralímpicas + mascotes, a coluna de comemorativas (Direitos
// Humanos, BC 50/40 anos, JK, Beija-Flor) e as duas famílias de circulação.
// Os berços são preenchidos com as fotos das moedas DA COLEÇÃO (casamento por
// KM#; o Beija-Flor — 25 anos do Plano Real, sem KM no CoinSnap — casa pelo
// assunto). Berço sem moeda na coleção fica VAZIO (recesso no veludo preto).
// Toque numa moeda VIRA anverso⇄reverso (flip 3D).

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { MOEDAS_COLECAO } from "@/lib/moedas-data";
import type { Moeda } from "@/lib/moedas";

interface BercoDef {
  rotulo?: string[];      // linhas da etiqueta (grafia idêntica à placa original)
  sub?: boolean;          // etiqueta menor, minúscula (caixa da FAO)
  mm: number;             // diâmetro relativo (proporção entre os berços)
  km?: string[];          // candidatos de KM# na ordem de preferência
  re?: RegExp;            // fallback: casamento pelo assunto
}

const normKm = (k: string) => (k || "").toUpperCase().replace(/\s+/g, "").replace("KM#", "");

function achar(def: BercoDef): Moeda | null {
  const br = MOEDAS_COLECAO.filter((m) => m.pais === "Brasil");
  for (const km of def.km ?? []) {
    const m = br.find((x) => normKm(x.krause) === km);
    if (m) return m;
  }
  if (def.re) return br.find((x) => def.re!.test(x.assunto)) ?? null;
  return null;
}

// ── O mapa da placa (linhas 1–4: 4 esportes + 1 comemorativa à direita) ──────

const TOPO: BercoDef[] = [
  { rotulo: ["BANDEIRA"], mm: 27, km: ["679"] },
  { rotulo: ["10 centavos"], sub: true, mm: 22, km: ["641"] },
  { rotulo: ["25 centavos"], sub: true, mm: 23, km: ["642"] },
  { rotulo: ["Direitos Humanos"], mm: 27, km: ["653"] },
];

const LINHAS: BercoDef[][] = [
  [
    { rotulo: ["NATAÇÃO"], mm: 27, km: ["688"] },
    { rotulo: ["ATLETISMO"], mm: 27, km: ["687"] },
    { rotulo: ["PARATRIATLO"], mm: 27, km: ["689"] },
    { rotulo: ["GOLF"], mm: 27, km: ["690"] },
    { rotulo: ["Banco Central", "50 anos"], mm: 27, km: ["723"] },
  ],
  [
    { rotulo: ["BASQUETE"], mm: 27, km: ["704"] },
    { rotulo: ["VELA"], mm: 27, km: ["705"] },
    { rotulo: ["PARACANOAGEM"], mm: 27, km: ["706"] },
    { rotulo: ["RUGBY"], mm: 27, km: ["707"] },
    { rotulo: ["Banco Central", "40 anos"], mm: 27, km: ["668"] },
  ],
  [
    { rotulo: ["FUTEBOL"], mm: 27, km: ["708"] },
    { rotulo: ["VOLEI"], mm: 27, km: ["709"] },
    { rotulo: ["ATLETISMO", "PARALÍMPICO"], mm: 27, km: ["710"] },
    { rotulo: ["JUDÔ"], mm: 27, km: ["711"] },
    { rotulo: ["Juscelino", "Kubitschek"], mm: 27, km: ["656"] },
  ],
  [
    { rotulo: ["BOXE"], mm: 27, km: ["724"] },
    { rotulo: ["NATAÇÃO", "PARALÍMPICA"], mm: 27, km: ["725"] },
    { rotulo: ["TOM"], mm: 27, km: ["727"] },
    { rotulo: ["VINÍCIUS"], mm: 27, km: ["726"] },
    { rotulo: ["Beija-Flor"], mm: 27, re: /25 anos do plano real/i },
  ],
];

// Famílias de circulação — diâmetros na proporção da placa (crescentes na 1ª;
// a 2ª segue os tamanhos reais, com o 10 e o 50 menores que os vizinhos).
const FAMILIA_1: BercoDef[] = [
  { mm: 17, km: ["631"] }, { mm: 20, km: ["632"] }, { mm: 21.5, km: ["633"] },
  { mm: 23.5, km: ["634"] }, { mm: 25.5, km: ["635"] }, { mm: 27, km: ["636"] },
];
const FAMILIA_2: BercoDef[] = [
  { mm: 17, km: ["647"] }, { mm: 22, km: ["648"] }, { mm: 20, km: ["649"] },
  { mm: 25, km: ["650"] }, { mm: 23, km: ["651A", "651"] }, { mm: 27, km: ["652", "652A"] },
];

// ── Um berço (recesso vazio ou moeda com flip 3D) ────────────────────────────

function Berco({ def, moeda, u }: { def: BercoDef; moeda: Moeda | null; u: number }) {
  const [verso, setVerso] = useState(false);
  const d = Math.round(def.mm * u);
  const anv = moeda?.fotos[0]?.anverso || moeda?.fotoAnverso || "";
  const rev = moeda?.fotos[0]?.reverso || moeda?.fotoReverso || "";
  const foto = (src: string, atras: boolean) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full rounded-full object-cover"
      style={{
        backfaceVisibility: "hidden",
        transform: atras ? "rotateY(180deg)" : undefined,
        boxShadow: "0 3px 10px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.16), inset 0 0 0 1px rgba(0,0,0,0.4)",
      }}
    />
  );
  return (
    <div className="flex flex-col items-center" style={{ gap: Math.max(4, u * 1.6) }}>
      <button
        onClick={() => moeda && setVerso((v) => !v)}
        disabled={!moeda}
        className="relative shrink-0"
        style={{ width: d, height: d, perspective: 600 }}
        aria-label={moeda ? `${moeda.denominacao} ${moeda.ano} — virar` : "Berço vazio"}
      >
        {moeda && anv ? (
          <div
            className="relative h-full w-full"
            style={{
              transformStyle: "preserve-3d",
              transition: "transform 0.55s cubic-bezier(0.2, 0.7, 0.3, 1)",
              transform: verso ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {foto(anv, false)}
            {rev && foto(rev, true)}
          </div>
        ) : (
          <div
            className="h-full w-full rounded-full"
            style={{
              background: "radial-gradient(circle at 50% 36%, #131316 0%, #08080a 68%, #050506 100%)",
              boxShadow: "inset 0 3px 9px rgba(0,0,0,0.95), inset 0 -1px 0 rgba(255,255,255,0.05), 0 1px 0 rgba(255,255,255,0.04)",
            }}
          />
        )}
      </button>
      {def.rotulo && (
        <div
          className="text-center"
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: def.sub ? Math.max(8, u * 3.1) : Math.max(9, u * 3.6),
            letterSpacing: def.sub ? "0.02em" : "0.06em",
            lineHeight: 1.3,
            color: "#f3efe6",
            textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          }}
        >
          {def.rotulo.map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

// ── O quadro completo (overlay fullscreen) ───────────────────────────────────

export default function QuadroReais({ onClose }: { onClose: () => void }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Casa cada berço com a coleção UMA vez (dado estático).
  const casadas = useMemo(() => {
    const mapa = new Map<BercoDef, Moeda | null>();
    for (const def of [...TOPO, ...LINHAS.flat(), ...FAMILIA_1, ...FAMILIA_2]) mapa.set(def, achar(def));
    return mapa;
  }, []);
  const preenchidos = [...casadas.values()].filter(Boolean).length;

  // Escala: a placa tem ~168 "mm de projeto" de largura útil.
  const u = w > 0 ? w / 168 : 2.2;
  const serif = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

  return createPortal(
    <div
      className="fixed inset-0 z-[260] overflow-y-auto"
      style={{ background: "radial-gradient(120% 100% at 50% 0%, #17090d 0%, #0a0407 55%, #050203 100%)" }}
    >
      <button
        onClick={onClose}
        className="fixed right-4 z-[261] rounded-lg p-2 text-amber-200/90"
        style={{ top: "max(1rem, env(safe-area-inset-top))", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)" }}
        aria-label="Fechar quadro"
      >
        <X size={16} />
      </button>

      <div className="mx-auto flex min-h-full w-full flex-col items-center justify-center gap-3 px-3 py-6" style={{ paddingTop: "max(3.4rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        {/* moldura preta lustrosa */}
        <div
          className="w-[min(94vw,540px)] shrink-0"
          style={{
            borderRadius: 16,
            padding: Math.max(8, u * 3),
            background: "linear-gradient(155deg, #46464c 0%, #101013 22%, #2c2c31 45%, #060608 68%, #232327 100%)",
            boxShadow: "0 30px 70px -25px rgba(0,0,0,0.95), 0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          <div
            ref={boardRef}
            style={{
              borderRadius: 8,
              background: "radial-gradient(130% 105% at 50% 0%, #0c0c0e 0%, #060607 60%, #040405 100%)",
              boxShadow: "inset 0 0 40px rgba(0,0,0,0.9), inset 0 0 2px rgba(255,255,255,0.12)",
              padding: `${Math.max(10, u * 4.5)}px ${Math.max(8, u * 3.5)}px`,
            }}
          >
            {/* linha do topo: bandeira · caixa FAO · direitos humanos */}
            <div className="grid items-start" style={{ gridTemplateColumns: "1fr 2fr 1.15fr", columnGap: u * 2 }}>
              <Berco def={TOPO[0]} moeda={casadas.get(TOPO[0]) ?? null} u={u} />
              <div
                className="relative mx-auto"
                style={{
                  border: "1px solid rgba(255,255,255,0.5)",
                  borderRadius: 6,
                  padding: `${u * 4.5}px ${u * 3}px ${u * 2}px`,
                  marginTop: u * 1.5,
                }}
              >
                <span
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-2"
                  style={{ ...serif, top: -u * 2.4, fontSize: Math.max(9, u * 3.4), color: "#f3efe6", background: "#060607", letterSpacing: "0.04em" }}
                >
                  50 anos da FAO
                </span>
                <div className="flex items-start justify-center" style={{ gap: u * 5 }}>
                  <Berco def={TOPO[1]} moeda={casadas.get(TOPO[1]) ?? null} u={u} />
                  <Berco def={TOPO[2]} moeda={casadas.get(TOPO[2]) ?? null} u={u} />
                </div>
              </div>
              <Berco def={TOPO[3]} moeda={casadas.get(TOPO[3]) ?? null} u={u} />
            </div>

            {/* 4 linhas de esportes + coluna de comemorativas */}
            {LINHAS.map((linha, i) => (
              <div key={i} className="grid items-start" style={{ gridTemplateColumns: "repeat(4, 1fr) 1.15fr", columnGap: u * 2, marginTop: u * 6 }}>
                {linha.map((def, j) => <Berco key={j} def={def} moeda={casadas.get(def) ?? null} u={u} />)}
              </div>
            ))}

            {/* famílias de circulação */}
            {[{ nome: "1ª Família", defs: FAMILIA_1 }, { nome: "2ª Família", defs: FAMILIA_2 }].map(({ nome, defs }) => (
              <div key={nome} className="flex items-center" style={{ marginTop: u * 6, gap: u * 3 }}>
                <span className="shrink-0 font-bold italic" style={{ ...serif, fontSize: Math.max(9, u * 3.6), color: "#f3efe6", width: u * 22, textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>
                  {nome}
                </span>
                <div className="flex flex-1 items-center justify-between" style={{ paddingRight: u * 2 }}>
                  {defs.map((def, j) => <Berco key={j} def={def} moeda={casadas.get(def) ?? null} u={u} />)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-amber-200/45">
          {preenchidos} de {casadas.size} berços preenchidos com moedas da sua coleção — toque numa moeda para virar
        </p>
      </div>
    </div>,
    document.body,
  );
}
