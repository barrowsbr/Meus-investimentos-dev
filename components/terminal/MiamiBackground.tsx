"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";
import { applySize, attachResizeListeners, type CanvasState } from "@/lib/canvas-resize";

export default function MiamiBackground() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme !== "miami") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state: CanvasState = { width: 0, height: 0, dpr: 1 };
    let scroll = 0;
    let lastDrawTime = 0;

    function resize() {
      const changed = applySize(canvas!, ctx!, state);
      if (changed) draw();
    }

    function draw() {
      lastDrawTime = performance.now();
      const { width, height } = state;
      ctx!.clearRect(0, 0, width, height);
      const horizon = Math.round(height * 0.46);

      const sky = ctx!.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#160A2E");
      sky.addColorStop(0.55, "#3B1248");
      sky.addColorStop(1, "#7A1E5A");
      ctx!.fillStyle = sky;
      ctx!.fillRect(0, 0, width, horizon);

      const sunR = Math.min(width, height) * 0.2;
      const sunX = width / 2;
      const sunY = horizon - sunR * 0.12;

      ctx!.save();
      const glow = ctx!.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 2.4);
      glow.addColorStop(0, "rgba(255,107,157,0.45)");
      glow.addColorStop(1, "rgba(255,107,157,0)");
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, width, horizon + sunR);
      ctx!.restore();

      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx!.clip();
      const sunGrad = ctx!.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
      sunGrad.addColorStop(0, "#FFE74C");
      sunGrad.addColorStop(0.5, "#FF6B9D");
      sunGrad.addColorStop(1, "#FF2A6D");
      ctx!.fillStyle = sunGrad;
      ctx!.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
      ctx!.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 7; i++) {
        const gy = sunY + sunR * 0.12 + i * (sunR * 0.15);
        const gh = 3 + i * 1.3;
        ctx!.fillRect(sunX - sunR, gy, sunR * 2, gh);
      }
      ctx!.restore();

      ctx!.fillStyle = "#0C0220";
      ctx!.fillRect(0, horizon, width, height - horizon);

      const depth = height - horizon;
      const vpX = width / 2;

      ctx!.lineWidth = 1.1;
      ctx!.strokeStyle = "rgba(5,217,232,0.55)";
      ctx!.shadowColor = "rgba(5,217,232,0.9)";
      ctx!.shadowBlur = 6;
      const nV = 14;
      for (let i = -nV; i <= nV; i++) {
        const x = vpX + (i / nV) * width * 1.5;
        ctx!.beginPath();
        ctx!.moveTo(vpX, horizon);
        ctx!.lineTo(x, height);
        ctx!.stroke();
      }

      ctx!.strokeStyle = "rgba(255,42,109,0.55)";
      ctx!.shadowColor = "rgba(255,42,109,0.9)";
      const frac = scroll % 1;
      for (let i = 0; i < 22; i++) {
        const t = (i + frac) / 22;
        const y = horizon + t * t * depth;
        if (y <= horizon || y > height) continue;
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(width, y);
        ctx!.stroke();
      }
      ctx!.shadowBlur = 0;

      ctx!.strokeStyle = "rgba(255,231,76,0.6)";
      ctx!.shadowColor = "rgba(255,231,76,0.8)";
      ctx!.shadowBlur = 8;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.moveTo(0, horizon);
      ctx!.lineTo(width, horizon);
      ctx!.stroke();
      ctx!.shadowBlur = 0;

      scroll += 0.012;
    }

    let raf = 0;
    let last = 0;
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
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (alive) {
        last = 0;
        resize();
        raf = requestAnimationFrame(loop);
      }
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
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(backup);
      listeners.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme]);

  if (theme !== "miami") return null;

  return (
    <>
      <canvas ref={canvasRef} className="miami-bg" aria-hidden />
      <div className="miami-grain" aria-hidden />
    </>
  );
}
