// ─────────────────────────────────────────────────────────────────────────────
// Easter-egg do hub (/inicio): Goku × Vegeta lutando DENTRO do espaço 3D.
//
// Figuras estilizadas em canvas 2D, projetadas pela MESMA projeção off-axis da
// sala (a função `project` do hub) — então lutam no corredor, respeitando a
// perspectiva e o head tracking. Coreografia em fases: entrada → troca de golpes
// → repulsão → carga (SSJ) → kamehameha/galick → recuperação, alternando quem
// ataca a cada rodada. Puro desenho; nada pesado.
// ─────────────────────────────────────────────────────────────────────────────

type P3 = (x: number, y: number, z: number) => [number, number, number];
type Who = "goku" | "vegeta";

interface Fighter { x: number; y: number; z: number; face: number; ssj: boolean; punch: number; charge: number }
interface FX { kind: "spark" | "ring"; x: number; y: number; z: number; t: number; life: number; color: string; vx: number; vy: number; r: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const PHASES = [
  { n: "enter", d: 1.3 }, { n: "clash", d: 2.6 }, { n: "knock", d: 0.9 },
  { n: "charge", d: 1.5 }, { n: "beam", d: 1.9 }, { n: "recover", d: 1.0 },
] as const;

export class HubBattle {
  private time = 0; private phase = 0; private pt = 0; private round = 0; private started = false;
  private g: Fighter = { x: -0.72, y: 0.08, z: 2.05, face: 1, ssj: false, punch: 0, charge: 0 };
  private v: Fighter = { x: 0.72, y: 0.08, z: 2.0, face: -1, ssj: false, punch: 0, charge: 0 };
  private fx: FX[] = [];
  private beam = { on: false, from: "goku" as Who, p: 0 };
  private lastPunchBucket = -1;

  step(dt: number) {
    dt = Math.min(dt, 0.05); this.time += dt; this.pt += dt;
    const ph = PHASES[this.phase];
    const p = clamp(this.pt / ph.d, 0, 1);
    const chargerG = this.round % 2 === 0;
    const A = chargerG ? this.g : this.v;   // atacante
    const B = chargerG ? this.v : this.g;   // defensor

    this.g.punch *= 0.82; this.v.punch *= 0.82;
    const gHome = -0.72, vHome = 0.72;

    if (ph.n === "enter") {
      const e = easeIO(p);
      this.g.x = lerp(-1.1, -0.16, e); this.g.z = lerp(2.5, 1.75, e); this.g.y = lerp(0.28, 0.08, e);
      this.v.x = lerp(1.1, 0.16, e); this.v.z = lerp(2.5, 1.75, e); this.v.y = lerp(-0.12, 0.08, e);
      this.g.ssj = this.v.ssj = false; this.g.charge = this.v.charge = 0; this.beam.on = false;
    } else if (ph.n === "clash") {
      const wob = Math.sin(this.time * 17) * 0.05;
      this.g.x = -0.15 + Math.sin(this.time * 7) * 0.04; this.g.y = 0.08 + wob; this.g.z = 1.72;
      this.v.x = 0.15 - Math.sin(this.time * 7) * 0.04; this.v.y = 0.08 - wob; this.v.z = 1.72;
      const bucket = Math.floor(this.pt / 0.16);
      if (bucket !== this.lastPunchBucket) {
        this.lastPunchBucket = bucket;
        const who = bucket % 2 === 0 ? this.g : this.v;
        who.punch = 1;
        this.spark((this.g.x + this.v.x) / 2, 0.08 + (Math.random() - 0.5) * 0.14, 1.7, who === this.g ? "#bfe6ff" : "#ffd0f0");
      }
    } else if (ph.n === "knock") {
      const e = easeIO(p);
      this.g.x = lerp(-0.16, gHome, e); this.g.z = lerp(1.72, 2.05, e); this.g.y = 0.08 + Math.sin(p * Math.PI) * 0.16;
      this.v.x = lerp(0.16, vHome, e); this.v.z = lerp(1.72, 2.0, e); this.v.y = 0.08 - Math.sin(p * Math.PI) * 0.14;
      if (this.started) this.ring(0, 0.08, 1.7, "#eafaff");
    } else if (ph.n === "charge") {
      A.ssj = true; A.charge = easeIO(p); B.ssj = false; B.charge = 0;
      if (Math.random() < 0.45) this.spark(A.x + (Math.random() - 0.5) * 0.18, A.y + (Math.random() - 0.5) * 0.24, A.z, chargerG ? "#ffe23a" : "#ffd23a");
    } else if (ph.n === "beam") {
      A.ssj = true; A.charge = 1; this.beam.on = true; this.beam.from = chargerG ? "goku" : "vegeta"; this.beam.p = easeIO(clamp(p * 1.25, 0, 1));
      B.x += (chargerG ? 1 : -1) * dt * 0.14 * this.beam.p;   // empurra o defensor
      B.charge = Math.min(0.5, B.charge + dt);                 // defensor "segura"
      if (Math.random() < 0.6) this.spark(A.x + A.face * 0.32, A.y, A.z, chargerG ? "#8fe8ff" : "#e79bff");
    } else { // recover
      this.beam.on = false; this.g.ssj = this.v.ssj = false; this.g.charge = this.v.charge = 0;
      this.g.x = lerp(this.g.x, gHome, 0.06); this.v.x = lerp(this.v.x, vHome, 0.06);
      this.g.z = lerp(this.g.z, 2.05, 0.06); this.v.z = lerp(this.v.z, 2.0, 0.06);
    }

    this.g.face = this.g.x <= this.v.x ? 1 : -1; this.v.face = -this.g.face;

    for (const f of this.fx) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    this.fx = this.fx.filter((f) => f.t < f.life);

    this.started = false;
    if (this.pt >= ph.d) { this.pt = 0; this.phase = (this.phase + 1) % PHASES.length; if (this.phase === 0) this.round++; this.started = true; this.lastPunchBucket = -1; }
  }

