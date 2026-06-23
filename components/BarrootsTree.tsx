"use client";

import { useEffect, useRef } from "react";
import type p5Type from "p5";

export default function BarrootsTree() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const p5Ref = useRef<p5Type | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let instance: p5Type | null = null;

    import("p5").then((mod) => {
      const p5 = mod.default;
      if (!containerRef.current) return;

      const sketch = function (p: p5Type) {
        const BUF_W = 680, BUF_H = 680;
        let buf: p5Type.Graphics;
        let ctx: CanvasRenderingContext2D;
        const chars = "BARROTS/\\|+*=:.oO0#@%&".split("");

        const variants = [
          { canopy: [70, 228, 232], branch: [64, 170, 238], trunk: [78, 128, 236], root: [150, 108, 246], spark: [200, 250, 255] },
          { canopy: [86, 236, 210], branch: [70, 196, 246], trunk: [92, 140, 244], root: [176, 96, 238], spark: [214, 248, 255] },
          { canopy: [64, 212, 244], branch: [80, 156, 250], trunk: [110, 120, 248], root: [138, 118, 252], spark: [190, 236, 255] },
        ];
        let curV = 0;

        interface Seg { x1: number; y1: number; x2: number; y2: number; depth: number; grow0: number; grow1: number; w: number; kind: number }
        interface Leaf { x: number; y: number; depth: number; bloom0: number }
        let segs: Seg[] = [];
        let leaves: Leaf[] = [];
        const maxDepth = 9;

        let phase = "growing", phaseT = 0;
        let life = 0, wither = 0, breath = 0;
        let psyHue = 0, psyAmt = 0;

        let renderMode = 0, prevMode = 0, modeT = 1;
        let grid = 5, gridTarget = 5;
        const GRID_MIN = 4, GRID_MAX = 16;
        let densDir = 1, densTimer = 0;

        let t = 0, rotX = 0, rotY = 0, rotZ = 0;
        let autoRotX = 0, autoRotY = 0, autoRotZ = 0;
        let mouseRotX = 0, mouseRotY = 0, tgtMRX = 0, tgtMRY = 0, rotEaseIn = 0;
        let mInfX = 0, mInfY = 0;

        let glitchTimer = 0, glitchActive = false, glitchIntensity = 0;
        let glitchSlices: { y: number; h: number; fx: number; fw: number; offset: number; colorShift: boolean; duration: number }[] = [];

        const easeInOutCubic = (x: number) => x < 0.5 ? 4 * x * x * x : 1 - p.pow(-2 * x + 2, 3) / 2;
        const easeOutQuart = (x: number) => 1 - p.pow(1 - x, 4);
        const easeOutCubic = (x: number) => 1 - p.pow(1 - x, 3);

        let wordTimer = 0.6, wordBurst = 0, wordOn = false, wordSeed = 0;

        p.setup = function () {
          p.createCanvas(p.windowWidth, p.windowHeight);
          p.pixelDensity(1);
          p.textFont("Courier New, monospace");
          p.textAlign(p.CENTER, p.CENTER);
          p.noStroke();
          buf = p.createGraphics(BUF_W, BUF_H);
          buf.pixelDensity(1);
          (buf as any).noSmooth();
          (buf as any).canvas?.getContext("2d", { willReadFrequently: true });
          ctx = (p as any).drawingContext;
          startVariant(0);
        };

        function buildTree(seed: number) {
          segs = []; leaves = [];
          p.randomSeed(seed);
          const cx = BUF_W / 2, cy = BUF_H * 0.52;
          const trunkLen = BUF_H * 0.17;
          segs.push({ x1: cx, y1: cy + trunkLen, x2: cx, y2: cy, depth: 0, grow0: 0.0, grow1: 0.14, w: 13, kind: 0 });
          branch(cx, cy, -p.HALF_PI, trunkLen * 0.92, 1, 0.14, 0);
          branch(cx, cy + trunkLen, p.HALF_PI, trunkLen * 0.86, 1, 0.10, 1);
        }

        function branch(x: number, y: number, ang: number, len: number, depth: number, tStart: number, kind: number) {
          if (depth > maxDepth || len < 6) {
            if (kind === 0) leaves.push({ x, y, depth, bloom0: tStart });
            return;
          }
          const ex = x + p.cos(ang) * len;
          const ey = y + p.sin(ang) * len;
          const span = kind === 0 ? 0.62 : 0.78;
          const tEnd = p.min(1, tStart + (kind === 0 ? 0.085 : 0.075));
          const w = p.max(1.5, (maxDepth - depth + 1) * (kind === 0 ? 1.5 : 1.35));
          segs.push({ x1: x, y1: y, x2: ex, y2: ey, depth, grow0: tStart, grow1: tEnd, w, kind });
          const child = len * (kind === 0 ? 0.74 : 0.78);
          const wob = (p.random() - 0.5) * 0.32;
          const nChildren = depth < 3 ? 2 : p.random() < 0.78 ? 2 : 3;
          for (let i = 0; i < nChildren; i++) {
            let off: number;
            if (nChildren === 2) off = (i === 0 ? -span : span) * (0.7 + p.random() * 0.6);
            else off = (i - 1) * span * (0.6 + p.random() * 0.5);
            branch(ex, ey, ang + off + wob, child, depth + 1, tEnd, kind);
          }
        }

        function startVariant(idx: number) {
          curV = idx;
          buildTree(idx * 977 + 13);
          life = 0; wither = 0; phase = "growing"; phaseT = 0;
          grid = GRID_MIN; gridTarget = GRID_MIN; densDir = 1; densTimer = 0; modeT = 1;
        }

        p.draw = function () {
          const dt = p.deltaTime / 1000;
          const v = variants[curV];

          p.background(4, 6, 10);
          t += 0.016;
          breath = p.sin(t * 0.9) * 0.5 + 0.5;

          psyHue = (psyHue + dt * 26) % 360;
          psyAmt = 0.32 + 0.30 * (p.sin(t * 0.37) * 0.5 + 0.5) + 0.18 * (p.sin(t * 1.7 + 2.0) * 0.5 + 0.5);

          updateWordFlash(dt);

          rotEaseIn = p.min(1, rotEaseIn + dt * 0.55);
          const re = easeOutCubic(rotEaseIn);
          autoRotY += dt * 0.42 * re;
          autoRotX += dt * 0.08 * p.sin(t * 0.13) * re;
          autoRotZ += dt * 0.05 * p.sin(t * 0.08 + 1.5) * re;

          tgtMRX = (p.mouseY - p.height / 2) / p.height * 0.9;
          tgtMRY = (p.mouseX - p.width / 2) / p.width * 1.6;
          mouseRotX += (tgtMRX - mouseRotX) * 0.04;
          mouseRotY += (tgtMRY - mouseRotY) * 0.04;
          rotX = autoRotX + mouseRotX * re;
          rotY = autoRotY + mouseRotY * re;
          rotZ = autoRotZ;

          if (phase === "growing") {
            life += (1 - life) * 0.045;
            phaseT += dt;
            if (life > 0.985) { life = 1; phase = "living"; phaseT = 0; }
          }

          densTimer += dt;
          if (densTimer > 0.85) {
            densTimer = 0;
            triggerGlitch();
            prevMode = renderMode; renderMode = (renderMode + 1) % 3; modeT = 0;
            if (densDir === 1) { gridTarget = GRID_MAX; densDir = -1; }
            else { gridTarget = GRID_MIN; densDir = 1; }
          }

          if (phase === "living") {
            phaseT += dt;
            if (phaseT > 24) { phase = "withering"; phaseT = 0; triggerGlitch(); }
          }
          if (phase === "withering") {
            wither = p.min(1, wither + dt * 0.05);
            phaseT += dt;
            if (wither > 0.96) { phase = "waiting"; phaseT = 0; }
          }
          if (phase === "waiting") {
            phaseT += dt;
            if (phaseT > 0.6) {
              prevMode = renderMode; renderMode = (renderMode + 1) % 3; modeT = 0;
              triggerGlitch();
              startVariant((curV + 1) % variants.length);
            }
          }

          grid += (gridTarget - grid) * 0.08;
          modeT = p.min(1, modeT + dt * 4.0);
          updateGlitch(dt);

          if (phase === "living") {
            mInfX += ((p.mouseX - p.width / 2) * 0.06 - mInfX) * 0.04;
            mInfY += ((p.mouseY - p.height / 2) * 0.06 - mInfY) * 0.04;
          } else { mInfX *= 0.95; mInfY *= 0.95; }

          drawTreeToBuffer(v, life, wither);

          glitchTimer -= dt;
          if (glitchTimer <= 0 && !glitchActive) {
            glitchTimer = p.random(3, 7);
            if (p.random() < 0.4) triggerGlitch();
          }

          renderToScreen();
          drawGlitchOverlay();
          drawWordFlash();
        };

        function updateWordFlash(dt: number) {
          wordTimer -= dt;
          if (wordBurst > 0) {
            if (p.random() < 0.55) { wordOn = true; wordSeed = p.random(10000); }
            else wordOn = false;
            wordBurst--;
            if (wordBurst <= 0) { wordOn = false; wordTimer = p.random(2.2, 5.5); }
          } else {
            wordOn = false;
            if (wordTimer <= 0) {
              wordBurst = p.floor(p.random(4, 9));
              triggerGlitch();
            }
          }
        }

        function drawWordFlash() {
          if (!wordOn) return;
          const word = "BARROOTS";
          const baseSize = p.min(p.width, p.height) * p.random(0.11, 0.17);
          const cx = p.width / 2 + p.random(-1, 1) * p.width * 0.06;
          const cy = p.height / 2 + p.random(-1, 1) * p.height * 0.10;
          const rot = p.random(-0.16, 0.16);
          const v = variants[curV];

          p.push();
          p.translate(cx, cy);
          p.rotate(rot);
          p.scale(p.random(0.82, 1.35), p.random(0.7, 1.25));
          p.textAlign(p.CENTER, p.CENTER);
          p.textStyle(p.BOLD);
          p.textFont("Courier New, monospace");
          p.textSize(baseSize);

          const h = psyHue + p.random(-60, 60);
          const c1 = hueRotate(v.spark[0], v.spark[1], v.spark[2], h, 0.9);
          const c2 = hueRotate(60, 230, 255, h + 130, 0.95);
          const c3 = hueRotate(255, 80, 220, h - 110, 0.95);
          const off = baseSize * p.random(0.04, 0.13);
          const alpha = p.random(150, 245);

          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          p.fill(c2[0], c2[1], c2[2], alpha * 0.7);
          p.text(word, -off, 0);
          p.fill(c3[0], c3[1], c3[2], alpha * 0.7);
          p.text(word, off, off * 0.4);
          p.fill(c1[0], c1[1], c1[2], alpha);
          p.text(word, 0, 0);
          ctx.restore();

          if (p.random() < 0.5) {
            const sliceY = p.random(-baseSize * 0.5, baseSize * 0.5);
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            p.fill(c1[0], c1[1], c1[2], alpha * 0.6);
            p.push();
            p.translate(p.random(-30, 30), sliceY * 0.2);
            p.text(word, 0, sliceY);
            p.pop();
            ctx.restore();
          }

          p.textStyle(p.NORMAL);
          p.textAlign(p.CENTER, p.CENTER);
          p.pop();
        }

        function triggerGlitch() {
          glitchActive = true;
          glitchIntensity = p.random(0.4, 1.0);
          glitchSlices = [];
          const scaleF = p.min(p.width / BUF_W, p.height / BUF_H) * 0.88;
          const rW = BUF_W * scaleF, rH = BUF_H * scaleF;
          const fOx = (p.width - rW) / 2 + mInfX;
          const fOy = (p.height - rH) / 2 + mInfY;
          const n = p.floor(p.random(3, 10));
          for (let i = 0; i < n; i++) {
            const sy = p.random(fOy, fOy + rH);
            const sh = p.min(p.random(2, rH * 0.08), fOy + rH - sy);
            glitchSlices.push({
              y: sy, h: sh, fx: fOx, fw: rW,
              offset: p.random(-80, 80) * glitchIntensity,
              colorShift: p.random() < 0.5,
              duration: p.random(0.08, 0.3),
            });
          }
        }

        function updateGlitch(dt: number) {
          if (!glitchActive) return;
          let done = true;
          for (const s of glitchSlices) {
            s.duration -= dt;
            if (s.duration > 0) done = false;
            else s.offset *= 0.7;
          }
          if (done) { glitchActive = false; glitchSlices = []; }
        }

        function drawGlitchOverlay() {
          if (!glitchActive || !glitchSlices.length) return;
          for (const s of glitchSlices) {
            if (p.abs(s.offset) < 0.5) continue;
            const sx = p.floor(s.fx), sy = p.floor(s.y), sw = p.floor(s.fw), sh = p.floor(s.h);
            if (sw < 1 || sh < 1) continue;
            if (s.colorShift) {
              ctx.save();
              ctx.globalAlpha = 0.7;
              ctx.globalCompositeOperation = "lighter";
              ctx.drawImage(ctx.canvas, sx, sy, sw, sh, sx + s.offset * 1.5, sy, sw, sh);
              ctx.globalAlpha = 0.45;
              ctx.drawImage(ctx.canvas, sx, sy, sw, sh, sx - s.offset, sy, sw, sh);
              ctx.restore();
            } else {
              ctx.drawImage(ctx.canvas, sx, sy, sw, sh, sx + s.offset, sy, sw, sh);
            }
          }
        }

        function hueRotate(r: number, g: number, b: number, deg: number, amt: number): number[] {
          if (amt <= 0.001) return [r, g, b];
          const a = (deg * Math.PI) / 180;
          const c = Math.cos(a), s = Math.sin(a);
          const nr = r * (0.299 + 0.701 * c + 0.168 * s) + g * (0.587 - 0.587 * c + 0.330 * s) + b * (0.114 - 0.114 * c - 0.497 * s);
          const ng = r * (0.299 - 0.299 * c - 0.328 * s) + g * (0.587 + 0.413 * c + 0.035 * s) + b * (0.114 - 0.114 * c + 0.292 * s);
          const nb = r * (0.299 - 0.300 * c + 1.250 * s) + g * (0.587 - 0.588 * c - 1.050 * s) + b * (0.114 + 0.886 * c - 0.203 * s);
          return [p.lerp(r, nr, amt), p.lerp(g, ng, amt), p.lerp(b, nb, amt)];
        }

        function rot3D(x: number, y: number, z: number): number[] {
          const cY = p.cos(rotY), sY = p.sin(rotY);
          const rx = x * cY + z * sY, rz = -x * sY + z * cY;
          const cX = p.cos(rotX), sX = p.sin(rotX);
          const ry = y * cX - rz * sX, rz2 = y * sX + rz * cX;
          const cZ = p.cos(rotZ), sZ = p.sin(rotZ);
          return [rx * cZ - ry * sZ, rx * sZ + ry * cZ, rz2];
        }

        function colFor(kind: number, depth: number, shade: number): number[] {
          const v = variants[curV];
          let c: number[];
          if (kind === 0) {
            const k = p.constrain(depth / maxDepth, 0, 1);
            c = [p.lerp(v.trunk[0], v.canopy[0], k), p.lerp(v.trunk[1], v.canopy[1], k), p.lerp(v.trunk[2], v.canopy[2], k)];
          } else {
            const k = p.constrain(depth / maxDepth, 0, 1);
            c = [p.lerp(v.trunk[0], v.root[0], k), p.lerp(v.trunk[1], v.root[1], k), p.lerp(v.trunk[2], v.root[2], k)];
          }
          let r = c[0] * shade, g = c[1] * shade, b = c[2] * shade;
          if (wither > 0) {
            const wf = p.min(1, wither * 1.2 * (kind === 0 ? 1 : 0.6));
            r = p.lerp(r, r * 0.42 + 26, wf);
            g = p.lerp(g, g * 0.34 + 20, wf);
            b = p.lerp(b, b * 0.40 + 30, wf);
          }
          const localHue = psyHue + depth * 14 + (kind === 1 ? 40 : 0);
          const rotated = hueRotate(r, g, b, localHue, psyAmt);
          return [p.constrain(rotated[0], 0, 255), p.constrain(rotated[1], 0, 255), p.constrain(rotated[2], 0, 255)];
        }

        function drawTreeToBuffer(v: typeof variants[0], lf: number, wl: number) {
          buf.background(4, 6, 10);
          buf.noStroke();
          const cx = BUF_W / 2, cy = BUF_H * 0.52;
          const eLife = easeOutCubic(lf);
          const focal = 540;

          function proj(px: number, py: number, phaseSeed: number): number[] {
            const z = p.sin(phaseSeed) * 26;
            const lx = px - cx, ly = py - cy;
            const [rx, ry, rz] = rot3D(lx, ly, z);
            const ps = focal / (focal + rz);
            return [cx + rx * ps, cy + ry * ps, ps, rz];
          }

          const drawList: { rz: number; ax: number; ay: number; bx: number; by: number; w: number; col: number[]; glow: boolean }[] = [];
          for (let i = 0; i < segs.length; i++) {
            const s = segs[i];
            const sg = p.constrain((eLife - s.grow0) / p.max(0.001, s.grow1 - s.grow0), 0, 1);
            if (sg <= 0.001) continue;
            const eg = easeOutQuart(sg);
            let wcut = 0;
            if (wl > 0) {
              const tipness = s.depth / maxDepth;
              wcut = p.constrain((wl * 1.3 - (1 - tipness) * 0.3) / 0.7, 0, 1);
              if (s.kind === 1) wcut *= 0.55;
              if (wcut > 0.92) continue;
            }
            const frac = eg * (1 - wcut * 0.85);
            const mx = p.lerp(s.x1, s.x2, frac);
            const my = p.lerp(s.y1, s.y2, frac);
            const seed = i * 0.7 + t * 0.4 * (s.kind === 0 ? 1 : -1);
            const sway = (s.kind === 0 ? 1 : 0.4) * p.sin(t * 0.8 + s.depth * 0.5 + i) * s.depth * 0.5;
            const [ax, ay, aps] = proj(s.x1, s.y1, seed);
            const [bx, by, bps, brz] = proj(mx + sway, my, seed + 0.6);
            const shade = p.constrain(0.55 + aps * 0.5, 0.3, 1.25);
            const col = colFor(s.kind, s.depth, shade);
            drawList.push({ rz: brz, ax, ay, bx, by, w: s.w * (aps + bps) * 0.5, col, glow: s.depth >= maxDepth - 2 });
          }

          const sparks: { rz: number; x: number; y: number; ps: number; a: number; fl: number; col: number[] }[] = [];
          for (let i = 0; i < leaves.length; i++) {
            const L = leaves[i];
            const bl = p.constrain((eLife - L.bloom0) / 0.12, 0, 1);
            if (bl <= 0.02) continue;
            let a = bl * 255;
            if (wl > 0) a *= 1 - p.min(1, wl * 1.4);
            if (a < 6) continue;
            const fl = p.sin(t * 2 + i) * 0.5 + 0.5;
            const seed = i * 0.9 + t * 0.5;
            const sway = p.sin(t * 0.8 + L.depth * 0.5 + i) * L.depth * 0.5;
            const [sx, sy, sps, srz] = proj(L.x + sway, L.y, seed);
            sparks.push({ rz: srz, x: sx, y: sy, ps: sps, a, fl, col: v.spark });
          }

          drawList.sort((a, b) => a.rz - b.rz);
          for (const d of drawList) {
            if (d.glow) {
              buf.stroke(d.col[0], d.col[1], d.col[2], 70);
              buf.strokeWeight(p.max(1, d.w * 2.1));
              buf.line(d.ax, d.ay, d.bx, d.by);
            }
            buf.stroke(d.col[0], d.col[1], d.col[2]);
            buf.strokeWeight(p.max(0.8, d.w));
            buf.line(d.ax, d.ay, d.bx, d.by);
            buf.stroke(p.min(255, d.col[0] * 1.3 + 30), p.min(255, d.col[1] * 1.3 + 30), p.min(255, d.col[2] * 1.3 + 30), 120);
            buf.strokeWeight(p.max(0.4, d.w * 0.4));
            buf.line(d.ax, d.ay, d.bx, d.by);
          }
          buf.noStroke();

          sparks.sort((a, b) => a.rz - b.rz);
          for (const s of sparks) {
            const r = (2.2 + s.fl * 2.4) * s.ps;
            buf.fill(s.col[0], s.col[1], s.col[2], s.a * 0.35);
            buf.ellipse(s.x, s.y, r * 2.6, r * 2.6);
            buf.fill(s.col[0], s.col[1], s.col[2], s.a);
            buf.ellipse(s.x, s.y, r, r);
          }

          drawB(cx, cy + BUF_H * 0.085, eLife, wl);
          buf.loadPixels();
        }

        function drawB(cx: number, cy: number, lf: number, wl: number) {
          const appear = p.constrain((lf - 0.2) / 0.5, 0, 1);
          if (appear <= 0.01) return;
          const v = variants[curV];
          const pulse = 0.9 + breath * 0.16;
          const alpha = 255 * appear * (1 - wl * 0.7);
          const h = BUF_H * 0.135 * (0.6 + appear * 0.4);
          const wv = h * 0.62;
          const x0 = cx - wv * 0.42;

          buf.push();
          buf.translate(cx, cy);
          buf.noStroke();
          buf.fill(v.spark[0], v.spark[1], v.spark[2], alpha * 0.10);
          buf.ellipse(0, 0, wv * 2.6 * pulse, h * 2.1 * pulse);
          buf.translate(-cx, -cy);

          buf.noFill();
          buf.stroke(v.spark[0], v.spark[1], v.spark[2], alpha);
          buf.strokeWeight(h * 0.12 * pulse);
          buf.strokeCap(p.ROUND);
          buf.line(x0, cy - h * 0.5, x0, cy + h * 0.5);
          buf.beginShape();
          buf.vertex(x0, cy - h * 0.5);
          (buf as any).bezierVertex(x0 + wv * 1.25, cy - h * 0.52, x0 + wv * 1.25, cy - h * 0.02, x0, cy);
          buf.endShape();
          buf.beginShape();
          buf.vertex(x0, cy);
          (buf as any).bezierVertex(x0 + wv * 1.45, cy - h * 0.02, x0 + wv * 1.45, cy + h * 0.55, x0, cy + h * 0.5);
          buf.endShape();
          buf.strokeCap(p.SQUARE);
          buf.pop();
        }

        function renderToScreen() {
          const px = buf.pixels;
          const g = p.max(4, p.round(grid));
          const asciiG = p.max(g, 6);
          const scaleF = p.min(p.width / BUF_W, p.height / BUF_H) * 0.88;
          const invScale = 1 / scaleF;
          const renderW = BUF_W * scaleF, renderH = BUF_H * scaleF;
          const ox = (p.width - renderW) / 2 + mInfX;
          const oy = (p.height - renderH) / 2 + mInfY;
          const curM = renderMode, prevM = prevMode, mt = modeT;
          const transitionDone = mt >= 0.99;
          const useNative = curM === 0 || (!transitionDone && prevM === 0);
          if (useNative) { ctx.textAlign = "center"; ctx.textBaseline = "middle"; }
          const gEff = curM === 0 && transitionDone ? asciiG : g;
          const halfG = gEff * 0.5;
          const yStart = p.max(0, p.floor(oy / gEff) * gEff);
          const yEnd = p.min(p.height, oy + renderH);
          const xStart = p.max(0, p.floor(ox / gEff) * gEff);
          const xEnd = p.min(p.width, ox + renderW);
          const asciiSize = gEff * 1.15;
          let lastFontStr = "";

          for (let sy = yStart; sy < yEnd; sy += gEff) {
            const byBase = p.floor((sy - oy) * invScale);
            if (byBase < 0 || byBase >= BUF_H) continue;
            const rowOff = byBase * BUF_W;
            for (let sx = xStart; sx < xEnd; sx += gEff) {
              const bx = p.floor((sx - ox) * invScale);
              if (bx < 0 || bx >= BUF_W) continue;
              const idx = (rowOff + bx) * 4;
              const r = px[idx], gr = px[idx + 1], b = px[idx + 2];
              if (r + gr + b < 16) continue;
              const bright = r * 0.299 + gr * 0.587 + b * 0.114;
              const cxp = sx + halfG, cyp = sy + halfG;
              let mode: number;
              if (transitionDone) mode = curM;
              else {
                const hash = ((sx * 73 + sy * 137) & 0xff) * 0.00392;
                mode = hash < mt ? curM : prevM;
              }
              if (mode === 0) {
                const fontSz = p.floor(asciiSize * (0.42 + bright * 0.0038));
                const fontStr = fontSz + "px Courier New";
                if (fontStr !== lastFontStr) { ctx.font = fontStr; lastFontStr = fontStr; }
                ctx.fillStyle = "rgb(" + r + "," + gr + "," + b + ")";
                const ci = ((bright >> 2) + ((sx * 7 + sy * 13) >> 3)) % chars.length;
                ctx.fillText(chars[ci], cxp, cyp);
              } else if (mode === 1) {
                p.fill(r, gr, b);
                const d = gEff * (0.12 + bright * 0.0034);
                p.ellipse(cxp, cyp, d, d);
              } else {
                p.fill(r, gr, b);
                p.rectMode(p.CENTER);
                p.rect(cxp, cyp, gEff * 0.92, gEff * 0.92);
              }
            }
          }
        }

        p.mousePressed = function () { triggerGlitch(); };
        p.keyPressed = function () {
          if (p.key === "g" || p.key === "G") triggerGlitch();
        };
        p.windowResized = function () { p.resizeCanvas(p.windowWidth, p.windowHeight); };
      };

      instance = new p5(sketch, containerRef.current);
      p5Ref.current = instance;
    });

    return () => {
      if (p5Ref.current) {
        p5Ref.current.remove();
        p5Ref.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
      }}
    />
  );
}
