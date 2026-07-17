"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ESTOJO de moedas — a vitrine de colecionador de cada CONJUNTO monetário.
//
// • Prateleira: um estojo por conjunto (Réis, Cruzeiros, Real, estrangeiras…),
//   capa de "couro" com moedas reais espiando. NÃO existe estojo "todas" —
//   estojo é do conjunto (decisão do dono).
// • Abrir = vitrine FULLSCREEN (portal sobre o app, pensada para tela DEITADA;
//   em pé aparece dica de girar). Fundo de veludo, cada moeda no seu BERÇO
//   (recesso circular no diâmetro real em escala, ordem cronológica).
// • Física (matter-js): segurar TIRA a moeda do berço (mola no dedo); soltar
//   perto do berço reencaixa; soltar longe, ela CAI com a gravidade — que segue
//   o acelerômetro (mesmo padrão do Pote, iOS pede permissão). Moeda solta que
//   passa devagar perto do próprio berço é "imantada" de volta.
// • BANDEJA DE COMPARAÇÃO: arraste até 2 moedas para os círculos da bandeja —
//   elas são exibidas AMPLIADAS com o MESMO zoom (a proporção real entre elas
//   se mantém) e um painel compara denominação, ano, Ø, graduação e valor.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import Matter from "matter-js";
import { ArrowLeft, X, Smartphone, RotateCcw, Scale } from "lucide-react";
import { MOEDAS_COLECAO } from "@/lib/moedas-data";
import { diametroMmDe, conjuntoMonetario, gradTone, type Moeda } from "@/lib/moedas";

interface Spec { m: Moeda; foto: string; mm: number }
interface Estojo { nome: string; periodo?: string; ordem: number; specs: Spec[]; valor: number }

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function montarEstojos(): Estojo[] {
  const map = new Map<string, Estojo>();
  for (const m of MOEDAS_COLECAO) {
    const c = conjuntoMonetario(m);
    const e = map.get(c.nome) ?? { nome: c.nome, periodo: c.periodo, ordem: c.ordem, specs: [], valor: 0 };
    const mm = diametroMmDe(m);
    for (const f of m.fotos) {
      const foto = f.anverso || f.reverso;
      if (foto) { e.specs.push({ m, foto, mm }); e.valor += m.valorBrl; }
    }
    map.set(c.nome, e);
  }
  return [...map.values()]
    .filter((e) => e.specs.length > 0)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    .map((e) => ({ ...e, specs: e.specs.sort((a, b) => (a.m.anoNum ?? 9999) - (b.m.anoNum ?? 9999) || b.mm - a.mm) }));
}