  private spark(x: number, y: number, z: number, color: string) {
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.283, s = 0.15 + Math.random() * 0.35; this.fx.push({ kind: "spark", x, y, z, t: 0, life: 0.28 + Math.random() * 0.22, color, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 0 }); }
  }
  private ring(x: number, y: number, z: number, color: string) { this.fx.push({ kind: "ring", x, y, z, t: 0, life: 0.6, color, vx: 0, vy: 0, r: 0 }); }

  // ── Render ──────────────────────────────────────────────────────────────
  draw(ctx: CanvasRenderingContext2D, P: P3, scale: number) {
    // efeitos atrás
    for (const f of this.fx) {
      const [sx, sy, t] = P(f.x, f.y, f.z); const k = t * scale; const a = 1 - f.t / f.life;
      if (f.kind === "ring") {
        ctx.strokeStyle = `rgba(230,250,255,${a * 0.7})`; ctx.lineWidth = Math.max(1, k * 0.02);
        ctx.beginPath(); ctx.arc(sx, sy, (f.t / f.life) * k * 0.7, 0, 6.283); ctx.stroke();
      } else {
        ctx.fillStyle = f.color; ctx.globalAlpha = clamp(a, 0, 1);
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, k * 0.016), 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    // beam sob os lutadores? não — desenha depois do atacante. Ordena por z (mais fundo primeiro).
    const order: Array<{ f: Fighter; who: Who }> = [{ f: this.g, who: "goku" as Who }, { f: this.v, who: "vegeta" as Who }].sort((a, b) => b.f.z - a.f.z);
    for (const o of order) this.fighter(ctx, P, scale, o.f, o.who);
    if (this.beam.on) this.drawBeam(ctx, P, scale);
  }

  private drawBeam(ctx: CanvasRenderingContext2D, P: P3, scale: number) {
    const chargerG = this.beam.from === "goku";
    const A = chargerG ? this.g : this.v, B = chargerG ? this.v : this.g;
    const [ax, ay, at] = P(A.x + A.face * 0.34, A.y, A.z);
    const [bx, by] = P(B.x, B.y, B.z);
    const ex = lerp(ax, bx + (bx - ax) * 0.25, this.beam.p), ey = lerp(ay, by, this.beam.p);
    const k = at * scale;
    const core = chargerG ? "#eaffff" : "#ffffff";
    const glow = chargerG ? "150,225,255" : "205,140,255";
    ctx.lineCap = "round";
    for (const [w, col] of [[k * 0.26, `rgba(${glow},0.28)`], [k * 0.15, `rgba(${glow},0.6)`], [k * 0.07, core]] as [number, string][]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    }
    // orbe de origem
    const orb = ctx.createRadialGradient(ax, ay, 0, ax, ay, k * 0.22);
    orb.addColorStop(0, core); orb.addColorStop(0.5, `rgba(${glow},0.8)`); orb.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = orb; ctx.beginPath(); ctx.arc(ax, ay, k * 0.22, 0, 6.283); ctx.fill();
    // impacto no defensor
    if (this.beam.p > 0.9) { ctx.fillStyle = `rgba(${glow},0.5)`; ctx.beginPath(); ctx.arc(ex, ey, k * 0.16, 0, 6.283); ctx.fill(); }
  }

  private fighter(ctx: CanvasRenderingContext2D, P: P3, scale: number, f: Fighter, who: Who) {
    const [sx, sy, t] = P(f.x, f.y, f.z); if (t <= 0) return;
    const S = t * scale * 0.5; if (S < 5) return;
    const dir = f.face, gold = f.ssj;
    const gi = who === "goku" ? "#e8641e" : "#22459c";
    const trim = who === "goku" ? "#1f74b6" : "#e6ecf7";
    const skin = "#f4c79a";
    const hair = gold ? "#ffe23a" : "#191c22";
    const glove = who === "goku" ? skin : "#eef2fb";

    const feetY = sy + S * 0.35, hipY = feetY - S * 0.5, shoY = feetY - S * 0.9, headY = feetY - S * 1.08, hr = S * 0.15;

    // aura
    const auraR = S * (0.85 + f.charge * 0.7), ac = gold ? "255,220,60" : who === "goku" ? "120,200,255" : "150,120,255";
    const ag = ctx.createRadialGradient(sx, feetY - S * 0.6, 0, sx, feetY - S * 0.6, auraR);
    ag.addColorStop(0, `rgba(${ac},${0.22 + f.charge * 0.4})`); ag.addColorStop(1, `rgba(${ac},0)`);
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(sx, feetY - S * 0.6, auraR, 0, 6.283); ctx.fill();

    const cap = (x1: number, y1: number, x2: number, y2: number, w: number, col: string) => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    const dot = (x: number, y: number, r: number, col: string) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); };

