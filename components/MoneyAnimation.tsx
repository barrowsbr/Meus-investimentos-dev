"use client";

import { useEffect, useRef, useCallback } from "react";

interface Props {
  width?: number;
  height?: number;
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$@#%&*";
const BUF = 160;
const GRID = 5;

interface Subject {
  type: "note" | "coin";
  val?: string;
  paper?: number[];
  ink?: number[];
  glow: number[];
  metal?: { hi: number[]; mid: number[]; lo: number[] };
}

const SUBJECTS: Subject[] = [
  { type: "note", val: "1", paper: [212, 214, 196], ink: [34, 74, 48], glow: [40, 90, 55] },
  { type: "coin", metal: { hi: [255, 228, 140], mid: [212, 168, 58], lo: [140, 100, 28] }, glow: [150, 110, 30] },
  { type: "note", val: "100", paper: [210, 216, 200], ink: [30, 70, 46], glow: [40, 90, 55] },
  { type: "coin", metal: { hi: [255, 186, 96], mid: [242, 140, 38], lo: [170, 84, 18] }, glow: [210, 115, 30] },
];

export default function MoneyAnimation({ width = 240, height = 240 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const stateRef = useRef({
    t: 0, cur: 0, spinY: 0, phase: "appear" as string,
    phaseT: 0, appear: 0, dissolve: 0, mode: 0, modeT: 0, modeTimer: 0,
  });

  const draw = useCallback((ctx: CanvasRenderingContext2D, bufCtx: CanvasRenderingContext2D, w: number, h: number, dt: number) => {
    const st = stateRef.current;
    st.t += dt;
    st.spinY += dt * 0.8;
    const sub = SUBJECTS[st.cur];

    if (st.phase === "appear") {
      st.appear += (1 - st.appear) * 0.05;
      st.phaseT += dt;
      if (st.appear > 0.97) { st.appear = 1; st.phase = "show"; st.phaseT = 0; }
    } else if (st.phase === "show") {
      st.phaseT += dt;
      if (st.phaseT > 5) { st.phase = "dissolve"; st.phaseT = 0; }
    } else if (st.phase === "dissolve") {
      st.dissolve = Math.min(1, st.dissolve + dt * 0.6);
      if (st.dissolve > 0.98) { st.phase = "wait"; st.phaseT = 0; }
    } else if (st.phase === "wait") {
      st.phaseT += dt;
      if (st.phaseT > 0.3) {
        st.cur = (st.cur + 1) % SUBJECTS.length;
        st.phase = "appear"; st.phaseT = 0; st.appear = 0; st.dissolve = 0;
      }
    }

    st.modeTimer += dt;
    if (st.modeTimer > 1.2) {
      st.modeTimer = 0;
      st.mode = (st.mode + 1) % 3;
      st.modeT = 0;
    }
    st.modeT = Math.min(1, st.modeT + dt * 3);

    // --- Draw subject to offscreen buffer ---
    bufCtx.fillStyle = "#000";
    bufCtx.fillRect(0, 0, BUF, BUF);

    const cx = BUF / 2;
    const cy = BUF * 0.44 + (1 - easeOut(st.appear)) * 60;
    const cosY = Math.cos(st.spinY);
    const absX = Math.max(0.08, Math.abs(cosY));
    const alpha = st.appear * (1 - st.dissolve);

    bufCtx.save();
    bufCtx.translate(cx, cy);
    bufCtx.transform(1, 0, Math.sin(st.t * 0.3) * 0.04, 1, 0, 0);

    if (alpha > 0.02) {
      if (sub.type === "note") {
        const nw = 110 * absX * (0.6 + 0.4 * st.appear);
        const nh = 48 * (0.6 + 0.4 * st.appear);
        drawNote(bufCtx, sub, nw, nh, cosY < 0, alpha, st.t);
      } else {
        const r = 38 * (0.6 + 0.4 * st.appear);
        drawCoin(bufCtx, sub, r, absX, cosY < 0, alpha);
      }
    }
    bufCtx.restore();

    // --- Render buffer to main canvas as ASCII/dots/pixels ---
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    // Backdrop glow
    const gk = alpha * 0.12;
    const grad = ctx.createRadialGradient(w / 2, h * 0.44, 0, w / 2, h * 0.44, w * 0.6);
    grad.addColorStop(0, `rgba(${sub.glow[0]},${sub.glow[1]},${sub.glow[2]},${gk})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const imgData = bufCtx.getImageData(0, 0, BUF, BUF);
    const px = imgData.data;
    const scale = Math.min(w / BUF, h / BUF) * 0.9;
    const ox = (w - BUF * scale) / 2;
    const oy = (h - BUF * scale) / 2;
    const g = GRID;
    const invS = 1 / scale;

    const mode = st.mode;
    const useTxt = mode === 0;
    if (useTxt) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    }

    for (let sy = Math.max(0, Math.floor(oy)); sy < Math.min(h, oy + BUF * scale); sy += g) {
      const by = Math.floor((sy - oy) * invS);
      if (by < 0 || by >= BUF) continue;
      const row = by * BUF;
      for (let sx = Math.max(0, Math.floor(ox)); sx < Math.min(w, ox + BUF * scale); sx += g) {
        const bx = Math.floor((sx - ox) * invS);
        if (bx < 0 || bx >= BUF) continue;
        const i = (row + bx) * 4;
        const r = px[i], gr = px[i + 1], b = px[i + 2];
        if (r + gr + b < 15) continue;
        const bright = r * 0.299 + gr * 0.587 + b * 0.114;
        const cxp = sx + g * 0.5, cyp = sy + g * 0.5;

        if (mode === 0) {
          const fsz = Math.max(4, Math.floor(g * (0.5 + bright * 0.004)));
          ctx.font = `${fsz}px Courier New`;
          ctx.fillStyle = `rgb(${r},${gr},${b})`;
          const ci = ((bright >> 2) + ((sx * 7 + sy * 13) >> 3)) % CHARS.length;
          ctx.fillText(CHARS[ci], cxp, cyp);
        } else if (mode === 1) {
          const d = g * (0.15 + bright * 0.003);
          ctx.fillStyle = `rgb(${r},${gr},${b})`;
          ctx.beginPath();
          ctx.arc(cxp, cyp, d / 2, 0, 6.283);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgb(${r},${gr},${b})`;
          ctx.fillRect(sx + 0.5, sy + 0.5, g - 1, g - 1);
        }
      }
    }

    // Glitch overlay (occasional)
    if (Math.random() < 0.008) {
      const sliceY = Math.random() * h;
      const sliceH = 2 + Math.random() * 12;
      const shift = (Math.random() - 0.5) * 30;
      ctx.drawImage(ctx.canvas, 0, sliceY, w, sliceH, shift, sliceY, w, sliceH);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.scale(dpr, dpr);

    const bufCanvas = document.createElement("canvas");
    bufCanvas.width = BUF;
    bufCanvas.height = BUF;
    bufRef.current = bufCanvas;
    const bufCtx = bufCanvas.getContext("2d", { willReadFrequently: true })!;

    let last = 0;
    const loop = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0.016;
      last = now;
      ctx.save();
      draw(ctx, bufCtx, width, height, dt);
      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [width, height, draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block", borderRadius: 6 }}
    />
  );
}

function easeOut(x: number) {
  return 1 - Math.pow(1 - x, 4);
}

function drawNote(ctx: CanvasRenderingContext2D, s: Subject, w: number, h: number, back: boolean, alpha: number, t: number) {
  const p = s.paper!, ink = s.ink!;
  ctx.globalAlpha = alpha;

  // Paper
  ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
  roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.05);

  // Guilloche lines
  ctx.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},0.15)`;
  ctx.lineWidth = 0.6;
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath();
    for (let xx = -w / 2; xx <= w / 2; xx += w / 20) {
      const yy = k * h * 0.085 + Math.sin(xx * 0.08 + k + t * 0.5) * 3;
      xx === -w / 2 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }

  // Border
  ctx.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${alpha})`;
  ctx.lineWidth = Math.max(0.8, w * 0.006);
  roundRectStroke(ctx, -w * 0.475, -h * 0.43, w * 0.95, h * 0.86, h * 0.05);
  ctx.lineWidth = 0.6;
  roundRectStroke(ctx, -w * 0.45, -h * 0.39, w * 0.9, h * 0.78, h * 0.04);

