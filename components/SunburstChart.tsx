"use client";

// Sunburst do Mapa da Carteira — reescrito (projeto 15/08, aprovado pelo dono):
//   • Hierarquia REAL: setor dentro do arco da classe, ativo dentro do setor
//     (antes eram 3 donuts independentes, cada anel fechando 360° sozinho).
//     Layout puro em lib/sunburst-layout.ts, com teste geométrico.
//   • Drill = zoom angular ANIMADO (rAF ~300ms): o arco clicado abre para
//     360° com os filhos acompanhando; voltar reverte.
//   • Toque: 1º tap seleciona (detalhe no centro), 2º tap ativa — no desktop
//     o clique age direto. Clique no ativo chama onSelectAsset (popup).
//   • Centro vivo: patrimônio total em repouso; na seleção/hover, valor +
//     % do total + % do pai. Migalhas viram "outros (N)" por setor.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compactBRL } from "@/lib/format";
import { layoutHierarquico, type ArcoAlvo, type NoSunburst } from "@/lib/sunburst-layout";

interface SunburstProps {
  level1: NoSunburst[];
  level2: NoSunburst[];
  level3: NoSunburst[];
  size?: number;
  onSelectClass?: (name: string | null) => void;
  onSelectSector?: (name: string | null) => void;
  onSelectAsset?: (name: string) => void;
  selectedClass?: string | null;
  selectedSector?: string | null;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number): string {
  const span = a2 - a1;
  if (span <= 0.05) return "";
  if (span >= 359.99) {
    const m = a1 + span / 2;
    return [arcPath(cx, cy, r1, r2, a1, m), arcPath(cx, cy, r1, r2, m, a2)].join(" ");
  }
  const p1 = polar(cx, cy, r2, a2);
  const p2 = polar(cx, cy, r2, a1);
  const p3 = polar(cx, cy, r1, a1);
  const p4 = polar(cx, cy, r1, a2);
  const lg = span > 180 ? 1 : 0;
  return `M${p1.x},${p1.y} A${r2},${r2},0,${lg},0,${p2.x},${p2.y} L${p3.x},${p3.y} A${r1},${r1},0,${lg},1,${p4.x},${p4.y}Z`;
}

interface ArcoVivo extends ArcoAlvo { a1v: number; a2v: number } // ângulos animados

