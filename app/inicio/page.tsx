"use client";

// Tela inicial — hub pós-login (ativável em Configurações). Minimalista: só o
// fundo 3D (quarto wireframe, perspectiva off-axis) + os 4 cartuchos, agora como
// OBJETOS 3D DE VERDADE (preserve-3d, 6 faces com espessura), reprojetados pela
// mesma projeção da sala → giram com a perspectiva. Sem textos. Mouse + giroscópio.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface Cart { cls: string; name: string; fases: string; href: string; icon: ReactNode }

const CARTS: Cart[] = [
  {
    cls: "c-invest", name: "Investimentos", fases: "17 fases", href: "/",
    icon: (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        <rect x="1" y="10" width="3" height="4" /><rect x="6" y="7" width="3" height="7" /><rect x="11" y="4" width="3" height="10" />
        <rect x="10" y="1" width="4" height="2" /><rect x="12" y="1" width="2" height="5" />
      </svg>
    ),
  },
  {
    cls: "c-fin", name: "Finanças", fases: "2 fases", href: "/financas",
    icon: (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        <rect x="6" y="1" width="4" height="1" /><rect x="4" y="2" width="8" height="1" /><rect x="3" y="3" width="10" height="1" />
        <rect x="2" y="4" width="12" height="6" /><rect x="3" y="10" width="10" height="1" /><rect x="4" y="11" width="8" height="1" /><rect x="6" y="12" width="4" height="1" />
        <rect className="k" x="7" y="3" width="2" height="8" /><rect className="k" x="5" y="4" width="4" height="1" /><rect className="k" x="6" y="6" width="4" height="1" /><rect className="k" x="7" y="9" width="4" height="1" />
      </svg>
    ),
  },
  {
    cls: "c-barroots", name: "Barroots", fases: "7 fases", href: "/noticias",
    icon: (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        <rect x="3" y="3" width="10" height="1" /><rect x="2" y="4" width="12" height="2" /><rect x="2" y="6" width="12" height="7" />
        <rect className="k" x="2" y="6" width="12" height="1" /><rect className="k" x="7" y="5" width="2" height="4" /><rect x="7" y="7" width="2" height="1" /><rect x="1" y="13" width="14" height="1" />
      </svg>
    ),
  },
  {
    cls: "c-config", name: "Config", fases: "ajustes", href: "/configuracoes",
    icon: (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        <rect x="2" y="2" width="4" height="4" /><rect className="k" x="2" y="2" width="2" height="2" /><rect x="5" y="5" width="2" height="2" /><rect x="7" y="7" width="2" height="2" /><rect x="9" y="9" width="2" height="2" /><rect x="11" y="11" width="3" height="3" />
      </svg>
    ),
  },
];

// Rotação de repouso por cartucho (mostra a espessura já parado): [rotX, rotY].
const BASE_ROT: [number, number][] = [[9, 15], [9, -15], [-9, 15], [-9, -15]];