  if (!back) {
    // Portrait oval
    ctx.fillStyle = `rgba(${p[0] * 0.92},${p[1] * 0.92},${p[2] * 0.9},${alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, h * 0.04, w * 0.13, h * 0.3, 0, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Head silhouette
    ctx.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${alpha * 0.8})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.045, h * 0.12, 0, 0, 6.283);
    ctx.fill();

    // Corner values
    ctx.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${alpha})`;
    ctx.font = `bold ${h * 0.2}px Courier New`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.val!, -w * 0.38, -h * 0.28);
    ctx.fillText(s.val!, w * 0.38, -h * 0.28);
    ctx.fillText(s.val!, -w * 0.38, h * 0.28);
    ctx.fillText(s.val!, w * 0.38, h * 0.28);
  } else {
    // Back: big value
    ctx.fillStyle = `rgba(${p[0] * 0.9},${p[1] * 0.9},${p[2] * 0.9},${alpha})`;
    ctx.font = `bold ${h * 0.45}px Courier New`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.val!, 0, 0);
  }

  // Sheen
  const sheen = Math.sin(t * 1.5) * 0.5 + 0.5;
  ctx.fillStyle = `rgba(255,255,255,${0.06 * alpha})`;
  ctx.fillRect((sheen - 0.5) * w * 0.8, -h / 2, w * 0.12, h);

  ctx.globalAlpha = 1;
}

