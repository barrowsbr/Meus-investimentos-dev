"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";
import { applySize, attachResizeListeners, type CanvasState } from "@/lib/canvas-resize";

export default function BladeRunnerRain() {
  const { theme, bgAnim } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme !== "blade" || !bgAnim) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state: CanvasState = { width: 0, height: 0, dpr: 1 };
    let lastDrawTime = 0;

    interface Drop { x: number; y: number; len: number; speed: number; opacity: number }
    interface NeonSign { x: number; y: number; w: number; h: number; color: string; phase: number; speed: number; on: boolean; nextFlicker: number }

    let drops: Drop[] = [];
    const WIND_ANGLE = 0.12;
    const MAX_DROPS = 320;
    let neons: NeonSign[] = [];

    const NEON_COLORS = ["#FF6D00", "#38BDF8", "#FF3366", "#E8A33D", "#00BFFF", "#FF4500", "#22D3EE"];

    function spawnNeons() {
      neons = [];
      const count = Math.max(4, Math.floor(state.width / 160));
      for (let i = 0; i < count; i++) {
        neons.push({
          x: Math.random() * state.width * 0.9 + state.width * 0.05,
          y: state.height * 0.2 + Math.random() * state.height * 0.35,
          w: 18 + Math.random() * 40, h: 4 + Math.random() * 10,
          color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
          phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 2,
          on: true, nextFlicker: 60 + Math.random() * 300,
        });
      }
    }

    function spawnDrop(): Drop {
      return {
        x: Math.random() * (state.width + 100) - 50,
        y: -Math.random() * state.height * 0.3,
        len: 12 + Math.random() * 28, speed: 6 + Math.random() * 10,
        opacity: 0.15 + Math.random() * 0.35,
      };
    }

    function initDrops() {
      const count = Math.min(MAX_DROPS, Math.floor((state.width * state.height) / 3000));
      drops = [];
      for (let i = 0; i < count; i++) { const d = spawnDrop(); d.y = Math.random() * state.height; drops.push(d); }
    }

    function resize() {
      if (!applySize(canvas!, ctx!, state)) return;
      initDrops();
      spawnNeons();
      draw();
    }

    let frameCount = 0;

    function draw() {
      lastDrawTime = performance.now();
      frameCount++;
      const { width, height } = state;

      ctx!.fillStyle = "rgba(6, 10, 18, 0.35)";
      ctx!.fillRect(0, 0, width, height);
      if (frameCount <= 3) { ctx!.fillStyle = "#060A12"; ctx!.fillRect(0, 0, width, height); }

      ctx!.fillStyle = "#0A0F1A";
      const skyline = height * 0.55;
      const bw = width / 28;
      for (let i = 0; i < 28; i++) {
        const bh = 30 + ((i * 7 + 13) % 19) * 8 + ((i * 3 + 5) % 11) * 4;
        ctx!.fillRect(i * bw, skyline - bh, bw - 1.5, bh + height - skyline);
      }

      for (const n of neons) {
        n.nextFlicker--;
        if (n.nextFlicker <= 0) { n.on = !n.on || Math.random() > 0.3; n.nextFlicker = n.on ? 60 + Math.random() * 300 : 3 + Math.random() * 12; }
        if (!n.on) continue;
        const pulse = 0.6 + 0.4 * Math.sin(n.phase + frameCount * 0.02 * n.speed);
        ctx!.save(); ctx!.globalAlpha = pulse * 0.7; ctx!.shadowColor = n.color; ctx!.shadowBlur = 18; ctx!.fillStyle = n.color; ctx!.fillRect(n.x, n.y, n.w, n.h); ctx!.restore();
        ctx!.save(); ctx!.globalAlpha = pulse * 0.08;
        const rg = ctx!.createRadialGradient(n.x + n.w / 2, n.y + n.h, 2, n.x + n.w / 2, n.y + n.h, n.w * 1.8);
        rg.addColorStop(0, n.color); rg.addColorStop(1, "transparent"); ctx!.fillStyle = rg; ctx!.fillRect(n.x - n.w, n.y, n.w * 3, n.w * 2.5); ctx!.restore();
      }

      ctx!.lineCap = "round";
      for (const d of drops) {
        const dx = Math.sin(WIND_ANGLE) * d.len, dy = Math.cos(WIND_ANGLE) * d.len;
        ctx!.strokeStyle = `rgba(174, 200, 220, ${d.opacity})`; ctx!.lineWidth = 1.1;
        ctx!.beginPath(); ctx!.moveTo(d.x, d.y); ctx!.lineTo(d.x + dx, d.y + dy); ctx!.stroke();
        d.x += Math.sin(WIND_ANGLE) * d.speed * 0.3; d.y += d.speed;
        if (d.y > height + 10) Object.assign(d, spawnDrop());
      }

      const reflStart = height * 0.82;
      const reflGrad = ctx!.createLinearGradient(0, reflStart, 0, height);
      reflGrad.addColorStop(0, "rgba(6, 10, 18, 0)"); reflGrad.addColorStop(0.4, "rgba(56, 189, 248, 0.03)"); reflGrad.addColorStop(1, "rgba(255, 109, 0, 0.04)");
      ctx!.fillStyle = reflGrad; ctx!.fillRect(0, reflStart, width, height - reflStart);

      if (Math.random() < 0.001) { ctx!.fillStyle = "rgba(174, 200, 220, 0.06)"; ctx!.fillRect(0, 0, width, height); }
    }

    let raf = 0, last = 0;
    const FRAME_MS = 1000 / 28;
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

  if (theme !== "blade" || !bgAnim) return null;

  return (
    <>
      <canvas ref={canvasRef} className="blade-rain" aria-hidden />
      <div className="blade-fog" aria-hidden />
    </>
  );
}
