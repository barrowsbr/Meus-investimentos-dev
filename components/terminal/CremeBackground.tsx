"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";
import { applySize, attachResizeListeners, type CanvasState } from "@/lib/canvas-resize";

// Fundo do tema Creme — "luz de manhã": manchas pastel quentes derivando em
// trajetórias lentas de Lissajous, dois feixes diagonais de luz e poeira
// dourada subindo devagar. Repintura completa por frame (barato: meia dúzia
// de gradientes), 20fps.
export default function CremeBackground() {
  const { theme, bgAnim } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme !== "creme" || !bgAnim) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state: CanvasState = { width: 0, height: 0, dpr: 1 };
    let lastDrawTime = 0;

    // Manchas de luz: cada uma orbita um ponto-base com fase/velocidade própria.
    interface Blob_ {
      cx: number; cy: number;      // centro-base (fração da tela)
      ax: number; ay: number;      // amplitude do passeio (fração)
      fx: number; fy: number;      // frequências (rad/s bem baixos)
      ph: number;                  // fase
      r: number;                   // raio (fração da menor dimensão)
      color: string;               // rgba do miolo
    }
    const BLOBS: Blob_[] = [
      { cx: .18, cy: .22, ax: .10, ay: .08, fx: .051, fy: .043, ph: 0.0, r: .58, color: "rgba(255,201,130,.20)" }, // pêssego
      { cx: .82, cy: .16, ax: .08, ay: .07, fx: .037, fy: .049, ph: 1.7, r: .50, color: "rgba(255,231,158,.22)" }, // manteiga
      { cx: .70, cy: .78, ax: .11, ay: .09, fx: .045, fy: .036, ph: 3.1, r: .62, color: "rgba(246,187,170,.16)" }, // rosa-argila
      { cx: .24, cy: .80, ax: .09, ay: .10, fx: .033, fy: .052, ph: 4.4, r: .52, color: "rgba(206,219,178,.15)" }, // sálvia
      { cx: .50, cy: .45, ax: .12, ay: .10, fx: .041, fy: .039, ph: 5.6, r: .70, color: "rgba(255,244,214,.18)" }, // núcleo claro
    ];

    // Poeira dourada em suspensão (motes sobem devagar, com deriva lateral).
    interface Mote { x: number; y: number; r: number; vy: number; sway: number; ph: number; o: number }
    let motes: Mote[] = [];
    function spawnMotes() {
      const n = Math.round((state.width * state.height) / 26_000);
      motes = Array.from({ length: Math.min(70, Math.max(24, n)) }, () => ({
        x: Math.random() * state.width,
        y: Math.random() * state.height,
        r: 0.6 + Math.random() * 1.8,
        vy: 3 + Math.random() * 9,          // px/s para cima
        sway: 6 + Math.random() * 14,
        ph: Math.random() * Math.PI * 2,
        o: 0.05 + Math.random() * 0.12,
      }));
    }

    function resize() {
      if (!applySize(canvas!, ctx!, state)) return;
      spawnMotes();
      draw(performance.now());
    }

    function draw(now: number) {
      lastDrawTime = performance.now();
      const { width, height } = state;
      const t = now / 1000;
      const minDim = Math.min(width, height);

      // Base creme com leve degradê vertical (mais claro no alto — céu).
      const base = ctx!.createLinearGradient(0, 0, 0, height);
      base.addColorStop(0, "#F9F4E8");
      base.addColorStop(1, "#F2EAD7");
      ctx!.fillStyle = base;
      ctx!.fillRect(0, 0, width, height);

      // Manchas pastel em passeio lento.
      for (const b of BLOBS) {
        const x = (b.cx + b.ax * Math.sin(t * b.fx + b.ph)) * width;
        const y = (b.cy + b.ay * Math.cos(t * b.fy + b.ph)) * height;
        const r = b.r * minDim;
        const g = ctx!.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, b.color);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx!.fillStyle = g;
        ctx!.fillRect(x - r, y - r, r * 2, r * 2);
      }

      // Dois feixes de luz diagonais (janela alta à esquerda), oscilação mínima.
      ctx!.save();
      ctx!.translate(width * 0.28, -height * 0.1);
      ctx!.rotate(0.62 + 0.015 * Math.sin(t * 0.05));
      const beam = ctx!.createLinearGradient(0, 0, minDim * 0.5, 0);
      beam.addColorStop(0, "rgba(255,236,190,0)");
      beam.addColorStop(0.5, "rgba(255,236,190,.14)");
      beam.addColorStop(1, "rgba(255,236,190,0)");
      ctx!.fillStyle = beam;
      ctx!.fillRect(0, 0, minDim * 0.34, height * 2.2);
      ctx!.translate(minDim * 0.52, 0);
      ctx!.fillRect(0, 0, minDim * 0.2, height * 2.2);
      ctx!.restore();

      // Poeira dourada.
      for (const m of motes) {
        const x = m.x + Math.sin(t * 0.5 + m.ph) * m.sway;
        ctx!.beginPath();
        ctx!.arc(x, m.y, m.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(196,140,60,${m.o})`;
        ctx!.fill();
        m.y -= m.vy / 20; // dividido pelo FPS-alvo (20)
        if (m.y < -4) {
          m.y = height + 4;
          m.x = Math.random() * width;
        }
      }
    }

    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 20;
    let alive = true;

    function loop(t: number) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      resize();
      if (t - last < FRAME_MS) return;
      last = t;
      draw(t);
    }

    function boot() {
      resize();
      if (state.width > 0 && state.height > 0 && alive) {
        raf = requestAnimationFrame(loop);
      }
    }

    requestAnimationFrame(() => requestAnimationFrame(boot));
    const t1 = setTimeout(boot, 300);
    const t2 = setTimeout(boot, 800);

    const listeners = attachResizeListeners(canvas, resize);

    function onVisibility() {
      if (document.hidden) { cancelAnimationFrame(raf); }
      else if (alive) { last = 0; resize(); raf = requestAnimationFrame(loop); }
    }
    document.addEventListener("visibilitychange", onVisibility);

    const backup = setInterval(() => {
      if (!alive) return;
      if (performance.now() - lastDrawTime > 500) {
        resize();
        if (state.width > 0) draw(performance.now());
      }
      if (alive && !document.hidden) {
        cancelAnimationFrame(raf);
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    }, 1000);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(backup);
      listeners.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme, bgAnim]);

  if (theme !== "creme" || !bgAnim) return null;

  return (
    <>
      <canvas ref={canvasRef} className="creme-bg" aria-hidden />
      <div className="creme-grain" aria-hidden />
    </>
  );
}
