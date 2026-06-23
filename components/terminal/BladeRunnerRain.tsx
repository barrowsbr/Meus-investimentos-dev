"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";

export default function BladeRunnerRain() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme !== "blade") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;

    interface Drop {
      x: number;
      y: number;
      len: number;
      speed: number;
      opacity: number;
    }

    let drops: Drop[] = [];
    const WIND_ANGLE = 0.12;
    const MAX_DROPS = 320;

    interface NeonSign {
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      phase: number;
      speed: number;
      on: boolean;
      nextFlicker: number;
    }
    let neons: NeonSign[] = [];

    const NEON_COLORS = [
      "#FF6D00", "#38BDF8", "#FF3366", "#E8A33D",
      "#00BFFF", "#FF4500", "#22D3EE",
    ];

    function spawnNeons() {
      neons = [];
      const count = Math.max(4, Math.floor(width / 160));
      for (let i = 0; i < count; i++) {
        neons.push({
          x: Math.random() * width * 0.9 + width * 0.05,
          y: height * 0.2 + Math.random() * height * 0.35,
          w: 18 + Math.random() * 40,
          h: 4 + Math.random() * 10,
          color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
          phase: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random() * 2,
          on: true,
          nextFlicker: 60 + Math.random() * 300,
        });
      }
    }

    function spawnDrop(): Drop {
      return {
        x: Math.random() * (width + 100) - 50,
        y: -Math.random() * height * 0.3,
        len: 12 + Math.random() * 28,
        speed: 6 + Math.random() * 10,
        opacity: 0.15 + Math.random() * 0.35,
      };
    }

    function initDrops() {
      const count = Math.min(MAX_DROPS, Math.floor((width * height) / 3000));
      drops = [];
      for (let i = 0; i < count; i++) {
        const d = spawnDrop();
        d.y = Math.random() * height;
        drops.push(d);
      }
    }

    function getViewportSize(): [number, number] {
      const vv = window.visualViewport;
      const rect = canvas!.getBoundingClientRect();
      const w = rect.width || canvas!.clientWidth || vv?.width || window.innerWidth;
      const h = rect.height || canvas!.clientHeight || vv?.height || window.innerHeight;
      return [w, h];
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const [w, h] = getViewportSize();
      if (w < 10 || h < 10) return;
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      initDrops();
      spawnNeons();
    }

    let frameCount = 0;

    function draw() {
      frameCount++;

      ctx!.fillStyle = "rgba(6, 10, 18, 0.35)";
      ctx!.fillRect(0, 0, width, height);

      if (frameCount <= 3) {
        ctx!.fillStyle = "#060A12";
        ctx!.fillRect(0, 0, width, height);
      }

      // Cityscape silhouette
      ctx!.fillStyle = "#0A0F1A";
      const skyline = height * 0.55;
      const bw = width / 28;
      for (let i = 0; i < 28; i++) {
        const bh = 30 + ((i * 7 + 13) % 19) * 8 + ((i * 3 + 5) % 11) * 4;
        const x = i * bw;
        ctx!.fillRect(x, skyline - bh, bw - 1.5, bh + height - skyline);
      }

      // Neon signs (distant glow on buildings)
      for (const n of neons) {
        n.nextFlicker--;
        if (n.nextFlicker <= 0) {
          n.on = !n.on || Math.random() > 0.3;
          n.nextFlicker = n.on ? 60 + Math.random() * 300 : 3 + Math.random() * 12;
        }
        if (!n.on) continue;

        const pulse = 0.6 + 0.4 * Math.sin(n.phase + frameCount * 0.02 * n.speed);
        ctx!.save();
        ctx!.globalAlpha = pulse * 0.7;
        ctx!.shadowColor = n.color;
        ctx!.shadowBlur = 18;
        ctx!.fillStyle = n.color;
        ctx!.fillRect(n.x, n.y, n.w, n.h);
        ctx!.restore();

        // reflection glow below
        ctx!.save();
        ctx!.globalAlpha = pulse * 0.08;
        const rg = ctx!.createRadialGradient(n.x + n.w / 2, n.y + n.h, 2, n.x + n.w / 2, n.y + n.h, n.w * 1.8);
        rg.addColorStop(0, n.color);
        rg.addColorStop(1, "transparent");
        ctx!.fillStyle = rg;
        ctx!.fillRect(n.x - n.w, n.y, n.w * 3, n.w * 2.5);
        ctx!.restore();
      }

      // Rain drops
      ctx!.lineCap = "round";
      for (const d of drops) {
        const dx = Math.sin(WIND_ANGLE) * d.len;
        const dy = Math.cos(WIND_ANGLE) * d.len;

        ctx!.strokeStyle = `rgba(174, 200, 220, ${d.opacity})`;
        ctx!.lineWidth = 1.1;
        ctx!.beginPath();
        ctx!.moveTo(d.x, d.y);
        ctx!.lineTo(d.x + dx, d.y + dy);
        ctx!.stroke();

        d.x += Math.sin(WIND_ANGLE) * d.speed * 0.3;
        d.y += d.speed;

        if (d.y > height + 10) {
          Object.assign(d, spawnDrop());
        }
      }

      // Ground reflection (wet street)
      const reflStart = height * 0.82;
      const reflGrad = ctx!.createLinearGradient(0, reflStart, 0, height);
      reflGrad.addColorStop(0, "rgba(6, 10, 18, 0)");
      reflGrad.addColorStop(0.4, "rgba(56, 189, 248, 0.03)");
      reflGrad.addColorStop(1, "rgba(255, 109, 0, 0.04)");
      ctx!.fillStyle = reflGrad;
      ctx!.fillRect(0, reflStart, width, height - reflStart);

      // Occasional lightning/ambient flash
      if (Math.random() < 0.001) {
        ctx!.fillStyle = "rgba(174, 200, 220, 0.06)";
        ctx!.fillRect(0, 0, width, height);
      }
    }

    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 28;
    let running = true;

    function loop(t: number) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (t - last < FRAME_MS) return;
      last = t;
      draw();
    }

    function startIfReady() {
      resize();
      if (width < 10 || height < 10) return false;
      if (reduced) {
        draw(); draw(); draw();
      } else if (running) {
        raf = requestAnimationFrame(loop);
      }
      return true;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        startIfReady();
      });
    });

    const fallbackTimer = setTimeout(() => {
      if (width < 10 || height < 10) startIfReady();
    }, 300);

    const fallbackTimer2 = setTimeout(() => {
      if (width < 10 || height < 10) startIfReady();
    }, 800);

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    const onVVResize = () => resize();
    window.visualViewport?.addEventListener("resize", onVVResize);

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced && !running) {
        running = true;
        last = 0;
        resize();
        raf = requestAnimationFrame(loop);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(fallbackTimer);
      clearTimeout(fallbackTimer2);
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", onVVResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme]);

  if (theme !== "blade") return null;

  return (
    <>
      <canvas ref={canvasRef} className="blade-rain" aria-hidden />
      <div className="blade-fog" aria-hidden />
    </>
  );
}
