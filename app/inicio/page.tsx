"use client";

// Tela inicial — hub pós-login (ativável em Configurações). Só o fundo 3D
// (quarto wireframe, perspectiva off-axis) + os 4 cartuchos como OBJETOS 3D
// (preserve-3d, 6 faces com espessura), reprojetados pela mesma projeção da
// sala → giram com a perspectiva. Mouse, arrastar o dedo e giroscópio.

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

// Sem rotação de repouso: em repouso os cartuchos ficam RETOS, alinhados com o
// fundo (de frente). O topo/laterais só aparecem quando o celular é movido.
const BASE_ROT: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]];

export default function InicioPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const objRefs = useRef<Array<HTMLDivElement | null>>([]);
  const enableGyroRef = useRef<() => void>(() => {});
  const startCamRef = useRef<() => void>(() => {});
  const stopCamRef = useRef<() => void>(() => {});
  const [mounted, setMounted] = useState(false);
  const [showGyroBtn, setShowGyroBtn] = useState(false);
  const [camState, setCamState] = useState<"off" | "loading" | "on" | "error">("off");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    document.body.style.overflow = "hidden";

    let W = 1, H = 1;
    const D = 3.9, NX = 8, NY = 5, NZ = 10;
    const EYE_D0 = 1.3; let EYE_D = EYE_D0;   // dolly: cabeça mais perto → EYE_D menor
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
    let raf = 0, headActive = false;   // head tracking tem precedência sobre mouse/gyro

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
      const rotY = eye.x * 16, rotX = -eye.y * 16;
      for (let i = 0; i < 4; i++) {
        const slot = slotRefs.current[i], obj = objRefs.current[i]; if (!slot || !obj) continue;
        const [ax, ay, az] = anchor(i);
        const [X, Y] = project(ax, ay, az);
        const [bx, by] = BASE_ROT[i];
        // Posição (paralaxe) no slot; ROTAÇÃO no obj — que tem perspectiva PRÓPRIA
        // centrada nele. Assim cada card fica reto (sem distorção off-axis do
        // ponto de fuga único) e só mostra topo/lado quando gira.
        slot.style.transform = `translate(${X}px,${Y}px) translate(-50%,-50%)`;
        obj.style.transform = `rotateX(${bx + rotX}deg) rotateY(${by + rotY}deg)`;
      }
      raf = requestAnimationFrame(frame);
    }

    // ── Entradas — mouse + dedo (sem permissão) ──
    const maxX = 0.7, maxY = 0.45;
    const clampU = (v: number) => (v < -1.25 ? -1.25 : v > 1.25 ? 1.25 : v);
    const onPointer = (e: PointerEvent) => {
      if (headActive) return;
      target.x = ((e.clientX / cw) - 0.5) * 1.1 * W; target.y = -((e.clientY / ch) - 0.5) * 0.75 * H;
    };
    document.addEventListener("pointermove", onPointer);
    const onTouchMove = (e: TouchEvent) => {
      if (headActive) return;
      const t = e.touches[0]; if (!t) return;
      target.x = ((t.clientX / cw) - 0.5) * 1.1 * W; target.y = -((t.clientY / ch) - 0.5) * 0.75 * H;
    };
    document.addEventListener("touchmove", onTouchMove, { passive: true });

    // ── Giroscópio — inclinar (gravidade) + girar (bússola) ──
    let base: { lr: number; fb: number } | null = null, gxs = 0, gys = 0, yaw = 0, baseA: number | null = null, gyroOn = false;
    const orientAngle = () => {
      if (window.screen && screen.orientation && screen.orientation.angle != null) return screen.orientation.angle;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).orientation || 0;
    };
    const apply = () => { if (headActive) return; target.x = clampU(gxs + yaw * 0.4) * maxX * W; target.y = -gys * maxY * H; };
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
      window.addEventListener("devicemotion", onMotion); window.addEventListener("deviceorientation", onOrient); setShowGyroBtn(false); };
    const enableGyro = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DM = window.DeviceMotionEvent as any, DO = window.DeviceOrientationEvent as any, ps: Promise<string>[] = [];
      if (DM && DM.requestPermission) ps.push(DM.requestPermission());
      if (DO && DO.requestPermission) ps.push(DO.requestPermission());
      if (ps.length) Promise.all(ps.map((p) => p.catch(() => "denied"))).then((rs) => { if (rs.indexOf("granted") >= 0) addGyro(); });
      else addGyro();
    };
    enableGyroRef.current = enableGyro;
    window.addEventListener("dblclick", recalibrate);
    window.addEventListener("orientationchange", recalibrate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DMc = window.DeviceMotionEvent as any, DOc = window.DeviceOrientationEvent as any;
    const precisaPermissao = (DMc && DMc.requestPermission) || (DOc && DOc.requestPermission);
    if (precisaPermissao) setShowGyroBtn(true);         // iOS: botão pra liberar o sensor
    else if (window.DeviceMotionEvent || window.DeviceOrientationEvent) addGyro();

    // ── Head tracking (webcam, on-device) — o efeito "janela" que segue a cabeça ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tracker: any = null;
    const startCam = async () => {
      if (tracker) return;
      setCamState("loading");
      try {
        const { HeadTracker } = await import("@/lib/head-tracker");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tracker = new HeadTracker((h: { x: number; y: number; z: number; ok: boolean }) => {
          if (!h.ok) return;
          headActive = true;
          target.x = clampU(h.x * 6) * W;            // ganho de cabeça → paralaxe
          target.y = clampU(-h.y * 6) * 0.72 * H;
          EYE_D = Math.max(0.95, Math.min(1.7, EYE_D0 * (1 - h.z * 0.5)));   // dolly
        });
        await tracker.start();
        setCamState("on");
      } catch { tracker = null; headActive = false; setCamState("error"); }
    };
    const stopCam = () => {
      if (tracker) { tracker.stop(); tracker = null; }
      headActive = false; EYE_D = EYE_D0; target.x = 0; target.y = 0; setCamState("off");
    };
    startCamRef.current = () => { void startCam(); };
    stopCamRef.current = stopCam;

    window.addEventListener("resize", resize);
    resize(); raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onPointer);
      document.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("dblclick", recalibrate);
      window.removeEventListener("orientationchange", recalibrate);
      window.removeEventListener("resize", resize);
      if (tracker) { try { tracker.stop(); } catch { /* ignore */ } tracker = null; }
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
            <div className="mih-persp">
              <div className="mih-obj" ref={(el) => { objRefs.current[i] = el; }}>
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
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mih-controls">
        <button
          className="mih-ctl mih-ctl-cam"
          data-on={camState === "on"}
          onClick={() => (camState === "on" ? stopCamRef.current() : startCamRef.current())}
        >
          {camState === "on" ? "⏹ Parar câmera"
            : camState === "loading" ? "Ativando câmera…"
              : camState === "error" ? "Câmera indisponível — arraste o dedo"
                : "🎥 Head tracking"}
        </button>
        {showGyroBtn && camState !== "on" && (
          <button className="mih-ctl" onClick={() => enableGyroRef.current()}>Giroscópio</button>
        )}
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

