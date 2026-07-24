"use client";

// Tela inicial "GAME SELECT" — hub pós-login (ativável em Configurações).
// Os 4 cartuchos (Investimentos / Finanças / Barroots / Config) ficam DENTRO do
// cubo 3D: cada um tem uma âncora no espaço da sala e é reprojetado a cada frame
// pela MESMA projeção off-axis do wireframe — então fazem paralaxe junto com o
// quarto (parecem objetos flutuando no meio da sala). Reage a mouse e giroscópio.

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

export default function InicioPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const enableGyroRef = useRef<() => void>(() => {});
  const [showGyroBtn, setShowGyroBtn] = useState(false);
  const [clock, setClock] = useState("—");
  const [mounted, setMounted] = useState(false);

  // Portal só depois de montar (document existe) — evita SSR e o containing-block
  // do shell (transform) que espremia o fixed numa caixinha.
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const dias = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
    const tick = () => {
      const d = new Date();
      setClock(`${dias[d.getDay()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    document.body.style.overflow = "hidden";

    let W = 1, H = 1;
    const D = 3.9, EYE_D = 1.3, NX = 8, NY = 5, NZ = 10;
    const Z_CART = 0.95;         // profundidade das cartelas dentro da sala
    let segs: number[][] = [];
    function buildRoom() {
      segs = [];
      const L = (a: number, b: number, c: number, d: number, e: number, f: number, g?: number) => segs.push([a, b, c, d, e, f, g ?? 0]);
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

    // Âncora 3D de cada cartela (grade 2×2 no meio da sala).
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
      // Sem input → repousa no CENTRO (nada de deriva/balanço). O peek vem só do mouse/giroscópio.
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
      // Reprojeta cada cartela na sua âncora 3D → paralaxe junto com a sala.
      const rotY = eye.x * 13, rotX = -eye.y * 13;
      for (let i = 0; i < 4; i++) {
        const slot = slotRefs.current[i]; if (!slot) continue;
        const [ax, ay, az] = anchor(i);
        const [X, Y] = project(ax, ay, az);
        slot.style.transform = `translate(${X}px,${Y}px) translate(-50%,-50%) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
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

    // ── Giroscópio — inclinar (gravidade) + girar (bússola) ──
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
      else { base.lr += (lr - base.lr) * 0.006; base.fb += (fb - base.fb) * 0.006; }  // recentraliza o "zero" devagar → nunca fica preso num lado
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

    const isTouch = "ontouchstart" in window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DMc = window.DeviceMotionEvent as any, DOc = window.DeviceOrientationEvent as any;
    if (isTouch && ((DMc && DMc.requestPermission) || (DOc && DOc.requestPermission))) setShowGyroBtn(true);
    else if (isTouch && (window.DeviceMotionEvent || window.DeviceOrientationEvent)) addGyro();

    window.addEventListener("resize", resize);
    resize(); raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onPointer);
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("dblclick", recalibrate);
      window.removeEventListener("orientationchange", recalibrate);
      window.removeEventListener("resize", resize);
      document.body.style.overflow = "";
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div className="mih-root">
      <canvas ref={canvasRef} className="mih-bg" />
      <div className="mih-scrim" />

      {/* Cartelas 3D dentro do cubo */}
      <div className="mih-space">
        {CARTS.map((c, i) => (
          <button
            key={c.href}
            ref={(el) => { slotRefs.current[i] = el; }}
            className="mih-slot"
            onClick={() => router.push(c.href)}
            aria-label={c.name}
          >
            <div className={`mih-cart ${c.cls}`}>
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

      {/* HUD (chrome plano) */}
      <div className="mih-hud">
        <header className="mih-header">
          <div className="mih-brand">
            <span className="mih-dpad" aria-hidden="true"><i className="h" /><i className="v" /></span>
            <span className="mih-wordmark">BARROOTS</span>
          </div>
          <span className="mih-clock">{clock}</span>
        </header>
        <div className="mih-title">
          <p className="mih-eyebrow">Insira um cartucho</p>
          <p className="mih-h1">Game Select <span className="mih-blink">_</span></p>
        </div>
        <footer className="mih-footer">
          <span>© Barroots System</span>
          <span>Escolha um cartucho <span className="mih-cursor">▶</span></span>
        </footer>
      </div>

      {showGyroBtn && (
        <button className="mih-gyro" onClick={() => enableGyroRef.current()}>Ativar giroscópio</button>
      )}

      <style>{CSS}</style>
    </div>,
    document.body,
  );
}

const CSS = `
.mih-root{position:fixed;inset:0;z-index:60;overflow:hidden;font-family:ui-monospace,"SF Mono","Cascadia Code","Courier New",monospace;color:#e9ecd8;background:linear-gradient(180deg,#0f130c,#0c0f0a);--gold:#f0b23c;--emerald:#3ddc84;--violet:#b18bff;--dmg:#9bbc0f;--faint:#6a6f52;--muted:#9aa07f;}
.mih-bg{position:absolute;inset:0;width:100%;height:100%;z-index:0;display:block;touch-action:none;}
.mih-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(120% 100% at 50% 46%,transparent 34%,rgba(8,10,7,0.5) 82%,rgba(8,10,7,0.85) 100%);}
.mih-root::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:6;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.18) 0 1px,transparent 1px 3px),radial-gradient(120% 100% at 50% 50%,transparent 62%,rgba(0,0,0,0.4) 100%);mix-blend-mode:multiply;}

/* Camada 3D das cartelas */
.mih-space{position:absolute;inset:0;z-index:3;perspective:820px;pointer-events:none;}
.mih-slot{position:absolute;top:0;left:0;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;transform-style:preserve-3d;will-change:transform;}
.mih-slot:focus-visible{outline:none;}
.mih-cart{--hue:var(--gold);position:relative;display:block;width:clamp(104px,27vw,168px);text-align:left;padding:11px 11px 13px;background:linear-gradient(165deg,#3a3d31,#202318);border:1px solid #4c4f40;border-radius:8px 8px 10px 10px;clip-path:polygon(0 0,74% 0,86% 12%,100% 12%,100% 100%,0 100%);box-shadow:0 22px 34px -14px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,255,255,0.05);transition:transform .16s ease,filter .2s;animation:mih-pop .45s ease both;}
.mih-slot:nth-child(1) .mih-cart{animation-delay:.02s;} .mih-slot:nth-child(2) .mih-cart{animation-delay:.10s;} .mih-slot:nth-child(3) .mih-cart{animation-delay:.18s;} .mih-slot:nth-child(4) .mih-cart{animation-delay:.26s;}
.mih-slot:hover .mih-cart{transform:translateY(-6px);filter:brightness(1.1);}
.mih-slot:focus-visible .mih-cart{filter:brightness(1.12);box-shadow:0 0 0 3px var(--hue),0 22px 34px -14px rgba(0,0,0,0.9);}
.mih-slot:active .mih-cart{transform:translateY(-2px);}
@keyframes mih-pop{from{opacity:0;}to{opacity:1;}}
.mih-ridges{height:11px;width:58%;border-radius:3px;margin-bottom:11px;background:repeating-linear-gradient(90deg,rgba(0,0,0,0.35) 0 3px,rgba(255,255,255,0.04) 3px 6px);}
.mih-label{background:linear-gradient(180deg,#16190f,#10130b);border:1px solid color-mix(in srgb,var(--hue) 45%,transparent);border-radius:5px;padding:12px 10px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;box-shadow:inset 0 0 22px -8px color-mix(in srgb,var(--hue) 60%,transparent);}
.mih-screen{width:clamp(44px,12vw,58px);height:clamp(44px,12vw,58px);display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--hue) 22%,#0c0f08),#0c0f08 75%);border:2px solid color-mix(in srgb,var(--hue) 55%,transparent);border-radius:6px;box-shadow:0 0 16px -4px color-mix(in srgb,var(--hue) 70%,transparent),inset 0 0 10px rgba(0,0,0,0.6);}
.mih-screen svg{width:64%;height:64%;color:var(--hue);filter:drop-shadow(0 0 4px color-mix(in srgb,var(--hue) 70%,transparent));}
.mih-screen svg rect{fill:currentColor;}
.mih-screen svg rect.k{fill:#0c0f08;}
.mih-name{font-size:clamp(10px,2.6vw,12px);font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--hue);text-shadow:1px 1px 0 rgba(0,0,0,0.5);text-align:center;}
.mih-fases{font-size:8.5px;letter-spacing:0.14em;text-transform:uppercase;color:var(--faint);display:flex;align-items:center;gap:5px;}
.mih-slot:hover .mih-fases,.mih-slot:focus-visible .mih-fases{color:var(--hue);}
.mih-fases .play{color:var(--hue);}
.c-invest{--hue:var(--gold);} .c-fin{--hue:var(--emerald);} .c-barroots{--hue:var(--violet);} .c-config{--hue:var(--dmg);}

/* HUD */
.mih-hud{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;justify-content:space-between;padding:clamp(16px,4vw,34px);pointer-events:none;}
.mih-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
.mih-brand{display:flex;align-items:center;gap:12px;}
.mih-dpad{width:26px;height:26px;position:relative;flex:none;}
.mih-dpad i{position:absolute;background:var(--dmg);border-radius:2px;box-shadow:0 0 6px rgba(155,188,15,0.5);}
.mih-dpad .h{top:10px;left:2px;width:22px;height:6px;}
.mih-dpad .v{top:2px;left:10px;width:6px;height:22px;}
.mih-wordmark{font-weight:700;font-size:15px;letter-spacing:0.26em;text-shadow:2px 2px 0 rgba(0,0,0,0.6);}
.mih-clock{font-size:11px;letter-spacing:0.14em;color:var(--dmg);text-transform:uppercase;text-shadow:0 0 8px rgba(155,188,15,0.4);}
.mih-title{text-align:center;}
.mih-eyebrow{font-size:11px;letter-spacing:0.34em;text-transform:uppercase;color:var(--muted);margin:0;}
.mih-h1{margin:8px 0 0;font-size:clamp(20px,4.5vw,32px);font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-shadow:3px 3px 0 rgba(0,0,0,0.6);}
.mih-blink{color:var(--dmg);animation:mih-blink 1.1s steps(1) infinite;}
@keyframes mih-blink{50%{opacity:0;}}
.mih-footer{display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--faint);}
.mih-cursor{color:var(--dmg);animation:mih-blink 1s steps(1) infinite;}
.mih-gyro{position:fixed;right:14px;bottom:52px;z-index:5;font:inherit;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#06110a;background:linear-gradient(180deg,var(--dmg),#7fa00c);border:none;padding:9px 13px;border-radius:8px;cursor:pointer;box-shadow:0 8px 20px -8px rgba(155,188,15,0.6);}
@media (prefers-reduced-motion:reduce){.mih-cart{animation:none;transition:none;} .mih-slot:hover .mih-cart{transform:none;} .mih-blink,.mih-cursor{animation:none;}}
`;
