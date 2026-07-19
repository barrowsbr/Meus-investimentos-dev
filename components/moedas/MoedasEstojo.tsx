"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ESTOJO de moedas — a vitrine de colecionador de cada CONJUNTO monetário.
//
// • Prateleira: um estojo por conjunto (Réis, Cruzeiros, Real, estrangeiras…);
//   NÃO existe estojo "todas" (decisão do dono).
// • Vitrine FULLSCREEN (portal, pensada para tela DEITADA): veludo, moldura,
//   cada moeda no BERÇO em escala real, ordem cronológica.
// • Interações (modelo do dono, 17-19/07):
//   – 1 TOQUE  → a moeda VIRA (flip 3D com espessura de metal);
//   – 2 TOQUES → abre o CARD-RESUMO da moeda (link p/ o dossiê via ?m=<índice>);
//   – Botão GRAVIDADE é um INTERRUPTOR (decisão 19/07): ligar SOLTA todas as
//     moedas (caem com o acelerômetro; arrastar/carregar/encaixar liberados);
//     desligar RECOLOCA todas nos berços ORIGINAIS. Fora do modo gravidade as
//     moedas são fixas — só viram cara/coroa (e 2 toques abrem o resumo).
//   – No modo gravidade: arrastar carrega com mola; segurar ~1s sobre um berço
//     vazio em que caiba encaixa (anel de progresso).
// • v3 (18/07 — "outro nível", foco no mobile):
//   – MODO 1:1: as moedas no TAMANHO FÍSICO REAL na tela (px/mm calibrável
//     pela régua — encostar uma moeda de 1 real na tela; salvo por aparelho).
//     Com 1:1 ATIVO o zoom fica TRAVADO (pinça/roda desligadas — só pan);
//   – fora do 1:1, PINÇA dá zoom e arrastar o veludo navega;
//   – Luz 3D: brilho especular + bevel de borda que SEGUEM o acelerômetro
//     (o reflexo corre pelo metal ao inclinar o celular), sombras puxadas
//     pela gravidade e parallax de profundidade no veludo.
// ⚠️ matter-js: corpo criado isStatic:true explode em NaN ao ser liberado —
//   criar dinâmico e assentar com Body.setStatic(true) depois.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import Matter from "matter-js";
import { ArrowLeft, X, Smartphone, Ruler, Frame, BookOpen } from "lucide-react";
import { MOEDAS_COLECAO } from "@/lib/moedas-data";
import { diametroMmDe, conjuntoMonetario, gradTone, type Moeda } from "@/lib/moedas";
import QuadroReais from "./QuadroReais";
import LivroCanada from "./LivroCanada";

interface Spec { m: Moeda; fotoA: string; fotoR: string; mm: number }
interface Estojo { nome: string; periodo?: string; ordem: number; specs: Spec[]; valor: number }

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function montarEstojos(): Estojo[] {
  const map = new Map<string, Estojo>();
  for (const m of MOEDAS_COLECAO) {
    const c = conjuntoMonetario(m);
    const e = map.get(c.nome) ?? { nome: c.nome, periodo: c.periodo, ordem: c.ordem, specs: [], valor: 0 };
    const mm = diametroMmDe(m);
    for (const f of m.fotos) {
      const fotoA = f.anverso || f.reverso;
      if (fotoA) { e.specs.push({ m, fotoA, fotoR: f.reverso && f.anverso ? f.reverso : "", mm }); e.valor += m.valorBrl; }
    }
    map.set(c.nome, e);
  }
  return [...map.values()]
    .filter((e) => e.specs.length > 0)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    .map((e) => ({ ...e, specs: e.specs.sort((a, b) => (a.m.anoNum ?? 9999) - (b.m.anoNum ?? 9999) || b.mm - a.mm) }));
}

// px por mm FÍSICO da tela — heurística por classe de aparelho; o valor
// calibrado pela régua (localStorage) tem prioridade.
function pxPorMmFisico(): number {
  try {
    const salvo = Number(localStorage.getItem("moedas_pxmm"));
    if (salvo > 1.5 && salvo < 20) return salvo;
  } catch { /* sem storage */ }
  const menor = Math.min(screen.width, screen.height);
  if (menor <= 480) return menor / 68;  // celular: ~68 mm de largura útil
  if (menor <= 900) return menor / 150; // tablet
  return 3.9;                           // desktop ~96 dpi
}

