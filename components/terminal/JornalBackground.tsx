"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";
import { applySize, attachResizeListeners, type CanvasState } from "@/lib/canvas-resize";

export default function JornalBackground() {
  const { theme, bgAnim } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme !== "jornal" || !bgAnim) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state: CanvasState = { width: 0, height: 0, dpr: 1 };
    let lastDrawTime = 0;

    interface TickerItem {
      text: string;
      x: number;
      speed: number;
      y: number;
      opacity: number;
      size: number;
    }

    const TICKERS = [
      "PETR4 +1.2%", "VALE3 −0.8%", "ITUB4 +0.3%", "BBDC4 +1.5%",
      "WEGE3 −0.2%", "RENT3 +2.1%", "ABEV3 +0.6%", "SUZB3 −1.1%",
      "B3SA3 +0.9%", "ELET3 +1.7%", "HAPV3 −0.4%", "RAIL3 +0.8%",
      "IBOV 128.450", "S&P 5.420", "DXY 104.2", "USD/BRL 5.12",
      "IPCA 4.5%", "SELIC 10.50%", "CDI 10.40%", "IFIX +0.3%",
      "VOO +0.5%", "QQQ +0.9%", "IVV +0.4%", "VT +0.2%",
    ];

    let items: TickerItem[] = [];
    let frameCount = 0;

    function spawnItems() {
      const lanes = Math.floor(state.height / 60);
      items = [];
      for (let lane = 0; lane < lanes; lane++) {
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          items.push(makeItem(lane, true));
        }
      }
    }

    function makeItem(lane: number, randomX: boolean): TickerItem {
      const text = TICKERS[Math.floor(Math.random() * TICKERS.length)];
      const size = 12 + Math.floor(Math.random() * 5);
      return {
        text,
        x: randomX ? Math.random() * state.width : state.width + Math.random() * 200,
        y: 30 + lane * 60 + Math.random() * 20,
        speed: 0.2 + Math.random() * 0.5,
        opacity: 0.07 + Math.random() * 0.10,
        size,
      };
    }

    function resize() {
      if (!applySize(canvas!, ctx!, state)) return;
      spawnItems();
      draw();
    }

    function draw() {
      lastDrawTime = performance.now();
      frameCount++;
      const { width, height } = state;

      ctx!.fillStyle = "rgba(242, 235, 221, 0.12)";
      ctx!.fillRect(0, 0, width, height);
      if (frameCount <= 2) {
        ctx!.fillStyle = "#F2EBDD";
        ctx!.fillRect(0, 0, width, height);
      }

      for (const item of items) {
        ctx!.font = `${item.size}px "Georgia", serif`;
        ctx!.fillStyle = `rgba(0, 0, 0, ${item.opacity})`;
        ctx!.fillText(item.text, item.x, item.y);

        item.x -= item.speed;

        if (item.x < -200) {
          item.x = width + Math.random() * 100;
          item.text = TICKERS[Math.floor(Math.random() * TICKERS.length)];
          item.opacity = 0.04 + Math.random() * 0.06;
        }
      }

      // Subtle column lines (newspaper feel)
      ctx!.strokeStyle = "rgba(0, 0, 0, 0.04)";
      ctx!.lineWidth = 0.5;
      const colWidth = width / 5;
      for (let i = 1; i < 5; i++) {
        ctx!.beginPath();
        ctx!.moveTo(i * colWidth, 0);
        ctx!.lineTo(i * colWidth, height);
        ctx!.stroke();
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
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(backup);
      listeners.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme, bgAnim]);

  if (theme !== "jornal" || !bgAnim) return null;

  return (
    <>
      <canvas ref={canvasRef} className="jornal-bg" aria-hidden />
      <div className="jornal-grain" aria-hidden />
    </>
  );
}