export default function InicioPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    document.body.style.overflow = "hidden";

    let W = 1, H = 1;
    const D = 3.9, EYE_D = 1.3, NX = 8, NY = 5, NZ = 10;
    const Z_CART = 0.95;
    let segs: number[][] = [];
    function buildRoom() {
      segs = [];
      const L = (a: number, b: number, c: number, d: number, e: number, f: number) => segs.push([a, b, c, d, e, f]);
      let i: number, a: number, b: number;
      for (i = 0; i <= NX; i++) { a = -W + 2 * W * i / NX; L(a, -H, D, a, H, D); }
      for (i = 0; i <= NY; i++) { b = -H + 2 * H * i / NY; L(-W, b, D, W, b, D); }
      for (let s = 0; s < 2; s++) { const y = s ? H : -H;
        for (i = 0; i <= NX; i++) { a = -W + 2 * W * i / NX; L(a, y, 0, a, y, D); }
        for (i = 0; i <= NZ; i++) { const z = D * i / NZ; L(-W, y, z, W, y, z); } }
      for (let sw = 0; sw < 2; sw++) { const x = sw ? W : -W;
        for (i = 0; i <= NY; i++) { b = -H + 2 * H * i / NY; L(x, b, 0, x, b, D); }
        for (i = 0; i <= NZ; i++) { const z2 = D * i / NZ; L(x, -H, z2, x, H, z2); } }
    }
    function anchor(i: number): [number, number, number] {
      const col = (i % 2) === 0 ? -1 : 1;
      const row = i < 2 ? 1 : -1;
      return [col * 0.6 * W, row * 0.62 * H, Z_CART];
    }

    let dpr = 1, cw = 0, ch = 0, scale = 1, ox = 0, oy = 0;
    const eye = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    let raf = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = cv!.clientWidth; ch = cv!.clientHeight;
      cv!.width = cw * dpr; cv!.height = ch * dpr; ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = 1; H = W * (ch / cw); scale = cw / (2 * W); ox = cw / 2; oy = ch / 2; buildRoom();
    }
    function project(x: number, y: number, z: number): [number, number, number] {
      const t = EYE_D / (z + EYE_D);
      return [ox + (eye.x + t * (x - eye.x)) * scale, oy - (eye.y + t * (y - eye.y)) * scale, t];
    }
    function frame() {
      eye.x += (target.x - eye.x) * 0.06; eye.y += (target.y - eye.y) * 0.06;
      ctx!.clearRect(0, 0, cw, ch);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], A = project(s[0], s[1], s[2]), B = project(s[3], s[4], s[5]);
        const depth = (A[2] + B[2]) / 2, al = 0.05 + 0.45 * Math.pow(depth, 1.4);
        ctx!.lineWidth = 1.7;
        ctx!.strokeStyle = `rgba(92,240,255,${al * 0.15})`;
        ctx!.beginPath(); ctx!.moveTo(A[0], A[1]); ctx!.lineTo(B[0], B[1]); ctx!.stroke();
        ctx!.lineWidth = 0.9;
        ctx!.strokeStyle = `rgba(170,235,245,${al * 0.75})`;
        ctx!.beginPath(); ctx!.moveTo(A[0], A[1]); ctx!.lineTo(B[0], B[1]); ctx!.stroke();
      }
      const rotY = eye.x * 18, rotX = -eye.y * 18;
      for (let i = 0; i < 4; i++) {
        const slot = slotRefs.current[i]; if (!slot) continue;
        const [ax, ay, az] = anchor(i);
        const [X, Y] = project(ax, ay, az);
        const [bx, by] = BASE_ROT[i];
        slot.style.transform = `translate(${X}px,${Y}px) translate(-50%,-50%) rotateX(${bx + rotX}deg) rotateY(${by + rotY}deg)`;
      }
      raf = requestAnimationFrame(frame);
    }

    // ── Entradas — mouse ──
    const maxX = 0.7, maxY = 0.45;
    const clampU = (v: number) => (v < -1.25 ? -1.25 : v > 1.25 ? 1.25 : v);
    const onPointer = (e: PointerEvent) => {
      target.x = ((e.clientX / cw) - 0.5) * 1.1 * W; target.y = -((e.clientY / ch) - 0.5) * 0.75 * H;
    };
    document.addEventListener("pointermove", onPointer);

    // ── Giroscópio — inclinar (gravidade) + girar (bússola), auto ──
    let base: { lr: number; fb: number } | null = null, gxs = 0, gys = 0, yaw = 0, baseA: number | null = null, gyroOn = false;
    const orientAngle = () => {
      if (window.screen && screen.orientation && screen.orientation.angle != null) return screen.orientation.angle;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).orientation || 0;
    };
    const apply = () => { target.x = clampU(gxs + yaw * 0.4) * maxX * W; target.y = -gys * maxY * H; };
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
      const mag = Math.hypot(g.x!, g.y!, g.z!) || 9.8, nx = g.x! / mag, ny = g.y! / mag;
      const o = orientAngle(); let lr: number, fb: number;
      if (o === 90) { lr = -ny; fb = -nx; } else if (o === -90 || o === 270) { lr = ny; fb = nx; } else { lr = nx; fb = ny; }
      if (base == null) base = { lr, fb };
      else { base.lr += (lr - base.lr) * 0.006; base.fb += (fb - base.fb) * 0.006; }
      const dLR = lr - base.lr, dFB = fb - base.fb, DEAD = 0.02, RANGE = 0.22;
      const shape = (d: number) => { const s = d < 0 ? -1 : 1, m = Math.max(0, Math.abs(d) - DEAD); return s * Math.min(m, RANGE) / RANGE; };
      gxs += (shape(dLR) - gxs) * 0.28; gys += (shape(dFB) - gys) * 0.28; apply();
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heading = (e as any).webkitCompassHeading;
      const raw = (heading != null) ? heading : e.alpha; if (raw == null) return;
      const a = raw as number;
      let bA = baseA == null ? a : baseA;
      let d = a - bA; if (d > 180) d -= 360; if (d < -180) d += 360;
      bA = bA + d * 0.02; baseA = bA;
      const s = (heading != null) ? -1 : 1;
      yaw += ((s * Math.max(-32, Math.min(32, d)) / 32) - yaw) * 0.3; apply();
    };
    const recalibrate = () => { base = null; baseA = null; };
    const addGyro = () => { if (gyroOn) return; gyroOn = true; base = null; baseA = null;
      window.addEventListener("devicemotion", onMotion); window.addEventListener("deviceorientation", onOrient); };
    const enableGyro = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DM = window.DeviceMotionEvent as any, DO = window.DeviceOrientationEvent as any, ps: Promise<string>[] = [];
      if (DM && DM.requestPermission) ps.push(DM.requestPermission());
      if (DO && DO.requestPermission) ps.push(DO.requestPermission());
      if (ps.length) Promise.all(ps.map((p) => p.catch(() => "denied"))).then((rs) => { if (rs.indexOf("granted") >= 0) addGyro(); });
      else addGyro();
    };
    window.addEventListener("dblclick", recalibrate);
    window.addEventListener("orientationchange", recalibrate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DMc = window.DeviceMotionEvent as any, DOc = window.DeviceOrientationEvent as any;
    const precisaPermissao = (DMc && DMc.requestPermission) || (DOc && DOc.requestPermission);
    let kick: (() => void) | null = null;
    if (precisaPermissao) {
      kick = () => {
        enableGyro();
        window.removeEventListener("pointerdown", kick!, true);
        window.removeEventListener("touchstart", kick!, true);
      };
      window.addEventListener("pointerdown", kick, true);
      window.addEventListener("touchstart", kick, true);
    } else if (window.DeviceMotionEvent || window.DeviceOrientationEvent) {
      addGyro();
    }

    window.addEventListener("resize", resize);
    resize(); raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onPointer);
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("dblclick", recalibrate);
      window.removeEventListener("orientationchange", recalibrate);
      if (kick) { window.removeEventListener("pointerdown", kick, true); window.removeEventListener("touchstart", kick, true); }
      window.removeEventListener("resize", resize);
      document.body.style.overflow = "";
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div className="mih-root">
      <canvas ref={canvasRef} className="mih-bg" />
      <div className="mih-scrim" />

      <div className="mih-space">
        {CARTS.map((c, i) => (
          <button
            key={c.href}
            ref={(el) => { slotRefs.current[i] = el; }}
            className={`mih-slot ${c.cls}`}
            onClick={() => router.push(c.href)}
            aria-label={c.name}
          >
            {/* Objeto 3D — 6 faces com espessura */}
            <div className="mih-face mih-side-l" />
            <div className="mih-face mih-side-r" />
            <div className="mih-face mih-side-t" />
            <div className="mih-face mih-side-b" />
            <div className="mih-face mih-back" />
            <div className="mih-face mih-front">
              <div className="mih-ridges" />
              <div className="mih-label">
                <span className="mih-screen" aria-hidden="true">{c.icon}</span>
                <span className="mih-name">{c.name}</span>
                <span className="mih-fases"><span className="play">▶</span> {c.fases}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <style>{CSS}</style>
    </div>,
    document.body,
  );
}

const CSS = `
.mih-root{position:fixed;inset:0;z-index:60;overflow:hidden;font-family:ui-monospace,"SF Mono","Cascadia Code","Courier New",monospace;color:#e9ecd8;background:linear-gradient(180deg,#0f130c,#0c0f0a);--gold:#f0b23c;--emerald:#3ddc84;--violet:#b18bff;--dmg:#9bbc0f;--faint:#6a6f52;}
.mih-bg{position:absolute;inset:0;width:100%;height:100%;z-index:0;display:block;touch-action:none;}
.mih-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(120% 100% at 50% 46%,transparent 36%,rgba(8,10,7,0.45) 84%,rgba(8,10,7,0.8) 100%);}
.mih-root::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:6;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.18) 0 1px,transparent 1px 3px),radial-gradient(120% 100% at 50% 50%,transparent 62%,rgba(0,0,0,0.4) 100%);mix-blend-mode:multiply;}

.mih-space{position:absolute;inset:0;z-index:3;perspective:900px;pointer-events:none;}
.mih-slot{--hue:var(--gold);--w:clamp(108px,27vw,164px);--h:clamp(138px,35vw,200px);--t:clamp(14px,4.5vw,22px);
  position:absolute;top:0;left:0;width:var(--w);height:var(--h);padding:0;border:0;background:none;cursor:pointer;
  pointer-events:auto;transform-style:preserve-3d;transform-origin:center center;will-change:transform;
  filter:drop-shadow(0 20px 22px rgba(0,0,0,0.55));animation:mih-pop .45s ease both;}
.mih-slot:nth-child(1){animation-delay:.02s;}.mih-slot:nth-child(2){animation-delay:.10s;}.mih-slot:nth-child(3){animation-delay:.18s;}.mih-slot:nth-child(4){animation-delay:.26s;}
.mih-slot:focus-visible{outline:none;}
@keyframes mih-pop{from{opacity:0;}to{opacity:1;}}

.mih-face{position:absolute;top:50%;left:50%;backface-visibility:hidden;}
.mih-front,.mih-back{width:var(--w);height:var(--h);border-radius:9px;}
.mih-side-l,.mih-side-r{width:var(--t);height:var(--h);}
.mih-side-t,.mih-side-b{width:var(--w);height:var(--t);}
.mih-front{transform:translate(-50%,-50%) translateZ(calc(var(--t)/2));background:linear-gradient(165deg,#3a3d31,#202318);border:1px solid #4c4f40;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);padding:11px;display:flex;flex-direction:column;}
.mih-back{transform:translate(-50%,-50%) rotateY(180deg) translateZ(calc(var(--t)/2));background:linear-gradient(165deg,#26291f,#131610);border:1px solid #3a3d31;}
.mih-side-r{transform:translate(-50%,-50%) rotateY(90deg) translateZ(calc(var(--w)/2));background:linear-gradient(180deg,#2e3126,#171a12);}
.mih-side-l{transform:translate(-50%,-50%) rotateY(-90deg) translateZ(calc(var(--w)/2));background:linear-gradient(180deg,#2e3126,#171a12);}
.mih-side-t{transform:translate(-50%,-50%) rotateX(90deg) translateZ(calc(var(--h)/2));background:linear-gradient(90deg,#3f4335,#4a4e3e);}
.mih-side-b{transform:translate(-50%,-50%) rotateX(-90deg) translateZ(calc(var(--h)/2));background:#0f1209;}

.mih-slot:hover .mih-front{filter:brightness(1.12);}
.mih-slot:focus-visible .mih-front{box-shadow:inset 0 0 0 2px var(--hue),inset 0 1px 0 rgba(255,255,255,0.06);}

.mih-ridges{height:11px;width:58%;border-radius:3px;margin-bottom:11px;flex:none;background:repeating-linear-gradient(90deg,rgba(0,0,0,0.35) 0 3px,rgba(255,255,255,0.04) 3px 6px);}
.mih-label{flex:1;background:linear-gradient(180deg,#16190f,#10130b);border:1px solid color-mix(in srgb,var(--hue) 45%,transparent);border-radius:5px;padding:12px 10px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;box-shadow:inset 0 0 22px -8px color-mix(in srgb,var(--hue) 60%,transparent);}
.mih-screen{width:clamp(44px,12vw,58px);height:clamp(44px,12vw,58px);display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--hue) 22%,#0c0f08),#0c0f08 75%);border:2px solid color-mix(in srgb,var(--hue) 55%,transparent);border-radius:6px;box-shadow:0 0 16px -4px color-mix(in srgb,var(--hue) 70%,transparent),inset 0 0 10px rgba(0,0,0,0.6);}
.mih-screen svg{width:64%;height:64%;color:var(--hue);filter:drop-shadow(0 0 4px color-mix(in srgb,var(--hue) 70%,transparent));}
.mih-screen svg rect{fill:currentColor;}
.mih-screen svg rect.k{fill:#0c0f08;}
.mih-name{font-size:clamp(10px,2.6vw,12px);font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--hue);text-shadow:1px 1px 0 rgba(0,0,0,0.5);text-align:center;}
.mih-fases{font-size:8.5px;letter-spacing:0.14em;text-transform:uppercase;color:var(--faint);display:flex;align-items:center;gap:5px;}
.mih-slot:hover .mih-fases{color:var(--hue);}
.mih-fases .play{color:var(--hue);}
.c-invest{--hue:var(--gold);} .c-fin{--hue:var(--emerald);} .c-barroots{--hue:var(--violet);} .c-config{--hue:var(--dmg);}
@media (prefers-reduced-motion:reduce){.mih-slot{animation:none;}}
`;
