"use client";

import { useEffect, useRef } from "react";

interface Props {
  width?: number;
  height?: number;
}

export default function MoneyAnimation({ width = 48, height = 48 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5Ref = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("p5").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const p5 = mod.default;

      const sketch = function (p: any) {
        const BUF_W = 680, BUF_H = 680;
        let buf: any;
        let ctx: CanvasRenderingContext2D;
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*".split("");

        const subjects = [
          { type: "note", val: "1", name: "ONE DOLLAR", who: "WASHINGTON",
            paper: [212, 214, 196], ink: [34, 74, 48], seal: [120, 40, 40], glow: [40, 90, 55] },
          { type: "coin", kind: "gold",
            metal: { hi: [255, 228, 140], mid: [212, 168, 58], lo: [140, 100, 28] }, glow: [150, 110, 30] },
          { type: "note", val: "100", name: "ONE HUNDRED", who: "FRANKLIN",
            paper: [210, 216, 200], ink: [30, 70, 46], seal: [60, 70, 40], glow: [40, 90, 55] },
          { type: "coin", kind: "btc",
            metal: { hi: [255, 186, 96], mid: [242, 140, 38], lo: [170, 84, 18] }, glow: [210, 115, 30] },
        ] as any[];
        let cur = 0;

        let phase = "appearing", phaseT = 0;
        let appear = 0, dissolve = 0;

        let renderMode = 0, prevMode = 0, modeT = 1;
        let grid = 4, gridTarget = 4;
        const GRID_MIN = 4, GRID_MAX = 20;
        let densDir = 1, densTimer = 0;

        let t = 0;
        let spinY = 0, spinX = 0;
        let rotEaseIn = 0;
        const mInfX = 0, mInfY = 0;

        let glitchActive = false, glitchIntensity = 0, glitchSlices: any[] = [], glitchTimer = 0;

        let motes: any[] = [];
        let drops: any[] = [];
        let dropSpawnT = 0;

        const easeInOutCubic = (x: number) => x < 0.5 ? 4 * x * x * x : 1 - p.pow(-2 * x + 2, 3) / 2;
        const easeOutQuart = (x: number) => 1 - p.pow(1 - x, 4);

        p.setup = function () {
          const canvas = p.createCanvas(width, height);
          canvas.style("display", "block");
          p.pixelDensity(1);
          p.textFont("Courier New, monospace");
          p.textAlign(p.CENTER, p.CENTER);
          p.noStroke();
          buf = p.createGraphics(BUF_W, BUF_H);
          buf.pixelDensity(1);
          buf.noSmooth();
          buf.textFont("Courier New, monospace");
          buf.canvas.getContext("2d", { willReadFrequently: true });
          ctx = p.drawingContext;
          initMotes();
          startSubject(0);
        };

        function startSubject(idx: number) {
          cur = idx;
          phase = "appearing"; phaseT = 0;
          appear = 0; dissolve = 0;
          grid = GRID_MIN; gridTarget = GRID_MIN; densDir = 1; densTimer = 0;
          modeT = 1; drops = []; dropSpawnT = 0;
        }

        function initMotes() {
          motes = [];
          for (let i = 0; i < 30; i++) {
            motes.push({ x: p.random(BUF_W), y: p.random(BUF_H), sp: p.random(4, 12),
              drift: p.random(p.TWO_PI), depth: p.random(0.3, 1), sz: p.random(2, 5) });
          }
        }
        function updateMotes(dt: number) {
          for (const m of motes) {
            m.drift += dt * 0.5;
            m.y -= m.sp * dt * m.depth;
            m.x += p.cos(m.drift) * 7 * dt;
            if (m.y < -10) { m.y = BUF_H + 10; m.x = p.random(BUF_W); }
          }
        }
        function drawMotes(g: any) {
          const s = subjects[cur];
          for (const m of motes) {
            const tw = 0.35 + 0.5 * (0.5 + 0.5 * p.sin(m.drift * 3));
            g.fill(s.glow[0] * 1.6, s.glow[1] * 1.6, s.glow[2] * 1.6, 110 * tw * m.depth);
            const d = m.sz * m.depth;
            g.ellipse(m.x, m.y, d, d);
          }
        }

        function spawnDrop(burst: boolean) {
          const s = subjects[cur];
          drops.push({
            type: s.type, kind: (s as any).kind,
            x: burst ? BUF_W / 2 + p.random(-120, 120) : p.random(BUF_W),
            y: burst ? BUF_H * 0.44 : -40,
            vx: p.random(-18, 18), vy: burst ? p.random(-26, 8) : p.random(20, 46),
            rot: p.random(p.TWO_PI), vrot: p.random(-3, 3),
            sz: p.random(26, 46), flip: p.random(p.TWO_PI), flipSp: p.random(2, 5),
            col1: s.type === "note" ? s.paper : s.metal.mid,
            col2: s.type === "note" ? s.ink : s.metal.lo,
            val: s.type === "note" ? s.val : null,
            life: 0, maxLife: p.random(4, 7)
          });
        }
        function moneyRain(n: number) { for (let i = 0; i < n; i++) spawnDrop(true); }
        void moneyRain;
        function updateDrops(dt: number) {
          for (let i = drops.length - 1; i >= 0; i--) {
            const b = drops[i];
            b.life += dt; b.flip += dt * b.flipSp; b.vy += dt * 22;
            b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vrot * dt;
            if (b.life > b.maxLife || b.y > BUF_H + 60) drops.splice(i, 1);
          }
        }
        function drawDrops(g: any) {
          for (const b of drops) {
            const a = 255 * p.constrain(1 - (b.life - (b.maxLife - 1.4)) / 1.4, 0, 1);
            if (a < 5) continue;
            const sx = p.abs(p.cos(b.flip));
            g.push(); g.translate(b.x, b.y); g.rotate(b.rot);
            if (b.type === "note") {
              const w = b.sz * p.max(0.12, sx), h = b.sz * 0.46;
              g.noStroke(); g.fill(b.col1[0], b.col1[1], b.col1[2], a);
              g.rectMode(p.CENTER); g.rect(0, 0, w, h, 3);
              g.noFill(); g.stroke(b.col2[0], b.col2[1], b.col2[2], a * 0.8); g.strokeWeight(1);
              g.rect(0, 0, w * 0.84, h * 0.7, 2);
              if (w > 12) { g.noStroke(); g.fill(b.col2[0], b.col2[1], b.col2[2], a);
                g.textSize(h * 0.5); g.text(b.val, 0, 0); }
            } else {
              const w = b.sz * p.max(0.14, sx);
              g.noStroke(); g.fill(b.col1[0], b.col1[1], b.col1[2], a);
              g.ellipse(0, 0, w, b.sz);
              g.noFill(); g.stroke(b.col2[0], b.col2[1], b.col2[2], a); g.strokeWeight(1.4);
              g.ellipse(0, 0, w * 0.8, b.sz * 0.8);
            }
            g.rectMode(p.CORNER); g.noStroke();
            g.pop();
          }
        }

        function drawNote(g: any, f: any, w: number, h: number, back: boolean, alpha: number) {
          const ink = f.ink, paper = f.paper;
          g.rectMode(p.CENTER);
          g.noStroke(); g.fill(paper[0], paper[1], paper[2], alpha);
          g.rect(0, 0, w, h, h * 0.05);
          g.stroke(ink[0], ink[1], ink[2], alpha * 0.16); g.strokeWeight(1); g.noFill();
          for (let k = -3; k <= 3; k++) {
            g.beginShape();
            for (let xx = -w / 2; xx <= w / 2; xx += w / 26)
              g.vertex(xx, k * h * 0.085 + p.sin(xx * 0.06 + k + t * 0.5) * 4);
            g.endShape();
          }
          g.stroke(ink[0], ink[1], ink[2], alpha); g.strokeWeight(p.max(1, w * 0.006)); g.noFill();
          g.rect(0, 0, w * 0.95, h * 0.86, h * 0.05);
          g.strokeWeight(1); g.rect(0, 0, w * 0.90, h * 0.78, h * 0.04);
          const big = w > h * 1.1;
          if (!back) {
            g.noStroke(); g.fill(paper[0] * 0.92, paper[1] * 0.92, paper[2] * 0.9, alpha);
            g.ellipse(0, h * 0.04, w * 0.26, h * 0.6);
            g.stroke(ink[0], ink[1], ink[2], alpha); g.strokeWeight(1.4); g.noFill();
            g.ellipse(0, h * 0.04, w * 0.26, h * 0.6);
            g.noStroke(); g.fill(ink[0], ink[1], ink[2], alpha * 0.85);
            g.ellipse(0, 0, w * 0.09, h * 0.24);
            g.beginShape();
            g.vertex(-w * 0.1, h * 0.28); g.bezierVertex(-w * 0.08, h * 0.1, w * 0.08, h * 0.1, w * 0.1, h * 0.28);
            g.endShape();
            g.fill(paper[0], paper[1], paper[2], alpha * 0.55);
            g.arc(0, -h * 0.04, w * 0.11, h * 0.18, p.PI, p.TWO_PI);
            g.stroke(f.seal[0], f.seal[1], f.seal[2], alpha); g.strokeWeight(1.4); g.noFill();
            g.ellipse(-w * 0.34, h * 0.06, w * 0.11, w * 0.11);
            for (let sI = 0; sI < 9; sI++) { const a = (p.TWO_PI / 9) * sI;
              g.line(-w * 0.34, h * 0.06, -w * 0.34 + p.cos(a) * w * 0.05, h * 0.06 + p.sin(a) * w * 0.05); }
            g.fill(f.seal[0], f.seal[1], f.seal[2], alpha * 0.5); g.noStroke();
            g.ellipse(w * 0.34, h * 0.06, w * 0.1, w * 0.1);
            if (big) {
              g.noStroke(); g.fill(ink[0], ink[1], ink[2], alpha);
              g.textSize(h * 0.085); g.text("FEDERAL RESERVE NOTE", 0, -h * 0.34);
              g.textSize(h * 0.07); g.text("THE UNITED STATES OF AMERICA", 0, -h * 0.27);
              g.textSize(h * 0.13); g.text(f.name, 0, h * 0.36);
              g.textSize(h * 0.055); g.text("IN " + f.who + " WE TRUST", 0, h * 0.43);
            }
            g.fill(ink[0], ink[1], ink[2], alpha); g.noStroke(); g.textSize(h * 0.2);
            g.text(f.val, -w * 0.4, -h * 0.3); g.text(f.val, w * 0.4, -h * 0.3);
            g.text(f.val, -w * 0.4, h * 0.3); g.text(f.val, w * 0.4, h * 0.3);
          } else {
            g.stroke(ink[0], ink[1], ink[2], alpha); g.strokeWeight(1.4); g.noFill();
            g.ellipse(-w * 0.26, h * 0.02, w * 0.3, h * 0.62);
            g.fill(ink[0], ink[1], ink[2], alpha * 0.85); g.noStroke();
            g.triangle(-w * 0.26, -h * 0.18, -w * 0.37, h * 0.16, -w * 0.15, h * 0.16);
            g.fill(paper[0], paper[1], paper[2], alpha);
            g.triangle(-w * 0.26, -h * 0.18, -w * 0.32, -h * 0.02, -w * 0.20, -h * 0.02);
            g.fill(ink[0], ink[1], ink[2], alpha); g.ellipse(-w * 0.26, -h * 0.10, w * 0.03, h * 0.05);
            g.stroke(ink[0], ink[1], ink[2], alpha); g.strokeWeight(1.4); g.noFill();
            g.ellipse(w * 0.26, h * 0.02, w * 0.3, h * 0.62);
            g.fill(ink[0], ink[1], ink[2], alpha * 0.8); g.noStroke();
            g.beginShape();
            g.vertex(w * 0.26, -h * 0.12);
            g.bezierVertex(w * 0.36, -h * 0.04, w * 0.36, h * 0.1, w * 0.26, h * 0.12);
            g.bezierVertex(w * 0.16, h * 0.1, w * 0.16, -h * 0.04, w * 0.26, -h * 0.12);
            g.endShape();
            g.fill(paper[0], paper[1], paper[2], alpha); g.ellipse(w * 0.26, -h * 0.06, w * 0.04, h * 0.06);
            if (big) {
              g.noStroke(); g.fill(ink[0], ink[1], ink[2], alpha);
              g.textSize(h * 0.07); g.text("IN GOD WE TRUST", 0, -h * 0.28);
              g.textSize(h * 0.085); g.text("UNITED STATES OF AMERICA", 0, h * 0.26);
              g.fill(paper[0] * 0.9, paper[1] * 0.9, paper[2] * 0.9, alpha);
              g.textSize(h * 0.5); g.text(f.val, 0, 0);
            }
          }
          g.rectMode(p.CORNER); g.noStroke();
        }

        function star(g: any, n: number, rIn: number, rOut: number) {
          g.beginShape();
          for (let i = 0; i < n * 2; i++) {
            const r = (i % 2 === 0) ? rOut : rIn;
            const a = (p.PI / n) * i - p.HALF_PI;
            g.vertex(p.cos(a) * r, p.sin(a) * r);
          }
          g.endShape(p.CLOSE);
        }

        function drawGoldFace(g: any, r: number, m: any, alpha: number) {
          g.fill(m.lo[0], m.lo[1], m.lo[2], alpha * 0.85);
          for (let i = 0; i < 30; i++) { const a = (p.TWO_PI / 30) * i;
            g.ellipse(p.cos(a) * r * 0.92, p.sin(a) * r * 0.92, r * 0.07, r * 0.07); }
          g.noFill(); g.stroke(m.lo[0], m.lo[1], m.lo[2], alpha); g.strokeWeight(r * 0.04);
          g.ellipse(0, 0, r * 1.55, r * 1.55); g.noStroke();
          g.fill(m.hi[0], m.hi[1], m.hi[2], alpha); star(g, 5, r * 0.32, r * 0.7);
          g.fill(m.lo[0], m.lo[1], m.lo[2], alpha * 0.55); star(g, 5, r * 0.16, r * 0.36);
        }

        function drawBtcFace(g: any, r: number, m: any, alpha: number) {
          g.fill(m.lo[0], m.lo[1], m.lo[2], alpha * 0.8);
          for (let i = 0; i < 32; i++) { const a = (p.TWO_PI / 32) * i;
            g.ellipse(p.cos(a) * r * 0.92, p.sin(a) * r * 0.92, r * 0.06, r * 0.06); }
          g.noFill(); g.stroke(m.lo[0], m.lo[1], m.lo[2], alpha); g.strokeWeight(r * 0.04);
          g.ellipse(0, 0, r * 1.55, r * 1.55); g.noStroke();
          const W = [255, 250, 242], s = r * 0.62;
          g.push(); g.rotate(-0.12); g.rectMode(p.CENTER);
          g.fill(W[0], W[1], W[2], alpha);
          g.rect(-s * 0.30, 0, s * 0.26, s * 1.55, s * 0.06);
          g.ellipse(s * 0.02, -s * 0.42, s * 1.0, s * 0.78);
          g.ellipse(s * 0.08, s * 0.46, s * 1.12, s * 0.86);
          g.fill(m.mid[0], m.mid[1], m.mid[2], alpha);
          g.ellipse(s * 0.06, -s * 0.42, s * 0.42, s * 0.34);
          g.ellipse(s * 0.12, s * 0.46, s * 0.5, s * 0.4);
          g.rect(-s * 0.62, 0, s * 0.5, s * 1.7);
          g.fill(W[0], W[1], W[2], alpha);
          g.rect(-s * 0.30, 0, s * 0.26, s * 1.55, s * 0.06);
          g.rect(-s * 0.04, -s * 0.95, s * 0.10, s * 0.4);
          g.rect(s * 0.22, -s * 0.95, s * 0.10, s * 0.4);
          g.rect(-s * 0.04, s * 0.95, s * 0.10, s * 0.4);
          g.rect(s * 0.22, s * 0.95, s * 0.10, s * 0.4);
          g.rectMode(p.CORNER); g.pop();
        }

        function drawCoin(g: any, s: any, r: number, absX: number, back: boolean, alpha: number) {
          const m = s.metal;
          g.rectMode(p.CENTER); g.noStroke();
          const faceW = 2 * r * absX;
          const T = r * 0.18;
          const silW = p.max(T, faceW);
          g.fill(m.lo[0], m.lo[1], m.lo[2], alpha);
          g.rect(0, 0, silW, 2 * r, T * 0.6);
          if (silW - faceW > 2) {
            g.stroke(m.hi[0], m.hi[1], m.hi[2], alpha * 0.4); g.strokeWeight(1);
            for (let yy = -r + 5; yy < r - 5; yy += 6) g.line(-silW / 2 + 1, yy, silW / 2 - 1, yy);
            g.noStroke();
          }
          if (faceW > 3) {
            for (let i = 8; i >= 1; i--) {
              const k = i / 8;
              g.fill(p.lerp(m.mid[0], m.hi[0], k), p.lerp(m.mid[1], m.hi[1], k),
                p.lerp(m.mid[2], m.hi[2], k), alpha);
              g.ellipse(0, -2, faceW * k, 2 * r * k);
            }
            g.noFill(); g.stroke(m.lo[0], m.lo[1], m.lo[2], alpha); g.strokeWeight(p.max(1.5, r * 0.03));
            g.ellipse(0, 0, faceW * 0.95, 2 * r * 0.95); g.noStroke();
            g.push();
            g.scale(absX * (back ? -1 : 1), 1);
            if (s.kind === "btc") drawBtcFace(g, r * 0.74, m, alpha);
            else drawGoldFace(g, r * 0.74, m, alpha);
            g.pop();
          }
          g.rectMode(p.CORNER); g.noStroke();
        }

        function drawSubjectToBuffer(s: any, ap: number, di: number) {
          buf.background(0);
          buf.noStroke();
          drawMotes(buf);
          const eApp = easeOutQuart(ap);
          const cx = BUF_W / 2, cy = BUF_H * 0.44 + (1 - eApp) * 240;
          const sX = p.cos(spinY);
          const back = sX < 0;
          const absX = p.max(0.05, p.abs(sX));
          buf.push();
          buf.translate(cx, cy);
          buf.rotate(p.sin(spinX) * 0.10);
          buf.shearX(p.sin(t * 0.3) * 0.05);
          if (eApp > 0.01) {
            const alpha = 255 * eApp * (1 - di);
            if (s.type === "note") {
              const w = 470 * absX * (0.6 + 0.4 * eApp) * (1 - di * 0.25);
              const h = 200 * (0.6 + 0.4 * eApp) * (1 - di * 0.1);
              if (alpha > 4) drawNote(buf, s, w, h, back, alpha);
              buf.noStroke(); buf.rectMode(p.CENTER);
              const sheen = p.sin(spinY * 2 + t) * 0.5 + 0.5;
              buf.fill(255, 255, 255, 24 * absX * eApp * (1 - di));
              buf.rect((sheen - 0.5) * w * 0.9, 0, w * 0.16, h, 4);
              buf.rectMode(p.CORNER);
            } else {
              const r = 158 * (0.6 + 0.4 * eApp) * (1 - di * 0.2);
              if (alpha > 4) drawCoin(buf, s, r, absX, back, alpha);
              buf.noStroke(); buf.rectMode(p.CENTER);
              const sheen = p.sin(spinY * 2 + t) * 0.5 + 0.5;
              buf.fill(255, 255, 255, 30 * absX * eApp * (1 - di));
              buf.rect((sheen - 0.5) * 2 * r * absX * 0.9, 0, 2 * r * absX * 0.14, 2 * r, 4);
              buf.rectMode(p.CORNER);
            }
          }
          buf.pop();
          drawDrops(buf);
          buf.loadPixels();
        }

        p.draw = function () {
          const dt = p.deltaTime / 1000;
          const s = subjects[cur];
          p.background(0);
          t += 0.016;
          rotEaseIn = p.min(1, rotEaseIn + dt * 0.1);
          const re = easeInOutCubic(rotEaseIn);
          const spinSpeed = 0.7 + dissolve * 2.5;
          spinY += dt * spinSpeed * re;
          spinX += dt * 0.5;

          if (phase === "appearing") {
            appear += (1 - appear) * 0.04; phaseT += dt;
            if (appear > 0.97) { appear = 1; phase = "showing"; phaseT = 0; }
          }

          densTimer += dt;
          if (densTimer > 0.8) {
            densTimer = 0; triggerGlitch();
            prevMode = renderMode; renderMode = (renderMode + 1) % 3; modeT = 0;
            if (densDir === 1) { gridTarget = GRID_MAX; densDir = -1; }
            else { gridTarget = GRID_MIN; densDir = 1; }
          }

          if (phase === "showing") {
            phaseT += dt;
            if (phaseT > 14) { phase = "dissolving"; phaseT = 0; triggerGlitch(); }
          }

          if (phase === "dissolving") {
            dissolve = p.min(1, dissolve + dt * 0.5); phaseT += dt;
            dropSpawnT += dt;
            if (dropSpawnT > 0.05 && drops.length < 60) { dropSpawnT = 0; spawnDrop(true); }
            if (dissolve > 0.98) { phase = "waiting"; phaseT = 0; }
          }

          if (phase === "waiting") {
            phaseT += dt;
            if (phaseT > 0.5) {
              prevMode = renderMode; renderMode = (renderMode + 1) % 3; modeT = 0;
              triggerGlitch();
              startSubject((cur + 1) % subjects.length);
            }
          }

          grid += (gridTarget - grid) * 0.08;
          modeT = p.min(1, modeT + dt * 4.0);
          updateGlitch(dt); updateMotes(dt); updateDrops(dt);
          drawSubjectToBuffer(s, appear, dissolve);
          glitchTimer -= dt;
          if (glitchTimer <= 0 && !glitchActive) {
            glitchTimer = p.random(3, 7);
            if (p.random() < 0.4) triggerGlitch();
          }
          drawBackdrop(s, appear * (1 - dissolve));
          renderToScreen();
          drawGlitchOverlay();
        };

        function drawBackdrop(s: any, k: number) {
          const cx = p.width / 2, cy = p.height * 0.44;
          const rad = p.max(p.width, p.height) * 0.7;
          const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          const glow = 0.05 + k * 0.07;
          gr.addColorStop(0, "rgba(" + s.glow[0] + "," + s.glow[1] + "," + s.glow[2] + "," + glow + ")");
          gr.addColorStop(0.5, "rgba(" + p.floor(s.glow[0] * 0.4) + "," + p.floor(s.glow[1] * 0.4) + "," + p.floor(s.glow[2] * 0.4) + "," + (glow * 0.4) + ")");
          gr.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = gr; ctx.fillRect(0, 0, p.width, p.height);
        }

        function triggerGlitch() {
          glitchActive = true; glitchIntensity = p.random(0.4, 1.0); glitchSlices = [];
          const scaleF = p.min(p.width / BUF_W, p.height / BUF_H) * 0.85;
          const rW = BUF_W * scaleF, rH = BUF_H * scaleF;
          const fOx = (p.width - rW) / 2 + mInfX, fOy = (p.height - rH) / 2 + mInfY;
          const numSlices = p.floor(p.random(3, 10));
          for (let i = 0; i < numSlices; i++) {
            const sy = p.random(fOy, fOy + rH);
            const sh = p.min(p.random(2, rH * 0.08), fOy + rH - sy);
            glitchSlices.push({ y: sy, h: sh, fx: fOx, fw: rW,
              offset: p.random(-80, 80) * glitchIntensity, colorShift: p.random() < 0.4,
              duration: p.random(0.08, 0.3) });
          }
        }
        function updateGlitch(dt: number) {
          if (!glitchActive) return;
          let allDone = true;
          for (const s of glitchSlices) { s.duration -= dt; if (s.duration > 0) allDone = false; else s.offset *= 0.7; }
          if (allDone) { glitchActive = false; glitchSlices = []; }
        }
        function drawGlitchOverlay() {
          if (!glitchActive || !glitchSlices.length) return;
          for (const s of glitchSlices) {
            if (p.abs(s.offset) < 0.5) continue;
            const sx = p.floor(s.fx), sy = p.floor(s.y), sw = p.floor(s.fw), sh = p.floor(s.h);
            if (sw < 1 || sh < 1) continue;
            if (s.colorShift) {
              ctx.save(); ctx.globalAlpha = 0.7; ctx.globalCompositeOperation = "lighter";
              ctx.drawImage(ctx.canvas, sx, sy, sw, sh, sx + s.offset * 1.5, sy, sw, sh);
              ctx.globalAlpha = 0.45;
              ctx.drawImage(ctx.canvas, sx, sy, sw, sh, sx - s.offset, sy, sw, sh);
              ctx.restore();
            } else {
              ctx.drawImage(ctx.canvas, sx, sy, sw, sh, sx + s.offset, sy, sw, sh);
            }
          }
        }

        function renderToScreen() {
          const px = buf.pixels;
          const g = p.max(4, p.round(grid));
          const asciiG = p.max(g, 6);
          const scaleF = p.min(p.width / BUF_W, p.height / BUF_H) * 0.85;
          const invScale = 1 / scaleF;
          const renderW = BUF_W * scaleF, renderH = BUF_H * scaleF;
          const ox = (p.width - renderW) / 2 + mInfX, oy = (p.height - renderH) / 2 + mInfY;
          const curM = renderMode, prevM = prevMode, mt = modeT;
          const transitionDone = mt >= 0.99;
          const useNative = (curM === 0) || (!transitionDone && prevM === 0);
          if (useNative) { ctx.textAlign = "center"; ctx.textBaseline = "middle"; }
          const gEff = (curM === 0 && transitionDone) ? asciiG : g;
          const halfG = gEff * 0.5;
          const yStart = p.max(0, p.floor(oy / gEff) * gEff), yEnd = p.min(p.height, oy + renderH);
          const xStart = p.max(0, p.floor(ox / gEff) * gEff), xEnd = p.min(p.width, ox + renderW);
          const asciiSize = gEff * 1.1;
          let lastFontStr = "";
          for (let sy = yStart; sy < yEnd; sy += gEff) {
            const byBase = p.floor((sy - oy) * invScale);
            if (byBase < 0 || byBase >= BUF_H) continue;
            const rowOff = byBase * BUF_W;
            for (let sx = xStart; sx < xEnd; sx += gEff) {
              const bx = p.floor((sx - ox) * invScale);
              if (bx < 0 || bx >= BUF_W) continue;
              const idx = (rowOff + bx) * 4;
              const r = px[idx], gr2 = px[idx + 1], b = px[idx + 2];
              if ((r + gr2 + b) < 12) continue;
              const bright = r * 0.299 + gr2 * 0.587 + b * 0.114;
              const cx = sx + halfG, cy = sy + halfG;
              let mode;
              if (transitionDone) mode = curM;
              else { const hash = ((sx * 73 + sy * 137) & 0xFF) * 0.00392; mode = hash < mt ? curM : prevM; }
              if (mode === 0) {
                const fontSz = p.floor(asciiSize * (0.4 + bright * 0.004));
                const fontStr = fontSz + "px Courier New";
                if (fontStr !== lastFontStr) { ctx.font = fontStr; lastFontStr = fontStr; }
                ctx.fillStyle = "rgb(" + r + "," + gr2 + "," + b + ")";
                const ci = ((bright >> 2) + ((sx * 7 + sy * 13) >> 3)) % chars.length;
                ctx.fillText(chars[ci], cx, cy);
              } else if (mode === 1) {
                p.fill(r, gr2, b); const d = gEff * (0.1 + bright * 0.0033); p.ellipse(cx, cy, d, d);
              } else {
                p.fill(r, gr2, b); p.rectMode(p.CENTER); p.rect(cx, cy, gEff * 0.93, gEff * 0.93);
              }
            }
          }
        }

        p.windowResized = function () {
          // no-op: fixed size
        };
      };

      p5Ref.current = new p5(sketch, containerRef.current);
    });

    return () => {
      cancelled = true;
      if (p5Ref.current) {
        p5Ref.current.remove();
        p5Ref.current = null;
      }
    };
  }, [width, height]);

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        overflow: "hidden",
        borderRadius: 6,
        flexShrink: 0,
      }}
    />
  );
}