/* Cada card tem PERSPECTIVA PRÓPRIA (centrada nele) → fica reto, sem a distorção
   off-axis do ponto de fuga único. IMPORTANTE: nada de filter/opacity/clip no
   .mih-obj — achata o preserve-3d. */
.mih-space{position:absolute;inset:0;z-index:3;pointer-events:none;}
.mih-slot{--hue:var(--gold);--w:clamp(98px,25vw,150px);--h:clamp(124px,32vw,186px);--t:clamp(26px,8vw,38px);
  position:absolute;top:0;left:0;width:var(--w);height:var(--h);padding:0;border:0;background:none;cursor:pointer;
  pointer-events:auto;will-change:transform;}
.mih-slot:focus-visible{outline:none;}
.mih-persp{width:100%;height:100%;perspective:640px;}
.mih-obj{position:relative;width:100%;height:100%;transform-style:preserve-3d;transform-origin:center center;will-change:transform;}

.mih-face{position:absolute;top:50%;left:50%;backface-visibility:hidden;}
.mih-front,.mih-back{width:var(--w);height:var(--h);border-radius:9px;}
.mih-side-l,.mih-side-r{width:var(--t);height:var(--h);}
.mih-side-t,.mih-side-b{width:var(--w);height:var(--t);}
.mih-front{transform:translate(-50%,-50%) translateZ(calc(var(--t)/2));background:linear-gradient(160deg,#42463781,#20231800),linear-gradient(160deg,#43473a,#23271c);border:1px solid #565a49;box-shadow:0 34px 40px -20px rgba(0,0,0,0.85),inset 0 1px 0 rgba(255,255,255,0.09);padding:11px;display:flex;flex-direction:column;}
.mih-back{transform:translate(-50%,-50%) rotateY(180deg) translateZ(calc(var(--t)/2));background:linear-gradient(160deg,#22251b,#101309);border:1px solid #34382c;}
/* laterais: gradiente que simula luz vindo de cima → topo mais claro */
.mih-side-r{transform:translate(-50%,-50%) rotateY(90deg) translateZ(calc(var(--w)/2));background:linear-gradient(180deg,#3a3e30,#14170e);box-shadow:inset 0 0 0 1px rgba(0,0,0,0.3);}
.mih-side-l{transform:translate(-50%,-50%) rotateY(-90deg) translateZ(calc(var(--w)/2));background:linear-gradient(180deg,#3a3e30,#14170e);box-shadow:inset 0 0 0 1px rgba(0,0,0,0.3);}
.mih-side-t{transform:translate(-50%,-50%) rotateX(90deg) translateZ(calc(var(--h)/2));background:linear-gradient(90deg,#4c5040,#565b48);}
.mih-side-b{transform:translate(-50%,-50%) rotateX(-90deg) translateZ(calc(var(--h)/2));background:#0d1007;}

.mih-slot:hover .mih-front{filter:brightness(1.12);}
.mih-slot:focus-visible .mih-front{box-shadow:0 34px 40px -20px rgba(0,0,0,0.85),inset 0 0 0 2px var(--hue);}

.mih-ridges{height:11px;width:58%;border-radius:3px;margin-bottom:10px;flex:none;background:repeating-linear-gradient(90deg,rgba(0,0,0,0.4) 0 3px,rgba(255,255,255,0.06) 3px 6px);}
.mih-label{flex:1;background:linear-gradient(180deg,#16190f,#10130b);border:1px solid color-mix(in srgb,var(--hue) 45%,transparent);border-radius:5px;padding:11px 9px 9px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;box-shadow:inset 0 0 22px -8px color-mix(in srgb,var(--hue) 60%,transparent);}
.mih-screen{width:clamp(40px,11vw,54px);height:clamp(40px,11vw,54px);display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--hue) 22%,#0c0f08),#0c0f08 75%);border:2px solid color-mix(in srgb,var(--hue) 55%,transparent);border-radius:6px;box-shadow:0 0 16px -4px color-mix(in srgb,var(--hue) 70%,transparent),inset 0 0 10px rgba(0,0,0,0.6);}
.mih-screen svg{width:64%;height:64%;color:var(--hue);filter:drop-shadow(0 0 4px color-mix(in srgb,var(--hue) 70%,transparent));}
.mih-screen svg rect{fill:currentColor;}
.mih-screen svg rect.k{fill:#0c0f08;}
.mih-name{font-size:clamp(9.5px,2.5vw,11.5px);font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:var(--hue);text-shadow:1px 1px 0 rgba(0,0,0,0.5);text-align:center;}
.mih-fases{font-size:8px;letter-spacing:0.13em;text-transform:uppercase;color:var(--faint);display:flex;align-items:center;gap:5px;}
.mih-slot:hover .mih-fases{color:var(--hue);}
.mih-fases .play{color:var(--hue);}
.c-invest{--hue:var(--gold);} .c-fin{--hue:var(--emerald);} .c-barroots{--hue:var(--violet);} .c-config{--hue:var(--dmg);}

.mih-controls{position:fixed;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:5;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:0 12px;}
.mih-ctl{font:inherit;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--faint);background:rgba(12,15,10,0.72);border:1px solid rgba(255,255,255,0.12);padding:10px 15px;border-radius:999px;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
.mih-ctl-cam{color:#06110a;background:linear-gradient(180deg,#5cf0ff,#35c9dd);border:none;font-weight:700;box-shadow:0 8px 22px -8px rgba(92,240,255,0.7);}
.mih-ctl-cam[data-on="true"]{background:linear-gradient(180deg,#f0b23c,#c9852e);box-shadow:0 8px 22px -8px rgba(240,178,60,0.7);}
`;