function prerender(img: HTMLImageElement, raioPx: number, dpr: number, folga: number): HTMLCanvasElement {
  const d = Math.ceil(raioPx * 2 * dpr * folga); // folga cobre a ampliação no 1:1
  const c = document.createElement("canvas");
  c.width = d; c.height = d;
  const ctx = c.getContext("2d")!;
  ctx.save();
  ctx.beginPath();
  ctx.arc(d / 2, d / 2, d / 2 - dpr, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, 0, 0, d, d);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(d / 2, d / 2, d / 2 - dpr, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();
  return c;
}

const METAL_CLARO = /prata|aço|alum|níquel|niquel|inox|cupro/i;

// ── A vitrine fullscreen de UM estojo ─────────────────────────────────────────

function CaseView({ estojo, onClose }: { estojo: Estojo; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const recolherRef = useRef<() => void>(() => {});
  const soltarTodasRef = useRef<() => void>(() => {});
  const aplicarVistaRef = useRef<(fisico: boolean) => void>(() => {});
  const fisicoRef = useRef(false);
  const gravidadeRef = useRef(false);
  const pxmmRef = useRef(4);
  const [gravidade, setGravidade] = useState(false);
  const [sensor, setSensor] = useState<"inativo" | "ativo" | "negado">("inativo");
  const [segurando, setSegurando] = useState<Spec | null>(null);
  const [resumo, setResumo] = useState<Spec | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const [fisico, setFisico] = useState(false);
  const [pxmm, setPxmm] = useState(() => (typeof window === "undefined" ? 4 : pxPorMmFisico()));
  const [calibrando, setCalibrando] = useState(false);
  const [pxmmTmp, setPxmmTmp] = useState(4);
  const [quadro, setQuadro] = useState(false); // quadro do Plano Real (só no estojo "Real")
  const [livro, setLivro] = useState(false);   // livrinho RCM 2007 (só no estojo "Dólar canadense")

  const precisaPermissao = typeof window !== "undefined"
    && typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })?.requestPermission === "function";

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onR = () => { clearTimeout(t); t = setTimeout(() => setReinicio((v) => v + 1), 350); };
    window.addEventListener("resize", onR);
    return () => { clearTimeout(t); window.removeEventListener("resize", onR); };
  }, []);

  // Calibração nova → se o 1:1 estiver ativo, reaplica a escala na hora.
  useEffect(() => {
    pxmmRef.current = pxmm;
    if (fisicoRef.current) aplicarVistaRef.current(true);
  }, [pxmm]);

  useEffect(() => {
    const box = boxRef.current, canvas = canvasRef.current;
    if (!box || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = box.clientWidth;
    const H = box.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d")!;

    const specs = estojo.specs;

    // Sem área de observação — os berços usam o estojo INTEIRO (decisão 18/07).
    const areaW = W;
    const areaH = H;

    // ── Berços: linhas cronológicas que cabem na área ─────────────────────────
    const layout = (pxPorMm: number) => {
      const gap = 10, mLeft = 18, mTop = 22;
      const pos: Array<{ x: number; y: number; r: number }> = [];
      let x = mLeft, y = mTop, rowH = 0;
      for (const e of specs) {
        const r = (e.mm / 2) * pxPorMm + 3;
        if (x + r * 2 > areaW - mLeft) { x = mLeft; y += rowH + gap; rowH = 0; }
        pos.push({ x: x + r, y: y + r, r });
        x += r * 2 + gap;
        rowH = Math.max(rowH, r * 2);
      }
      return { pos, altura: y + rowH + mTop };
    };
    let pxPorMm = 3.4;
    let slots = layout(pxPorMm);
    for (let i = 0; i < 16 && slots.altura > areaH; i++) {
      pxPorMm *= Math.sqrt((areaH / slots.altura) * 0.97);
      slots = layout(pxPorMm);
    }
    const dy = Math.max(0, (areaH - slots.altura) / 2);
    slots.pos.forEach((p) => { p.y += dy; });

    // ── Vista (zoom/pan): screen = world·s + (x,y). 1:1 = escala física real ──
    const view = { s: 1, x: 0, y: 0 };
    let alvoVista: { s: number; x: number; y: number } | null = null;
    const clampVista = () => {
      view.s = Math.min(Math.max(view.s, 0.6), 14);
      const loX = Math.min(0, W - W * view.s), hiX = Math.max(0, W - W * view.s);
      view.x = Math.min(Math.max(view.x, loX), hiX);
      const loY = Math.min(0, H - H * view.s), hiY = Math.max(0, H - H * view.s);
      view.y = Math.min(Math.max(view.y, loY), hiY);
    };
    aplicarVistaRef.current = (fis: boolean) => {
      if (!fis) { alvoVista = { s: 1, x: 0, y: 0 }; return; }
      const s = Math.min(14, Math.max(0.6, pxmmRef.current / pxPorMm));
      // o centro da área de berços fica no centro da tela
      alvoVista = { s, x: W / 2 - (areaW / 2) * s, y: H / 2 - (areaH / 2) * s };
    };

    // ── Física ────────────────────────────────────────────────────────────────
    const { Engine, Bodies, Body, Composite, Sleeping, Query, Constraint } = Matter;
    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 1;
    const esp = 200;
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, H + esp / 2, W * 2, esp, { isStatic: true }),
      Bodies.rectangle(W / 2, -esp / 2, W * 2, esp, { isStatic: true }),
      Bodies.rectangle(-esp / 2, H / 2, esp, H * 2, { isStatic: true }),
      Bodies.rectangle(W + esp / 2, H / 2, esp, H * 2, { isStatic: true }),
    ]);

    const raio = (i: number) => (specs[i].mm / 2) * pxPorMm;
    // criar DINÂMICO e assentar depois — ver aviso no cabeçalho (NaN do matter)
    const corpos: Matter.Body[] = specs.map((_, i) => {
      const b = Bodies.circle(slots.pos[i].x, slots.pos[i].y, raio(i), {
        restitution: 0.2, friction: 0.35, frictionAir: 0.015, density: 0.0012,
      });
      Body.setStatic(b, true);
      return b;
    });
    const idxPorBody = new Map(corpos.map((b, i) => [b.id, i]));
    Composite.add(engine.world, corpos);

    // Ocupação dos berços (moeda pode encaixar em QUALQUER berço em que caiba).
    const slotDe: Array<number | null> = specs.map((_, i) => i);   // moeda → berço
    const ocupante: Array<number | null> = specs.map((_, i) => i); // berço → moeda
    let heldIdx: number | null = null;
    let mola: Matter.Constraint | null = null;
    let pendente: { i: number; x: number; y: number } | null = null; // down sem drag ainda
    let tapTimer: ReturnType<typeof setTimeout> | null = null;
    let ultimoTap = { i: -1, t: 0 };
    let encaixe: { slot: number; desde: number } | null = null;      // segurar p/ encaixar

    // Gestos de vista: pan no veludo vazio + pinça (zoom) com 2 dedos.
    const dedos = new Map<number, { x: number; y: number }>();
    let pan: { x: number; y: number; vx: number; vy: number } | null = null;
    let pinca: { d: number; s: number; wx: number; wy: number } | null = null;

    // Faces: 0 = anverso, 1 = reverso; flipStart > 0 = animando (300 ms).
    const face: Array<0 | 1> = specs.map(() => 0);
    const flipStart: number[] = specs.map(() => 0);

    // Sprites com folga que cobre a ampliação do 1:1 (ficam nítidos no zoom).
    const folgaSprite = Math.min(3.2, Math.max(1.3, (pxmmRef.current / pxPorMm) * 1.15));
    const spritesA: Array<HTMLCanvasElement | null> = specs.map(() => null);
    const spritesR: Array<HTMLCanvasElement | null> = specs.map(() => null);
    let vivas = true;
    specs.forEach((e, i) => {
      const a = new Image();
      a.onload = () => { if (vivas) spritesA[i] = prerender(a, raio(i), dpr, folgaSprite); };
      a.src = e.fotoA;
      if (e.fotoR) {
        const r = new Image();
        r.onload = () => { if (vivas) spritesR[i] = prerender(r, raio(i), dpr, folgaSprite); };
        r.src = e.fotoR;
      }
    });

    const vagarBerco = (i: number) => {
      const s = slotDe[i];
      if (s !== null) { ocupante[s] = null; slotDe[i] = null; }
    };
    const sentarEm = (i: number, s: number) => {
      Body.setStatic(corpos[i], true);
      Body.setPosition(corpos[i], { x: slots.pos[s].x, y: slots.pos[s].y });
      Body.setAngle(corpos[i], 0);
      Body.setVelocity(corpos[i], { x: 0, y: 0 });
      slotDe[i] = s; ocupante[s] = i;
    };
    const cabe = (i: number, s: number) => raio(i) <= slots.pos[s].r + 1.5;

    const flipar = (i: number) => {
      if (!specs[i].fotoR) return; // sem foto do reverso — nada a virar
      face[i] = face[i] === 0 ? 1 : 0;
      flipStart[i] = performance.now();
    };

    recolherRef.current = () => {
      for (let s = 0; s < ocupante.length; s++) ocupante[s] = null;
      for (let i = 0; i < corpos.length; i++) { slotDe[i] = null; sentarEm(i, i); }
    };
    // Interruptor de gravidade LIGADO: todas as moedas se soltam e caem.
    soltarTodasRef.current = () => {
      for (let i = 0; i < corpos.length; i++) {
        vagarBerco(i);
        Body.setStatic(corpos[i], false);
        Sleeping.set(corpos[i], false);
      }
    };
    // Rebuild (resize) com a gravidade ligada: volta soltas, como estavam.
    if (gravidadeRef.current) setTimeout(() => soltarTodasRef.current(), 60);

    const paraMundo = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s };
    };
    const acharCorpo = (p: { x: number; y: number }): number | null => {
      const hit = Query.point(corpos, p)[0];
      return hit ? (idxPorBody.get(hit.id) ?? null) : null;
    };

    const erguer = (i: number, p: { x: number; y: number }) => {
      vagarBerco(i);
      Body.setStatic(corpos[i], false);
      Sleeping.set(corpos[i], false);
      heldIdx = i;
      encaixe = null;
      setSegurando(specs[i]);
      mola = Constraint.create({ pointA: p, bodyB: corpos[i], pointB: { x: 0, y: 0 }, length: 0, stiffness: 0.2, damping: 0.12 });
      Composite.add(engine.world, mola);
    };

    const onDown = (ev: PointerEvent) => {
      dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      alvoVista = null;
      // Com 1:1 ATIVO o zoom fica travado na escala física — pinça desligada.
      if (dedos.size === 2 && heldIdx === null && !fisicoRef.current) {
        // pinça: zoom ancorado no ponto médio dos dedos
        pendente = null; pan = null;
        if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
        const [p1, p2] = [...dedos.values()];
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
        const w = paraMundo(cx, cy);
        pinca = { d: Math.hypot(p2.x - p1.x, p2.y - p1.y), s: view.s, wx: w.x, wy: w.y };
        return;
      }
      if (pinca) return;
      const p = paraMundo(ev.clientX, ev.clientY);
      const i = acharCorpo(p);
      if (i !== null) { pendente = { i, x: ev.clientX, y: ev.clientY }; return; }
      // veludo vazio: arrasta a vista (útil no 1:1)
      pan = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
    };
    const onMove = (ev: PointerEvent) => {
      if (dedos.has(ev.pointerId)) dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinca && dedos.size >= 2 && heldIdx === null) {
        const [p1, p2] = [...dedos.values()];
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
        const rect = canvas.getBoundingClientRect();
        view.s = Math.min(14, Math.max(0.6, pinca.s * (d / pinca.d)));
        view.x = cx - rect.left - pinca.wx * view.s;
        view.y = cy - rect.top - pinca.wy * view.s;
        clampVista();
        return;
      }
      if (pan) {
        view.x = pan.vx + (ev.clientX - pan.x);
        view.y = pan.vy + (ev.clientY - pan.y);
        clampVista();
        return;
      }
      if (pendente && Math.hypot(ev.clientX - pendente.x, ev.clientY - pendente.y) > 8) {
        const i = pendente.i;
        pendente = null;
        // Fora do modo gravidade a moeda é FIXA — arrastar não a ergue.
        if (gravidadeRef.current) erguer(i, paraMundo(ev.clientX, ev.clientY));
      }
      if (mola) mola.pointA = paraMundo(ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      dedos.delete(ev.pointerId);
      if (dedos.size < 2) pinca = null;
      if (dedos.size === 0) pan = null;
      if (mola) { Composite.remove(engine.world, mola); mola = null; }
      if (heldIdx !== null) { heldIdx = null; encaixe = null; setSegurando(null); return; }
      if (!pendente) return;
      // TAP: 1 toque vira; 2 toques (≤350 ms) vão para a observação.
      const i = pendente.i;
      pendente = null;
      const agora = performance.now();
      if (ultimoTap.i === i && agora - ultimoTap.t < 350) {
        if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
        ultimoTap = { i: -1, t: 0 };
        setResumo(specs[i]); // card-resumo com link para o dossiê da coleção
      } else {
        ultimoTap = { i, t: agora };
        if (tapTimer) clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { if (vivas) flipar(i); tapTimer = null; }, 300);
      }
    };
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      if (fisicoRef.current) return; // 1:1 ativo = zoom travado
      alvoVista = null;
      const rect = canvas.getBoundingClientRect();
      const w = paraMundo(ev.clientX, ev.clientY);
      view.s = Math.min(14, Math.max(0.6, view.s * (ev.deltaY < 0 ? 1.1 : 1 / 1.1)));
      view.x = ev.clientX - rect.left - w.x * view.s;
      view.y = ev.clientY - rect.top - w.y * view.s;
      clampVista();
    };
    box.addEventListener("pointerdown", onDown);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerup", onUp);
    box.addEventListener("pointercancel", onUp);
    box.addEventListener("wheel", onWheel, { passive: false });

    // Acelerômetro → gravidade (eixos ajustados para tela deitada).
    const ios = precisaPermissao || /iPhone|iPad/.test(navigator.userAgent);
    let gAnt = { x: 0, y: 1 };
    const onMotion = (ev: DeviceMotionEvent) => {
      const a = ev.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null) return;
      const horizontal = window.innerWidth > window.innerHeight;
      const ax = ios ? a.x : -a.x, ay = ios ? -a.y : a.y;
      const or = (screen.orientation?.angle ?? 0);
      let gx = ax, gy = ay;
      if (horizontal && (or === 90 || or === -90 || or === 270)) {
        const s = or === 90 ? 1 : -1;
        gx = ay * s; gy = -ax * s;
      }
      const mag = Math.hypot(gx, gy) || 1;
      const lim = Math.min(mag / 9.81, 1.4) / mag;
      engine.gravity.x = gx * lim;
      engine.gravity.y = gy * lim;
      if (Math.hypot(engine.gravity.x - gAnt.x, engine.gravity.y - gAnt.y) > 0.05) {
        gAnt = { x: engine.gravity.x, y: engine.gravity.y };
        corpos.forEach((b, i) => { if (slotDe[i] === null) Sleeping.set(b, false); });
      }
    };
    window.addEventListener("devicemotion", onMotion);

    // Se o 1:1 estava ativo (rebuild por resize), volta animando para lá.
    aplicarVistaRef.current(fisicoRef.current);

    // ── Desenho ───────────────────────────────────────────────────────────────
    let raf = 0;
    let antes = performance.now();
    const desenhar = (agora: number) => {
      const dt = Math.min(agora - antes, 33);
      antes = agora;
      Matter.Engine.update(engine, dt);

      // vista animada (1:1 ⇄ ajustar)
      if (alvoVista) {
        view.s += (alvoVista.s - view.s) * 0.16;
        view.x += (alvoVista.x - view.x) * 0.16;
        view.y += (alvoVista.y - view.y) * 0.16;
        if (Math.abs(view.s - alvoVista.s) < 0.004 && Math.abs(view.x - alvoVista.x) < 0.5 && Math.abs(view.y - alvoVista.y) < 0.5) {
          view.s = alvoVista.s; view.x = alvoVista.x; view.y = alvoVista.y;
          alvoVista = null;
        }
      }

      // parallax de profundidade do veludo (segue a inclinação; em repouso = 0)
      if (parallaxRef.current) {
        const dx = -engine.gravity.x * 10;
        const dyp = -(engine.gravity.y - 1) * 10;
        parallaxRef.current.style.transform = `translate3d(${dx.toFixed(1)}px, ${dyp.toFixed(1)}px, 0)`;
      }

      // Segurar ~1s sobre um berço vazio em que a moeda caiba → encaixa lá.
      if (heldIdx !== null) {
        const i = heldIdx;
        const b = corpos[i];
        let alvo: number | null = null;
        for (let s = 0; s < slots.pos.length; s++) {
          if (ocupante[s] !== null || !cabe(i, s)) continue;
          if (Math.hypot(b.position.x - slots.pos[s].x, b.position.y - slots.pos[s].y) < slots.pos[s].r * 0.75) { alvo = s; break; }
        }
        if (alvo === null) encaixe = null;
        else if (!encaixe || encaixe.slot !== alvo) encaixe = { slot: alvo, desde: agora };
        else if (agora - encaixe.desde >= 1000) {
          if (mola) { Composite.remove(engine.world, mola); mola = null; }
          sentarEm(i, alvo);
          heldIdx = null; encaixe = null;
          setSegurando(null);
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.x, dpr * view.y);

      // direção da luz (oposta à gravidade — a "janela" fica sempre para cima)
      const lm = Math.hypot(engine.gravity.x, engine.gravity.y) || 1;
      const lx = -engine.gravity.x / lm, ly = -engine.gravity.y / lm;

      // berços (recessos com sombra interna deslocada pela luz) + anel de encaixe
      for (let s = 0; s < slots.pos.length; s++) {
        const sp = slots.pos[s];
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r + 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.34)";
        ctx.fill();
        const rec = ctx.createLinearGradient(sp.x - lx * sp.r, sp.y - ly * sp.r, sp.x + lx * sp.r, sp.y + ly * sp.r);
        rec.addColorStop(0, "rgba(255,255,255,0.10)");
        rec.addColorStop(0.5, "rgba(255,255,255,0.02)");
        rec.addColorStop(1, "rgba(0,0,0,0.30)");
        ctx.strokeStyle = rec;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.lineWidth = 1;
        if (encaixe && encaixe.slot === s) {
          const frac = Math.min(1, (agora - encaixe.desde) / 1000);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.r + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          ctx.strokeStyle = "rgba(52,211,153,0.9)";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }

      // moedas — flip 3D com espessura + iluminação especular seguindo o sensor
      for (let i = 0; i < corpos.length; i++) {
        const b = corpos[i];
        const r = raio(i) * (i === heldIdx ? 1.12 : 1);
        let sx = 1;
        let mostraFace = face[i];
        if (flipStart[i] > 0) {
          const t = (agora - flipStart[i]) / 300;
          if (t >= 1) flipStart[i] = 0;
          else {
            sx = Math.abs(Math.cos(t * Math.PI));
            if (t < 0.5) mostraFace = face[i] === 0 ? 1 : 0; // 1ª metade: face antiga
          }
        }
        const sp = mostraFace === 1 && spritesR[i] ? spritesR[i] : spritesA[i];
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        if (i === heldIdx) {
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 16;
          ctx.shadowOffsetX = engine.gravity.x * 9;
          ctx.shadowOffsetY = Math.max(4, engine.gravity.y * 9);
        }
        // canto/espessura do metal aparecendo no meio do flip
        if (sx < 0.985) {
          const espw = r * 0.16 * Math.sqrt(1 - sx * sx);
          const claro = METAL_CLARO.test(`${specs[i].m.metal} ${specs[i].m.composicao}`);
          const eg = ctx.createLinearGradient(0, -r, 0, r);
          if (claro) { eg.addColorStop(0, "#e8e9ec"); eg.addColorStop(0.5, "#8f9196"); eg.addColorStop(1, "#54565c"); }
          else { eg.addColorStop(0, "#eacd8f"); eg.addColorStop(0.5, "#a97e3c"); eg.addColorStop(1, "#5c421a"); }
          ctx.beginPath();
          ctx.ellipse(0, 0, Math.max(0.6, sx * r) + espw, r, 0, 0, Math.PI * 2);
          ctx.fillStyle = eg;
          ctx.fill();
        }
        ctx.scale(Math.max(0.04, sx), 1);
        if (sp) ctx.drawImage(sp, -r, -r, r * 2, r * 2);
        else {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(232,163,61,0.25)";
          ctx.fill();
          ctx.strokeStyle = "rgba(232,163,61,0.5)";
          ctx.stroke();
        }
        ctx.restore();

        // luz especular + bevel (fora do flip; em coordenadas do MUNDO — a luz
        // não gira com a moeda, então o reflexo "corre" ao inclinar o celular)
        if (sx >= 0.985 && sp) {
          ctx.save();
          ctx.translate(b.position.x, b.position.y);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.globalCompositeOperation = "overlay";
          const gl = ctx.createRadialGradient(lx * r * 0.5, ly * r * 0.5, r * 0.05, 0, 0, r * 1.3);
          gl.addColorStop(0, "rgba(255,255,255,0.50)");
          gl.addColorStop(0.42, "rgba(255,255,255,0.10)");
          gl.addColorStop(1, "rgba(0,0,0,0.28)");
          ctx.fillStyle = gl;
          ctx.fillRect(-r, -r, r * 2, r * 2);
          ctx.globalCompositeOperation = "source-over";
          const bv = ctx.createLinearGradient(lx * r, ly * r, -lx * r, -ly * r);
          bv.addColorStop(0, "rgba(255,255,255,0.34)");
          bv.addColorStop(0.5, "rgba(255,255,255,0)");
          bv.addColorStop(1, "rgba(0,0,0,0.42)");
          ctx.strokeStyle = bv;
          ctx.lineWidth = Math.max(1.2, r * 0.055);
          ctx.beginPath();
          ctx.arc(0, 0, r - Math.max(0.6, r * 0.03), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(desenhar);
    };
    raf = requestAnimationFrame(desenhar);

    return () => {
      vivas = false;
      cancelAnimationFrame(raf);
      if (tapTimer) clearTimeout(tapTimer);
      window.removeEventListener("devicemotion", onMotion);
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointercancel", onUp);
      box.removeEventListener("wheel", onWheel);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estojo, reinicio]);

  const ativarSensor = async () => {
    try {
      if (precisaPermissao) {
        const r = await (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        setSensor(r === "granted" ? "ativo" : "negado");
      } else setSensor("ativo");
    } catch { setSensor("negado"); }
  };

  const toggleFisico = () => {
    const nv = !fisico;
    setFisico(nv);
    fisicoRef.current = nv;
    aplicarVistaRef.current(nv);
  };
  // Interruptor: LIGA = pede o sensor (iOS) e solta TODAS as moedas;
  // DESLIGA = recoloca todas nos berços originais.
  const toggleGravidade = async () => {
    if (!gravidade) {
      await ativarSensor(); // negado? tudo bem — cai com a gravidade padrão (para baixo)
      soltarTodasRef.current();
      gravidadeRef.current = true;
      setGravidade(true);
    } else {
      recolherRef.current();
      gravidadeRef.current = false;
      setGravidade(false);
    }
  };
  const salvarCalibracao = () => {
    try { localStorage.setItem("moedas_pxmm", String(pxmmTmp)); } catch { /* sem storage */ }
    setPxmm(pxmmTmp);
    setCalibrando(false);
    if (!fisico) toggleFisico(); // calibrou → já mostra em 1:1
  };

  return createPortal(
    <div className="fixed inset-0 z-[230] flex flex-col overflow-hidden" style={{ background: "radial-gradient(120% 100% at 50% 0%, #241016 0%, #150a10 45%, #0b0509 100%)", touchAction: "none" }}>
      {/* camada de parallax: brilho do veludo que desliza com a inclinação */}
      <div ref={parallaxRef} className="pointer-events-none absolute -inset-8" style={{ background: "radial-gradient(55% 45% at 50% 26%, rgba(240,184,96,0.07), transparent 70%), radial-gradient(40% 34% at 22% 78%, rgba(240,184,96,0.04), transparent 70%)", willChange: "transform" }} />
      <div className="pointer-events-none absolute inset-0" style={{ border: "10px solid transparent", borderImage: "linear-gradient(140deg, #3a2413, #6b4a24 30%, #2a1a0d 60%, #57391b) 1", boxShadow: "inset 0 0 60px rgba(0,0,0,0.75), inset 0 0 6px rgba(240,184,96,0.25)" }} />

      <div className="relative z-10 flex items-center justify-between gap-2 px-5 pt-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold uppercase tracking-[0.25em] text-amber-300/90" style={{ textShadow: "0 1px 0 rgba(0,0,0,0.8), 0 0 14px rgba(240,184,96,0.35)" }}>
            {estojo.nome}
          </p>
          <p className="text-[10px] tracking-wider text-amber-200/40">{estojo.periodo ?? ""} · {estojo.specs.length} moeda{estojo.specs.length !== 1 ? "s" : ""} · {fmtBRL(estojo.valor)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {estojo.nome === "Real" && (
            <button
              onClick={() => setQuadro(true)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fcd9a0" }}
              title="Quadro do Plano Real — comemorativas e famílias, preenchido com as moedas da sua coleção"
              aria-label="Abrir quadro do Plano Real"
            >
              <Frame size={12} /> Quadro
            </button>
          )}
          {estojo.nome === "Dólar canadense" && (
            <button
              onClick={() => setLivro(true)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fcd9a0" }}
              title="Livrinho RCM 2007 — o Commemorative Coin Set recriado como novo, com as suas moedas"
              aria-label="Abrir livrinho do set canadense de 2007"
            >
              <BookOpen size={12} /> Livro
            </button>
          )}
          <button
            onClick={toggleGravidade}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold"
            style={gravidade
              ? { background: "rgba(52,211,153,0.18)", border: "1px solid rgba(52,211,153,0.55)", color: "#34d399" }
              : { background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}
            title={gravidade
              ? "Desligar: todas voltam aos berços originais"
              : sensor === "negado" ? "Sensor negado — as moedas caem para baixo mesmo assim" : "Ligar: todas as moedas se soltam e caem"}
            aria-label="Alternar modo gravidade"
          >
            <Smartphone size={12} /> {gravidade ? "Gravidade ON" : "Gravidade"}
          </button>
          <button
            onClick={toggleFisico}
            className="rounded-lg px-2.5 py-2 font-mono text-[11px] font-bold"
            style={fisico
              ? { background: "rgba(52,211,153,0.18)", border: "1px solid rgba(52,211,153,0.55)", color: "#34d399" }
              : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fcd9a0" }}
            title={fisico ? "Voltar a ajustar na tela" : "Tamanho físico real (1:1)"}
            aria-label="Alternar tamanho real 1:1"
          >
            1:1
          </button>
          <button onClick={() => { setPxmmTmp(pxmm); setCalibrando(true); }} className="rounded-lg p-2 text-amber-200/80" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }} aria-label="Calibrar tamanho real" title="Calibrar tamanho real (régua)">
            <Ruler size={14} />
          </button>
          <button onClick={onClose} className="rounded-lg p-2 text-amber-200/90" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }} aria-label="Fechar estojo">
            <X size={16} />
          </button>
        </div>
      </div>

      <div ref={boxRef} className="relative z-0 min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      {segurando && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-1.5 text-[11px] font-semibold text-amber-100" style={{ background: "rgba(20,10,14,0.85)", border: "1px solid rgba(240,184,96,0.35)", marginBottom: "env(safe-area-inset-bottom)" }}>
          {segurando.m.denominacao} · {segurando.m.ano} · Ø {segurando.mm.toLocaleString("pt-BR")} mm — segure sobre um berço vazio para encaixar
        </div>
      )}

      {resumo && (() => {
        const g = gradTone(resumo.m.graduacao);
        const idx = MOEDAS_COLECAO.indexOf(resumo.m);
        return (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(6,3,5,0.78)", backdropFilter: "blur(4px)" }} onClick={() => setResumo(null)}>
            <div
              className="w-[min(92vw,380px)] rounded-2xl p-4"
              style={{ background: "radial-gradient(120% 100% at 50% 0%, #241016 0%, #140a10 70%)", border: "1px solid rgba(240,184,96,0.4)", boxShadow: "0 24px 60px -20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.07)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resumo.fotoA} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" style={{ boxShadow: "0 6px 18px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.18)" }} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-amber-100">{resumo.m.denominacao} · {resumo.m.ano || "—"}</p>
                  <p className="truncate text-[11px] text-amber-200/50">{resumo.m.pais}{resumo.m.krause ? ` · ${resumo.m.krause}` : ""}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="font-mono font-bold text-emerald-400">{fmtBRL(resumo.m.valorBrl)}</span>
                    {resumo.m.graduacao && <span className="rounded px-1.5 py-0.5 font-mono font-bold" style={{ background: g.bg, border: `1px solid ${g.border}`, color: g.color }}>{resumo.m.graduacao}</span>}
                    <span className="text-amber-200/60">Ø {resumo.mm.toLocaleString("pt-BR")} mm</span>
                  </div>
                </div>
              </div>
              {(resumo.m.composicao || resumo.m.assunto) && (
                <p className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-amber-200/55">
                  {[resumo.m.assunto, resumo.m.composicao].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Link
                  href={idx >= 0 ? `/moedas?m=${idx}` : "/moedas"}
                  className="flex-1 rounded-xl px-3 py-2.5 text-center text-xs font-bold text-black"
                  style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
                >
                  Ver card completo na coleção
                </Link>
                <button onClick={() => setResumo(null)} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-zinc-300" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {calibrando && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 px-6" style={{ background: "rgba(8,4,6,0.94)" }}>
          <p className="max-w-sm text-center text-xs leading-relaxed text-amber-100/90">
            <span className="font-bold text-amber-300">Calibrar tamanho real:</span> encoste uma moeda de{" "}
            <span className="font-bold">1 real</span> na tela e arraste até o círculo cobrir exatamente a moeda.
          </p>
          <div
            className="rounded-full"
            style={{
              width: pxmmTmp * 27, height: pxmmTmp * 27,
              background: "radial-gradient(circle at 38% 32%, rgba(240,184,96,0.35), rgba(240,184,96,0.10) 60%, rgba(240,184,96,0.05))",
              border: "2px dashed rgba(240,184,96,0.8)",
              boxShadow: "0 0 30px rgba(240,184,96,0.25)",
            }}
          />
          <p className="font-mono text-[11px] text-amber-200/60">Ø 27 mm · {pxmmTmp.toFixed(2)} px/mm</p>
          <input
            type="range" min={3} max={9} step={0.02} value={pxmmTmp}
            onChange={(e) => setPxmmTmp(Number(e.target.value))}
            className="w-[min(80vw,340px)] accent-amber-400"
          />
          <div className="flex gap-2">
            <button onClick={salvarCalibracao} className="rounded-xl px-5 py-2.5 text-sm font-bold text-black" style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}>
              Salvar e ver em 1:1
            </button>
            <button onClick={() => setCalibrando(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-300" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {quadro && <QuadroReais onClose={() => setQuadro(false)} />}
      {livro && <LivroCanada onClose={() => setLivro(false)} />}
    </div>,
    document.body,
  );
}

// ── Página: a prateleira de estojos ──────────────────────────────────────────

export default function MoedasEstojo() {
  const estojos = useMemo(montarEstojos, []);
  const [aberto, setAberto] = useState<Estojo | null>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
          <Link href="/moedas" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10" aria-label="Voltar para a coleção"><ArrowLeft size={16} /></Link>
          Estojos da coleção
        </h1>
        <p className="text-xs text-zinc-500">Um estojo por conjunto monetário — abra, pegue as moedas, veja em tamanho real (1:1) e compare (tela deitada recomendada)</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {estojos.map((e) => (
          <button
            key={e.nome}
            onClick={() => setAberto(e)}
            className="group relative overflow-hidden rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(150deg, #2a1710 0%, #1b0e12 55%, #120a0e 100%)",
              border: "1px solid rgba(240,184,96,0.28)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 30px -18px rgba(0,0,0,0.8)",
            }}
          >
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "radial-gradient(80% 60% at 50% 0%, rgba(240,184,96,0.10), transparent 70%)" }} />
            <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-amber-300/90" style={{ textShadow: "0 1px 0 rgba(0,0,0,0.8)" }}>{e.nome}</p>
            <p className="mt-0.5 text-[10px] text-amber-200/40">{e.periodo ?? "—"} · {e.specs.length} moeda{e.specs.length !== 1 ? "s" : ""} · {fmtBRL(e.valor)}</p>
            <div className="mt-3 flex items-center gap-2">
              {e.specs.slice(0, 6).map((s, i) => (
                <img
                  key={i}
                  src={s.fotoA}
                  alt=""
                  loading="lazy"
                  className="rounded-full object-cover"
                  style={{ width: 34 + Math.min(10, s.mm - 17), height: 34 + Math.min(10, s.mm - 17), boxShadow: "0 3px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.14)" }}
                />
              ))}
              {e.specs.length > 6 && <span className="text-[10px] text-amber-200/50">+{e.specs.length - 6}</span>}
            </div>
          </button>
        ))}
      </div>

      <p className="text-[10px] text-zinc-600">
        Dentro do estojo: 1 toque VIRA a moeda (flip 3D) · 2 toques abrem o card-resumo (com atalho para o
        dossiê na coleção) · botão GRAVIDADE solta todas as moedas de uma vez (aí dá para arrastar, carregar e
        segurar ~1s num berço vazio para encaixar; desligando, todas voltam ao lugar original) · botão 1:1
        mostra as moedas no TAMANHO FÍSICO real (zoom travado; arrastar o veludo navega; calibre com a régua
        usando uma moeda de 1 real).
      </p>

      {montado && aberto && <CaseView estojo={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}