function drawCoin(ctx: CanvasRenderingContext2D, s: Subject, r: number, absX: number, back: boolean, alpha: number) {
  const m = s.metal!;
  ctx.globalAlpha = alpha;

  const faceW = r * absX;
  const thick = r * 0.09;
  const silW = Math.max(thick, faceW);

  // Edge
  ctx.fillStyle = `rgb(${m.lo[0]},${m.lo[1]},${m.lo[2]})`;
  roundRect(ctx, -silW, -r, silW * 2, r * 2, thick * 0.5);

  if (faceW > 2) {
    // Gradient face
    for (let i = 6; i >= 1; i--) {
      const k = i / 6;
      ctx.fillStyle = `rgb(${lerp(m.mid[0], m.hi[0], k)},${lerp(m.mid[1], m.hi[1], k)},${lerp(m.mid[2], m.hi[2], k)})`;
      ctx.beginPath();
      ctx.ellipse(0, -1, faceW * k, r * k, 0, 0, 6.283);
      ctx.fill();
    }

    // Rim
    ctx.strokeStyle = `rgb(${m.lo[0]},${m.lo[1]},${m.lo[2]})`;
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, 0, faceW * 0.9, r * 0.9, 0, 0, 6.283);
    ctx.stroke();

    // Denticles
    ctx.fillStyle = `rgba(${m.lo[0]},${m.lo[1]},${m.lo[2]},0.7)`;
    const nr = r * 0.74;
    for (let i = 0; i < 20; i++) {
      const a = (6.283 / 20) * i;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * nr * 0.9 * absX, Math.sin(a) * nr * 0.9, nr * 0.04, 0, 6.283);
      ctx.fill();
    }

    // Symbol
    ctx.save();
    ctx.scale(absX * (back ? -1 : 1), 1);
    ctx.fillStyle = `rgba(${m.hi[0]},${m.hi[1]},${m.hi[2]},${alpha})`;
    ctx.font = `bold ${r * 0.7}px Courier New`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", 0, 0);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function roundRectStroke(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