const DURACAO_MS = 300;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export default function SunburstChart({
  level1, level2, level3, size = 560,
  onSelectClass, onSelectSector, onSelectAsset,
  selectedClass, selectedSector,
}: SunburstProps) {
  const [hovered, setHovered] = useState<ArcoAlvo | null>(null);
  const cx = size / 2, cy = size / 2, scale = size / 560;

  const R = useMemo(() => ({
    1: { inner: 70 * scale, outer: 125 * scale },
    2: { inner: 132 * scale, outer: 195 * scale },
    3: { inner: 202 * scale, outer: 260 * scale },
  } as Record<1 | 2 | 3, { inner: number; outer: number }>), [scale]);

  const alvo = useMemo(
    () => layoutHierarquico(level1, level2, level3, selectedClass ?? null, selectedSector ?? null),
    [level1, level2, level3, selectedClass, selectedSector],
  );

  // ── Animação: interpola os ângulos do layout anterior para o novo ──
  const anguloAtual = useRef(new Map<string, { a1: number; a2: number }>());
  const [vivos, setVivos] = useState<ArcoVivo[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const de = new Map(anguloAtual.current);
    const inicio = performance.now();
    cancelAnimationFrame(rafRef.current);

    const quadro = (agora: number) => {
      const t = Math.min((agora - inicio) / DURACAO_MS, 1);
      const k = easeInOut(t);
      const frame: ArcoVivo[] = alvo.map(a => {
        // arco novo nasce fechado no seu próprio meio (cresce dali)
        const origem = de.get(a.key) ?? { a1: (a.a1 + a.a2) / 2, a2: (a.a1 + a.a2) / 2 };
        return { ...a, a1v: origem.a1 + (a.a1 - origem.a1) * k, a2v: origem.a2 + (a.a2 - origem.a2) * k };
      });
      setVivos(frame);
      if (t < 1) rafRef.current = requestAnimationFrame(quadro);
      else anguloAtual.current = new Map(alvo.map(a => [a.key, { a1: a.a1, a2: a.a2 }]));
    };
    rafRef.current = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(rafRef.current);
  }, [alvo]);

  // ── Interação (toque = 1º tap seleciona, 2º ativa; clique age direto) ──
  const ativar = useCallback((arc: ArcoAlvo) => {
    if (arc.level === 1) {
      onSelectClass?.(selectedClass === arc.name ? null : arc.name);
      onSelectSector?.(null);
    } else if (arc.level === 2) {
      onSelectClass?.(arc.parentName ?? null);
      onSelectSector?.(selectedSector === arc.name ? null : arc.name);
    } else if (!arc.agregado) {
      onSelectAsset?.(arc.name);
    }
  }, [selectedClass, selectedSector, onSelectClass, onSelectSector, onSelectAsset]);

  const ultimoToque = useRef<string | null>(null);
  const aoClicar = useCallback((arc: ArcoAlvo, ev: React.MouseEvent) => {
    const isTouch = (ev.nativeEvent as PointerEvent).pointerType === "touch"
      || !window.matchMedia("(hover: hover)").matches;
    if (isTouch && ultimoToque.current !== arc.key) {
      ultimoToque.current = arc.key;
      setHovered(arc);
      return; // 1º toque só mostra no centro
    }
    ultimoToque.current = null;
    ativar(arc);
  }, [ativar]);

  const total = useMemo(() => level1.reduce((s, n) => s + n.value, 0), [level1]);
  const nAtivos = level3.length;

  function renderArc(arc: ArcoVivo) {
    const span = arc.a2v - arc.a1v;
    if (span <= 0.05) return null;
    let opacity = arc.level === 3 ? 0.78 : arc.level === 2 ? 0.92 : 1;
    if (hovered && hovered.key !== arc.key) {
      // esmaece quem não é família do arco sob o cursor
      const familia = hovered.name === arc.parentName || hovered.parentName === arc.name
        || hovered.key === arc.key || (hovered.level === 1 && arc.level === 3
          && level2.some(s2 => s2.parentName === hovered.name && s2.name === arc.parentName));
      if (!familia) opacity *= 0.45;
    }
    const isHovered = hovered?.key === arc.key;
    const raios = R[arc.level];
    const lift = isHovered ? 4 * scale : 0; // arco "levanta" no hover

    return (
      <path
        key={arc.key}
        d={arcPath(cx, cy, raios.inner, raios.outer + lift, arc.a1v, arc.a2v)}
        fill={arc.color}
        opacity={opacity}
        stroke={isHovered ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.55)"}
        strokeWidth={isHovered ? 2 : arc.level <= 2 ? 1.2 : 0.5}
        style={{ cursor: "pointer", transition: "opacity 0.25s" }}
        onClick={(ev) => aoClicar(arc, ev)}
        onMouseEnter={() => setHovered(arc)}
        onMouseLeave={() => setHovered(null)}
      />
    );
  }

  function renderLabel(arc: ArcoVivo) {
    const span = arc.a2v - arc.a1v;
    const midAngle = (arc.a1v + arc.a2v) / 2;
    const raios = R[arc.level];
    const midR = (raios.inner + raios.outer) / 2;
    const p = polar(cx, cy, midR, midAngle);

    if (arc.level === 1 && span > 14) {
      const abbrev = arc.name === "Renda Variável" ? "RV" : arc.name === "Renda Fixa" ? "RF" : arc.name;
      return (
        <g key={`l-${arc.key}`} style={{ pointerEvents: "none" }}>
          <text x={p.x} y={p.y - 7 * scale} textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.6)" fontSize={9 * scale} fontWeight={600}>{abbrev}</text>
          <text x={p.x} y={p.y + 9 * scale} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={14 * scale} fontWeight={800}>{arc.pct.toFixed(0)}%</text>
        </g>
      );
    }

    if (arc.level >= 2 && span > (arc.level === 2 ? 16 : 11)) {
      const radAngle = midAngle - 90;
      const flip = radAngle > 90 && radAngle < 270;
      const rotation = flip ? radAngle + 180 : radAngle;
      const nome = arc.name.length > 14 ? arc.name.slice(0, 12) + "…" : arc.name;
      const forte = arc.level === 2;
      return (
        <g key={`l-${arc.key}`} style={{ pointerEvents: "none" }}
          transform={`rotate(${rotation}, ${p.x}, ${p.y})`}>
          <text x={p.x} y={span > 24 ? p.y - 4 * scale : p.y} textAnchor="middle" dominantBaseline="middle"
            fill={forte ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.75)"}
            fontSize={(forte ? 8.5 : 8) * scale} fontWeight={600}>{nome}</text>
          {span > 24 && (
            <text x={p.x} y={p.y + 8 * scale} textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.45)" fontSize={7 * scale}>{arc.pct.toFixed(1)}%</text>
          )}
        </g>
      );
    }
    return null;
  }

  const centro = hovered ?? (selectedSector
    ? alvo.find(a => a.level === 2 && a.name === selectedSector) ?? null
    : selectedClass ? alvo.find(a => a.level === 1 && a.name === selectedClass) ?? null : null);

  return (
    <div className="relative">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-full h-auto">
        {vivos.filter(a => a.level === 3).map(renderArc)}
        {vivos.filter(a => a.level === 2).map(renderArc)}
        {vivos.filter(a => a.level === 1).map(renderArc)}
        {vivos.map(renderLabel)}
      </svg>

      {/* Centro vivo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center" style={{ maxWidth: 118 * scale }}>
          {centro ? (
            <>
              {centro.parentName && <p className="text-[9px] text-zinc-600 mb-0.5 truncate">{centro.parentName}</p>}
              <p className="text-xs font-bold text-zinc-200 leading-tight truncate">{centro.name}</p>
              <p className="text-[11px] font-mono font-bold text-zinc-300 mt-0.5">{compactBRL(centro.value)}</p>
              <p className="text-[9px] text-zinc-500 mt-0.5">
                {centro.pct.toFixed(1)}% do total{centro.level > 1 ? ` · ${centro.pctPai.toFixed(0)}% de ${centro.parentName === "Renda Variável" ? "RV" : centro.parentName === "Renda Fixa" ? "RF" : centro.parentName}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Patrimônio</p>
              <p className="text-sm font-mono font-extrabold text-zinc-200">{compactBRL(total)}</p>
              <p className="text-[9px] text-zinc-600 mt-0.5">{nAtivos} ativos</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