    // pernas + botas
    cap(sx, hipY, sx - S * 0.12, feetY, S * 0.11, gi); cap(sx, hipY, sx + S * 0.12, feetY, S * 0.11, gi);
    dot(sx - S * 0.12, feetY, S * 0.06, who === "goku" ? "#1a1f16" : "#f2f5fb"); dot(sx + S * 0.12, feetY, S * 0.06, who === "goku" ? "#1a1f16" : "#f2f5fb");
    // tronco
    ctx.fillStyle = gi; this.rr(ctx, sx - S * 0.16, shoY, S * 0.32, hipY - shoY, S * 0.06); ctx.fill();
    ctx.fillStyle = trim; ctx.fillRect(sx - S * 0.16, hipY - S * 0.06, S * 0.32, S * 0.06);   // faixa/cinto
    if (who === "goku") { ctx.fillStyle = "#1f74b6"; ctx.fillRect(sx - S * 0.05, shoY, S * 0.1, hipY - shoY); }  // camiseta azul

    // braços — frente (soco/carga) e trás
    let hx: number, hy: number;
    if (f.charge > 0.2 && who === "goku") { hx = sx - dir * S * 0.36; hy = hipY - S * 0.02; }        // kamehameha na cintura
    else if (f.charge > 0.2) { hx = sx + dir * (0.36 + 0.12 * f.charge) * S; hy = shoY + S * 0.05; } // galick à frente
    else { hx = sx + dir * (0.2 + f.punch * 0.3) * S; hy = shoY + S * 0.05 + f.punch * S * 0.02; }
    cap(sx + dir * S * 0.12, shoY + S * 0.04, hx, hy, S * 0.09, skin); dot(hx, hy, S * 0.075, glove);
    const bx = sx - dir * S * 0.16, by = shoY + S * 0.14;
    cap(sx - dir * S * 0.1, shoY + S * 0.04, bx, by, S * 0.085, skin); dot(bx, by, S * 0.07, glove);

    // cabeça + cabelo
    dot(sx, headY, hr, skin);
    if (who === "goku") this.hairGoku(ctx, sx, headY, hr, S, hair); else this.hairVegeta(ctx, sx, headY, hr, S, dir, hair);
    // olhos (só um traço)
    ctx.fillStyle = "#20242c"; ctx.fillRect(sx + dir * hr * 0.15, headY - hr * 0.05, hr * 0.5, Math.max(1, S * 0.02));

    if (gold) { ctx.strokeStyle = "rgba(255,240,160,0.85)"; ctx.lineWidth = Math.max(1, S * 0.015); ctx.beginPath(); ctx.arc(sx, headY, hr + S * 0.01, 0, 6.283); ctx.stroke(); }
  }

  private hairGoku(ctx: CanvasRenderingContext2D, cx: number, cy: number, hr: number, S: number, col: string) {
    ctx.fillStyle = col;
    for (const deg of [-78, -52, -26, 0, 26, 52, 78]) {
      const a = deg * Math.PI / 180, bx = cx + Math.sin(a) * hr * 0.85, by = cy - Math.cos(a) * hr * 0.85;
      const tx = cx + Math.sin(a) * hr * 2.05, ty = cy - Math.cos(a) * hr * 2.0;
      const px = Math.cos(a) * hr * 0.42, py = Math.sin(a) * hr * 0.42;
      ctx.beginPath(); ctx.moveTo(bx - px, by - py); ctx.lineTo(tx, ty); ctx.lineTo(bx + px, by + py); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy - hr * 0.15, hr * 0.95, Math.PI, 0); ctx.fill();   // base do cabelo
  }

  private hairVegeta(ctx: CanvasRenderingContext2D, cx: number, cy: number, hr: number, S: number, dir: number, col: string) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy - hr * 0.15, hr * 0.98, Math.PI, 0); ctx.fill();   // base
    // grande chama pra cima e pra trás
    ctx.beginPath();
    ctx.moveTo(cx - hr * 0.95, cy - hr * 0.2);
    ctx.lineTo(cx - dir * hr * 0.35, cy - hr * 2.35);
    ctx.lineTo(cx + hr * 0.95, cy - hr * 0.2);
    ctx.closePath(); ctx.fill();
    // bico na testa (widow's peak)
    ctx.beginPath(); ctx.moveTo(cx - hr * 0.5, cy - hr * 0.55); ctx.lineTo(cx, cy - hr * 0.05); ctx.lineTo(cx + hr * 0.5, cy - hr * 0.55); ctx.closePath(); ctx.fill();
  }

  private rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}