function prerender(img: HTMLImageElement, raioPx: number, dpr: number): HTMLCanvasElement {
  const d = Math.ceil(raioPx * 2 * dpr * 1.6); // folga p/ ampliação na bandeja
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

// ── A vitrine fullscreen de UM estojo ─────────────────────────────────────────

function CaseView({ estojo, onClose }: { estojo: Estojo; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recolherRef = useRef<() => void>(() => {});
  const [sensor, setSensor] = useState<"inativo" | "ativo" | "negado">("inativo");
  const [segurando, setSegurando] = useState<Spec | null>(null);
  const [bandeja, setBandeja] = useState<Spec[]>([]);
  const [retrato, setRetrato] = useState(false);
  const [reinicio, setReinicio] = useState(0);

  const precisaPermissao = typeof window !== "undefined"
    && typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })?.requestPermission === "function";

  useEffect(() => {
    const check = () => setRetrato(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Rebuild ao girar/redimensionar (layout dos berços depende do formato).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onR = () => { clearTimeout(t); t = setTimeout(() => setReinicio((v) => v + 1), 350); };
    window.addEventListener("resize", onR);
    return () => { clearTimeout(t); window.removeEventListener("resize", onR); };
  }, []);

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
    const paisagem = W >= H;

    // ── Bandeja de comparação: coluna à direita (deitado) ou faixa no rodapé ──
    const trayW = paisagem ? Math.max(170, Math.min(W * 0.26, 250)) : W;
    const trayH = paisagem ? H : Math.max(150, Math.min(H * 0.26, 220));
    const areaW = paisagem ? W - trayW : W;
    const areaH = paisagem ? H : H - trayH;
    const trayR = paisagem
      ? Math.min(trayW * 0.36, H * 0.2)
      : Math.min(trayH * 0.38, W * 0.2);
    const traySlots: Array<{ x: number; y: number }> = paisagem
      ? [{ x: areaW + trayW / 2, y: H * 0.3 }, { x: areaW + trayW / 2, y: H * 0.72 }]
      : [{ x: W * 0.28, y: areaH + trayH / 2 }, { x: W * 0.72, y: areaH + trayH / 2 }];
    const dentroDaBandeja = (x: number, y: number) => (paisagem ? x > areaW : y > areaH);

    // ── Layout dos berços: linhas cronológicas que cabem na área ──────────────
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
    // centraliza verticalmente
    const dy = Math.max(0, (areaH - slots.altura) / 2);
    slots.pos.forEach((p) => { p.y += dy; });

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
    // IMPORTANTE: criar DINÂMICO e assentar com setStatic(true) depois — corpo
    // criado já-estático não guarda massa/inércia originais e explode em NaN
    // quando liberado (gotcha conhecido do matter-js).
    const corpos: Matter.Body[] = specs.map((_, i) => {
      const b = Bodies.circle(slots.pos[i].x, slots.pos[i].y, raio(i), {
        restitution: 0.2, friction: 0.35, frictionAir: 0.015, density: 0.0012,
      });
      Body.setStatic(b, true);
      return b;
    });
    const idxPorBody = new Map(corpos.map((b, i) => [b.id, i]));
    Composite.add(engine.world, corpos);

    const seated = specs.map(() => true);      // no berço
    const parked: Array<number | null> = [null, null]; // índices na bandeja
    let heldIdx: number | null = null;
    let mola: Matter.Constraint | null = null;

    const sprites: Array<HTMLCanvasElement | null> = specs.map(() => null);
    let vivas = true;
    specs.forEach((e, i) => {
      const img = new Image();
      img.onload = () => { if (vivas) sprites[i] = prerender(img, raio(i), dpr); };
      img.src = e.foto;
    });

    const sentar = (i: number) => {
      Body.setStatic(corpos[i], true);
      Body.setPosition(corpos[i], { x: slots.pos[i].x, y: slots.pos[i].y });
      Body.setAngle(corpos[i], 0);
      Body.setVelocity(corpos[i], { x: 0, y: 0 });
      seated[i] = true;
    };
    const desestacionar = (i: number) => {
      const s = parked.indexOf(i);
      if (s >= 0) parked[s] = null;
      setBandeja(parked.filter((p): p is number => p !== null).map((p) => specs[p]));
    };
    const estacionar = (i: number) => {
      const livre = parked[0] === null ? 0 : parked[1] === null ? 1 : -1;
      if (livre < 0) return false;
      parked[livre] = i;
      Body.setStatic(corpos[i], true);
      Body.setPosition(corpos[i], traySlots[livre]);
      Body.setAngle(corpos[i], 0);
      setBandeja(parked.filter((p): p is number => p !== null).map((p) => specs[p]));
      return true;
    };

    recolherRef.current = () => {
      for (let i = 0; i < corpos.length; i++) { desestacionar(i); sentar(i); }
    };

    const paraMundo = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    // Hit também nas moedas AMPLIADAS da bandeja (raio desenhado > raio físico).
    const zoomBandeja = () => {
      const ativos = parked.filter((p): p is number => p !== null);
      if (ativos.length === 0) return 1;
      const maxR = Math.max(...ativos.map((i) => raio(i)));
      return Math.min(2.6, (trayR * 0.92) / maxR);
    };
    const acharCorpo = (p: { x: number; y: number }): number | null => {
      const z = zoomBandeja();
      for (const i of parked) {
        if (i === null) continue;
        const b = corpos[i];
        if (Math.hypot(p.x - b.position.x, p.y - b.position.y) <= raio(i) * z) return i;
      }
      const hit = Query.point(corpos, p)[0];
      return hit ? (idxPorBody.get(hit.id) ?? null) : null;
    };

    const onDown = (ev: PointerEvent) => {
      const p = paraMundo(ev.clientX, ev.clientY);
      const i = acharCorpo(p);
      if (i === null) return;
      desestacionar(i);
      seated[i] = false;
      Body.setStatic(corpos[i], false);
      Sleeping.set(corpos[i], false);
      heldIdx = i;
      setSegurando(specs[i]);
      mola = Constraint.create({ pointA: p, bodyB: corpos[i], pointB: { x: 0, y: 0 }, stiffness: 0.2, damping: 0.12 });
      Composite.add(engine.world, mola);
    };
    const onMove = (ev: PointerEvent) => {
      if (mola) mola.pointA = paraMundo(ev.clientX, ev.clientY);
    };
    const onUp = () => {
      if (mola) { Composite.remove(engine.world, mola); mola = null; }
      if (heldIdx !== null) {
        const i = heldIdx;
        const b = corpos[i];
        if (dentroDaBandeja(b.position.x, b.position.y) && estacionar(i)) { /* pousou na bandeja */ }
        else if (Math.hypot(b.position.x - slots.pos[i].x, b.position.y - slots.pos[i].y) < Math.max(raio(i), 22)) sentar(i);
        // senão: fica livre, cai com a gravidade
      }
      heldIdx = null;
      setSegurando(null);
    };
    box.addEventListener("pointerdown", onDown);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerup", onUp);
    box.addEventListener("pointercancel", onUp);

    // Acelerômetro → gravidade (mesmo padrão do Pote).
    const ios = precisaPermissao || /iPhone|iPad/.test(navigator.userAgent);
    let gAnt = { x: 0, y: 1 };
    const onMotion = (ev: DeviceMotionEvent) => {
      const a = ev.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null) return;
      // tela DEITADA: troca os eixos conforme a orientação atual
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
        corpos.forEach((b, i) => { if (!seated[i] && !parked.includes(i)) Sleeping.set(b, false); });
      }
    };
    window.addEventListener("devicemotion", onMotion);

    // ── Desenho ───────────────────────────────────────────────────────────────
    let raf = 0;
    let antes = performance.now();
    const desenhar = (agora: number) => {
      const dt = Math.min(agora - antes, 33);
      antes = agora;
      Matter.Engine.update(engine, dt);

      // moeda livre passando devagar sobre o próprio berço → imanta de volta
      for (let i = 0; i < corpos.length; i++) {
        if (seated[i] || parked.includes(i) || i === heldIdx) continue;
        const b = corpos[i];
        const d = Math.hypot(b.position.x - slots.pos[i].x, b.position.y - slots.pos[i].y);
        if (d < raio(i) * 0.8 && Math.hypot(b.velocity.x, b.velocity.y) < 2.2) sentar(i);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // divisor + círculos da bandeja
      ctx.strokeStyle = "rgba(240,184,96,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      if (paisagem) { ctx.moveTo(areaW, 14); ctx.lineTo(areaW, H - 14); }
      else { ctx.moveTo(14, areaH); ctx.lineTo(W - 14, areaH); }
      ctx.stroke();
      ctx.setLineDash([]);
      for (const t of traySlots) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, trayR, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(240,184,96,0.3)";
        ctx.stroke();
      }

      // berços (recessos no veludo)
      for (let i = 0; i < slots.pos.length; i++) {
        const s = slots.pos[i];
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.34)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.stroke();
      }

      // moedas
      const z = zoomBandeja();
      for (let i = 0; i < corpos.length; i++) {
        const b = corpos[i];
        const base = raio(i);
        const naBandeja = parked.includes(i);
        const fator = i === heldIdx ? 1.12 : naBandeja ? z : 1;
        const r = base * fator;
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        if (i === heldIdx || naBandeja) {
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 16;
          ctx.shadowOffsetY = 6;
        }
        const sp = sprites[i];
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
      }
      raf = requestAnimationFrame(desenhar);
    };
    raf = requestAnimationFrame(desenhar);

    return () => {
      vivas = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("devicemotion", onMotion);
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointercancel", onUp);
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

  const g0 = bandeja[0] ? gradTone(bandeja[0].m.graduacao) : null;
  const g1 = bandeja[1] ? gradTone(bandeja[1].m.graduacao) : null;

  return createPortal(
    <div className="fixed inset-0 z-[230] flex flex-col" style={{ background: "radial-gradient(120% 100% at 50% 0%, #241016 0%, #150a10 45%, #0b0509 100%)", touchAction: "none" }}>
      {/* moldura do estojo */}
      <div className="pointer-events-none absolute inset-0" style={{ border: "10px solid transparent", borderImage: "linear-gradient(140deg, #3a2413, #6b4a24 30%, #2a1a0d 60%, #57391b) 1", boxShadow: "inset 0 0 60px rgba(0,0,0,0.75), inset 0 0 6px rgba(240,184,96,0.25)" }} />

      {/* topo: título gravado + ações */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-5 pt-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold uppercase tracking-[0.25em] text-amber-300/90" style={{ textShadow: "0 1px 0 rgba(0,0,0,0.8), 0 0 14px rgba(240,184,96,0.35)" }}>
            {estojo.nome}
          </p>
          <p className="text-[10px] tracking-wider text-amber-200/40">{estojo.periodo ?? ""} · {estojo.specs.length} moeda{estojo.specs.length !== 1 ? "s" : ""} · {fmtBRL(estojo.valor)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {sensor !== "ativo" && (
            <button onClick={ativarSensor} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold" style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
              <Smartphone size={12} /> {sensor === "negado" ? "Tentar de novo" : "Gravidade"}
            </button>
          )}
          <button onClick={() => recolherRef.current()} className="rounded-lg p-2 text-amber-200/80" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }} aria-label="Recolher todas para os berços" title="Recolher todas para os berços">
            <RotateCcw size={14} />
          </button>
          <button onClick={onClose} className="rounded-lg p-2 text-amber-200/90" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }} aria-label="Fechar estojo">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* vitrine */}
      <div ref={boxRef} className="relative z-0 min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0" />
        {/* rótulo da bandeja */}
        <span className="pointer-events-none absolute font-mono text-[9px] uppercase tracking-[0.3em] text-amber-200/35" style={{ right: 12, top: 10 }}>
          <Scale size={10} className="mr-1 inline" />Comparar
        </span>
      </div>

      {/* moeda na mão */}
      {segurando && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-1.5 text-[11px] font-semibold text-amber-100" style={{ background: "rgba(20,10,14,0.85)", border: "1px solid rgba(240,184,96,0.35)", marginBottom: "env(safe-area-inset-bottom)" }}>
          {segurando.m.denominacao} · {segurando.m.ano} · Ø {segurando.mm.toLocaleString("pt-BR")} mm
        </div>
      )}

      {/* painel de comparação (2 moedas na bandeja) */}
      {bandeja.length === 2 && !segurando && (
        <div className="absolute bottom-3 left-1/2 z-20 w-[min(94vw,560px)] -translate-x-1/2 rounded-2xl px-4 py-3" style={{ background: "rgba(16,8,12,0.92)", border: "1px solid rgba(240,184,96,0.35)", backdropFilter: "blur(6px)", marginBottom: "env(safe-area-inset-bottom)" }}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            {[0, 1].map((k) => {
              const s = bandeja[k]; const g = k === 0 ? g0 : g1;
              return (
                <div key={k} className="min-w-0">
                  <p className="truncate text-xs font-bold text-amber-100">{s.m.denominacao} · {s.m.ano}</p>
                  <p className="truncate text-[10px] text-amber-200/50">{s.m.pais}{s.m.krause ? ` · ${s.m.krause}` : ""}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-[10px]">
                    <span className="font-mono text-emerald-400">{fmtBRL(s.m.valorBrl)}</span>
                    {s.m.graduacao && g && <span className="rounded px-1.5 py-0.5 font-mono font-bold" style={{ background: g.bg, border: `1px solid ${g.border}`, color: g.color }}>{s.m.graduacao}</span>}
                    <span className="text-amber-200/60">Ø {s.mm.toLocaleString("pt-BR")} mm</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 border-t border-white/10 pt-1.5 text-center text-[10px] text-amber-200/55">
            Ø {Math.abs(bandeja[0].mm - bandeja[1].mm).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm de diferença
            {bandeja[0].m.anoNum && bandeja[1].m.anoNum ? ` · ${Math.abs(bandeja[0].m.anoNum - bandeja[1].m.anoNum)} anos entre elas` : ""}
            {" · "}{fmtBRL(Math.abs(bandeja[0].m.valorBrl - bandeja[1].m.valorBrl))} de diferença de catálogo
          </p>
        </div>
      )}
      {retrato && (
        <button onClick={() => setRetrato(false)} className="absolute inset-x-0 top-16 z-30 mx-auto w-fit rounded-full px-4 py-2 text-[11px] font-semibold text-amber-100" style={{ background: "rgba(20,10,14,0.9)", border: "1px solid rgba(240,184,96,0.4)" }}>
          📱↻ Deite o celular para a experiência completa — toque para dispensar
        </button>
      )}
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
        <p className="text-xs text-zinc-500">Um estojo por conjunto monetário — abra, pegue as moedas e compare (tela deitada recomendada)</p>
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
                  src={s.foto}
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
        Dentro do estojo: cada moeda no seu berço em escala real · segure para tirar e carregar · solte longe e ela cai
        com a gravidade do celular · arraste duas para a bandeja &quot;Comparar&quot; e veja o duelo de specs.
      </p>

      {montado && aberto && <CaseView estojo={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}
