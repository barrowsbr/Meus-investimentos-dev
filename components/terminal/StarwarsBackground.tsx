"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";
import { applySize, attachResizeListeners, type CanvasState } from "@/lib/canvas-resize";

/**
 * Star Wars — campo de estrelas 3D em perspectiva, com surtos ocasionais de
 * "salto para o hiperespaço" (estrelas viram riscos a partir do centro). Cores:
 * branco/azul-sabre na maioria, amarelo do letreiro nas estrelas de destaque.
 *
 * Mesmo ciclo de vida robusto dos outros fundos (resize bulletproof, throttle
 * por FRAME_MS, pausa em visibilitychange, watchdog que rearma o rAF).
 */
export default function StarwarsBackground() {
  const { theme, bgAnim } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme !== "starwars" || !bgAnim) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state: CanvasState = { width: 0, height: 0, dpr: 1 };
    let lastDrawTime = 0;

    interface Star { x: number; y: number; z: number; pz: number; warm: boolean }

    let stars: Star[] = [];
    let MAX_Z = 1000;
    const FOCAL = 320;

    // Velocidade base (deriva calma) + surtos de hiperespaço.
    const BASE_SPEED = 1.4;
    let speed = BASE_SPEED;
    let warpUntil = 0;       // frame em que o surto termina
    let nextWarp = 600;      // frame do próximo surto
    let frameCount = 0;

    function spawnStar(seed = false): Star {
      const { width, height } = state;
      return {
        x: (Math.random() - 0.5) * width * 1.6,
        y: (Math.random() - 0.5) * height * 1.6,
        z: seed ? Math.random() * MAX_Z : MAX_Z,
        pz: 0,
        warm: Math.random() < 0.12, // ~12% amarelo letreiro, resto branco/azul
      };
    }

    function initStars() {
      MAX_Z = Math.max(700, Math.min(1400, state.width));
      const count = Math.min(520, Math.max(120, Math.floor((state.width * state.height) / 4200)));
      stars = [];
      for (let i = 0; i < count; i++) {
        const s = spawnStar(true);
        s.pz = s.z;
        stars.push(s);
      }
    }

    function resize() {
      if (!applySize(canvas!, ctx!, state)) return;
      initStars();
      draw();
    }

    function draw() {
      lastDrawTime = performance.now();
      frameCount++;
      const { width, height } = state;
      const cx = width / 2;
      const cy = height / 2;

      // Surtos de hiperespaço: a cada ~10-22s, acelera por ~1.4s e desacelera.
      if (frameCount >= nextWarp && frameCount > warpUntil) {
        warpUntil = frameCount + 42;
        nextWarp = frameCount + 300 + Math.floor(Math.random() * 360);
      }
      const inWarp = frameCount < warpUntil;
      const target = inWarp ? 26 : BASE_SPEED;
      // easing suave para dentro/fora do salto
      speed += (target - speed) * (inWarp ? 0.10 : 0.04);

      // Fundo: espaço profundo com leve vinheta azul. Trail curto = riscos.
      const trail = Math.min(0.85, 0.32 + speed * 0.02);
      ctx!.fillStyle = `rgba(5, 6, 10, ${trail})`;
      ctx!.fillRect(0, 0, width, height);
      if (frameCount <= 3) { ctx!.fillStyle = "#05060A"; ctx!.fillRect(0, 0, width, height); }

      // Nebulosa/vinheta sutil (uma vez por frame, barata).
      const vg = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.75);
      vg.addColorStop(0, "rgba(59, 169, 255, 0.025)");
      vg.addColorStop(0.5, "rgba(10, 14, 30, 0)");
      vg.addColorStop(1, "rgba(0, 0, 0, 0.35)");
      ctx!.fillStyle = vg;
      ctx!.fillRect(0, 0, width, height);

      for (const s of stars) {
        s.pz = s.z;
        s.z -= speed;
        if (s.z < 1) { Object.assign(s, spawnStar(false)); s.pz = s.z; continue; }

        const sx = cx + (s.x / s.z) * FOCAL;
        const sy = cy + (s.y / s.z) * FOCAL;
        if (sx < -50 || sx > width + 50 || sy < -50 || sy > height + 50) {
          if (s.z < MAX_Z * 0.5) { Object.assign(s, spawnStar(false)); s.pz = s.z; }
          continue;
        }

        const px = cx + (s.x / s.pz) * FOCAL;
        const py = cy + (s.y / s.pz) * FOCAL;

        const depth = 1 - s.z / MAX_Z;            // 0 (longe) → 1 (perto)
        const size = Math.max(0.4, depth * 2.4);
        const alpha = Math.min(1, 0.25 + depth * 0.9);

        const color = s.warm
          ? `rgba(255, 232, 31, ${alpha})`        // amarelo letreiro
          : depth > 0.7
            ? `rgba(210, 232, 255, ${alpha})`     // branco-azulado perto
            : `rgba(150, 190, 240, ${alpha})`;    // azul-sabre longe

        const streak = Math.hypot(sx - px, sy - py);
        if (streak > 1.2) {
          ctx!.strokeStyle = color;
          ctx!.lineWidth = size;
          ctx!.lineCap = "round";
          ctx!.beginPath();
          ctx!.moveTo(px, py);
          ctx!.lineTo(sx, sy);
          ctx!.stroke();
        } else {
          ctx!.fillStyle = color;
          ctx!.beginPath();
          ctx!.arc(sx, sy, size, 0, Math.PI * 2);
          ctx!.fill();
        }

        // Brilho extra para as estrelas amarelas mais próximas.
        if (s.warm && depth > 0.85) {
          ctx!.save();
          ctx!.globalAlpha = 0.5;
          ctx!.shadowColor = "#FFE81F";
          ctx!.shadowBlur = 8;
          ctx!.fillStyle = "rgba(255, 232, 31, 0.9)";
          ctx!.beginPath();
          ctx!.arc(sx, sy, size * 0.8, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }
      }
    }

    let raf = 0, last = 0;
    const FRAME_MS = 1000 / 30;
    let alive = true;

    function loop(t: number) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      resize();
      if (t - last < FRAME_MS) return;
      last = t;
      draw();
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
        if (state.width > 0) draw();
      }
      if (alive && !document.hidden) {
        cancelAnimationFrame(raf);
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    }, 1000);

    return () => {
      alive = false; cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); clearInterval(backup);
      listeners.dispose(); document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme, bgAnim]);

  if (theme !== "starwars" || !bgAnim) return null;

  return <canvas ref={canvasRef} className="starwars-stars" aria-hidden />;
}
