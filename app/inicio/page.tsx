"use client";

// Tela inicial — hub pós-login (ativável em Configurações). Só o fundo 3D
// (quarto wireframe, perspectiva off-axis) + os 4 cartuchos como OBJETOS 3D
// (preserve-3d, 6 faces com espessura), reprojetados pela mesma projeção da
// sala → giram com a perspectiva. Mouse, arrastar o dedo e giroscópio.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useHubEstilo } from "@/lib/use-hub";

type Widget = "chart" | "bars" | "nodes" | "telemetry";
interface Cart { cls: string; name: string; fases: string; href: string; eyebrow: string; widget: Widget; sub: string; icon: ReactNode }

const CARTS: Cart[] = [
  {
    cls: "c-invest", name: "Investimentos", fases: "17 fases", href: "/", eyebrow: "Análise de mercado", widget: "chart", sub: "IBOV ▲ 1,2%",
    icon: (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        <rect x="1" y="10" width="3" height="4" /><rect x="6" y="7" width="3" height="7" /><rect x="11" y="4" width="3" height="10" />
        <rect x="10" y="1" width="4" height="2" /><rect x="12" y="1" width="2" height="5" />
      </svg>
    ),
  },
  {
    cls: "c-fin", name: "Finanças", fases: "2 fases", href: "/financas", eyebrow: "Saldo do mês", widget: "bars", sub: "+1.200 / −300",
    icon: (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        <rect x="6" y="1" width="4" height="1" /><rect x="4" y="2" width="8" height="1" /><rect x="3" y="3" width="10" height="1" />
        <rect x="2" y="4" width="12" height="6" /><rect x="3" y="10" width="10" height="1" /><rect x="4" y="11" width="8" height="1" /><rect x="6" y="12" width="4" height="1" />
        <rect className="k" x="7" y="3" width="2" height="8" /><rect className="k" x="5" y="4" width="4" height="1" /><rect className="k" x="6" y="6" width="4" height="1" /><rect className="k" x="7" y="9" width="4" height="1" />
      </svg>
    ),
  },
  {
    cls: "c-barroots", name: "Barroots", fases: "8 fases", href: "/barroots", eyebrow: "Explorar", widget: "nodes", sub: "7 nós • 4 🔒",
    icon: (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        <rect x="3" y="3" width="10" height="1" /><rect x="2" y="4" width="12" height="2" /><rect x="2" y="6" width="12" height="7" />
        <rect className="k" x="2" y="6" width="12" height="1" /><rect className="k" x="7" y="5" width="2" height="4" /><rect x="7" y="7" width="2" height="1" /><rect x="1" y="13" width="14" height="1" />
      </svg>
    ),
  },
  {
    cls: "c-config", name: "Config", fases: "ajustes", href: "/configuracoes", eyebrow: "Sistema", widget: "telemetry", sub: "CPU 62% • OK",
    icon: (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        <rect x="2" y="2" width="4" height="4" /><rect className="k" x="2" y="2" width="2" height="2" /><rect x="5" y="5" width="2" height="2" /><rect x="7" y="7" width="2" height="2" /><rect x="9" y="9" width="2" height="2" /><rect x="11" y="11" width="3" height="3" />
      </svg>
    ),
  },
];

// Mini-widget de dados "vivo" por card (animações CSS — sem custo de JS/frame).
function CardWidget({ type }: { type: Widget }) {
  if (type === "chart") {
    const AREA = "M0 27 L12 20 L24 28 L36 13 L48 22 L60 9 L72 18 L84 12 L96 25 L108 12 L120 27 L120 40 L0 40 Z";
    const LINE = "M0 27 L12 20 L24 28 L36 13 L48 22 L60 9 L72 18 L84 12 L96 25 L108 12 L120 27";
    const One = () => (
      <svg className="mih-chart-svg" viewBox="0 0 120 40" preserveAspectRatio="none">
        <path className="area" d={AREA} /><path className="line" d={LINE} fill="none" />
      </svg>
    );
    return <div className="mih-w mih-w-chart"><div className="mih-chart-scroll"><One /><One /></div></div>;
  }
  if (type === "bars") {
    return (
      <div className="mih-w mih-w-bars">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className={i % 3 === 2 ? "neg" : "pos"} style={{ animationDelay: `${i * 0.13}s` }} />
        ))}
      </div>
    );
  }
  if (type === "nodes") {
    const N: [number, number][] = [[60, 8], [34, 24], [86, 24], [20, 40], [46, 40], [74, 40], [100, 40]];
    const L: [number, number][] = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]];
    return (
      <svg className="mih-w mih-w-nodes" viewBox="0 0 120 46">
        {L.map(([a, b], i) => <line key={i} x1={N[a][0]} y1={N[a][1]} x2={N[b][0]} y2={N[b][1]} />)}
        {N.map(([x, y], i) => <circle key={i} className={i >= 3 ? "lock" : ""} cx={x} cy={y} r={i === 0 ? 4.5 : 3.2} style={{ animationDelay: `${i * 0.18}s` }} />)}
      </svg>
    );
  }
  // telemetry
  const rows: [string, number][] = [["CPU", 62], ["MEM", 41], ["NET", 78]];
  return (
    <div className="mih-w mih-w-tel">
      {rows.map(([k, v], i) => (
        <div className="mih-tel-row" key={k}>
          <span className="lbl">{k}</span>
          <span className="bar"><i style={{ width: `${v}%`, animationDelay: `${i * 0.25}s` }} /></span>
        </div>
      ))}
    </div>
  );
}

// Sem rotação de repouso: em repouso os cartuchos ficam RETOS, alinhados com o
// fundo (de frente). O topo/laterais só aparecem quando o celular é movido.
const BASE_ROT: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]];

// Seletor de estilo (Configurações): "vivo" (glass HUD 3D animado) ou "sobrio"
// (estático, sóbrio e elegante). Espera montar + ler a preferência antes de
// escolher, pra não piscar o modo animado por engano.
export default function InicioPage() {
  const estilo = useHubEstilo();
  if (estilo === null) return null;
  return estilo === "sobrio" ? <SobrioHub /> : <VivoHub />;
}

function VivoHub() {
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
      // Cluster mais junto e centralizado (menos espalhamento vertical/horizontal).
      return [col * 0.55 * W, row * 0.42 * H, Z_CART];
    }

    let dpr = 1, cw = 0, ch = 0, scale = 1, ox = 0, oy = 0;
    const eye = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    let raf = 0, headActive = false;   // head tracking tem precedência sobre mouse/gyro

    // ── Partículas flutuantes + feixes de luz correndo pra frente (data-center) ──
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const PN = 42;
    // nx,ny em [-1,1] (× W/H no desenho); z em [0,D]; deriva lenta rumo ao observador
    const parts = Array.from({ length: PN }, () => ({ nx: rand(-0.98, 0.98), ny: rand(-0.98, 0.98), z: rand(0.05, D), s: rand(0.35, 1) }));
    // feixes que descem os 4 cantos longitudinais da sala (parede↔piso/teto), de longe → perto
    const CORNERS: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const streaks = CORNERS.flatMap((c, i) => [
      { cx: c[0], cy: c[1], z: (D * i) / 4, sp: rand(1.4, 2.1) },
      { cx: c[0], cy: c[1], z: (D * (i + 2)) / 4, sp: rand(1.4, 2.1) },
    ]);
    let tPrev = 0, pulseZ = D;

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
      const now = (typeof performance !== "undefined" ? performance.now() : 0);
      if (!tPrev) tPrev = now;
      const dt = Math.min(0.05, (now - tPrev) / 1000); tPrev = now;
      // plano de "varredura" de luz correndo em direção ao observador (D → 0)
      pulseZ -= dt * 1.6; if (pulseZ < 0) pulseZ += D;

      eye.x += (target.x - eye.x) * 0.06; eye.y += (target.y - eye.y) * 0.06;
      ctx!.clearRect(0, 0, cw, ch);

      // ── Grade da sala (com brilho puxado pela varredura) ──
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], A = project(s[0], s[1], s[2]), B = project(s[3], s[4], s[5]);
        const depth = (A[2] + B[2]) / 2, al = 0.05 + 0.45 * Math.pow(depth, 1.4);
        const midZ = (s[2] + s[5]) / 2;
        let dz = Math.abs(midZ - pulseZ); if (dz > D / 2) dz = D - dz;
        const glow = Math.max(0, 1 - dz / 0.55);              // realça linhas perto do plano
        ctx!.lineWidth = 1.7;
        ctx!.strokeStyle = `rgba(92,240,255,${al * (0.15 + glow * 0.5)})`;
        ctx!.beginPath(); ctx!.moveTo(A[0], A[1]); ctx!.lineTo(B[0], B[1]); ctx!.stroke();
        ctx!.lineWidth = 0.9;
        ctx!.strokeStyle = `rgba(${170 + glow * 60},${235 + glow * 20},${245},${al * (0.75 + glow * 0.25)})`;
        ctx!.beginPath(); ctx!.moveTo(A[0], A[1]); ctx!.lineTo(B[0], B[1]); ctx!.stroke();
      }

      // ── Feixes de luz descendo os cantos, de longe pra perto ──
      for (let i = 0; i < streaks.length; i++) {
        const k = streaks[i]; k.z -= dt * k.sp; if (k.z < 0) k.z += D;
        const z2 = Math.min(D, k.z + 0.7);
        const A = project(k.cx * W, k.cy * H, k.z), B = project(k.cx * W, k.cy * H, z2);
        const near = A[2];                                    // t maior = mais perto
        const a = Math.pow(near, 1.6);
        const grad = ctx!.createLinearGradient(A[0], A[1], B[0], B[1]);
        grad.addColorStop(0, `rgba(150,250,255,${0.9 * a})`);
        grad.addColorStop(1, `rgba(92,240,255,0)`);
        ctx!.lineWidth = 1 + near * 2.4; ctx!.strokeStyle = grad;
        ctx!.beginPath(); ctx!.moveTo(A[0], A[1]); ctx!.lineTo(B[0], B[1]); ctx!.stroke();
        ctx!.fillStyle = `rgba(200,252,255,${a})`;
        ctx!.beginPath(); ctx!.arc(A[0], A[1], 1 + near * 2, 0, 6.283); ctx!.fill();
      }

      // ── Partículas flutuantes (poeira de dados) ──
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.z -= dt * 0.28 * p.s; p.nx += dt * 0.02 * Math.sin(p.z * 3 + i);
        if (p.z < 0.05) { p.z = D; p.nx = rand(-0.98, 0.98); p.ny = rand(-0.98, 0.98); }
        const P = project(p.nx * W, p.ny * H, p.z), near = P[2];
        const a = Math.pow(near, 1.7) * (0.4 + 0.6 * p.s);
        ctx!.fillStyle = `rgba(120,240,255,${a * 0.7})`;
        ctx!.beginPath(); ctx!.arc(P[0], P[1], 0.5 + near * 1.7 * p.s, 0, 6.283); ctx!.fill();
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
                  <div className="mih-hud">
                    <div className="mih-hud-top">
                      <span className="mih-chip" aria-hidden="true">{c.icon}</span>
                      <span className="mih-eyebrow">{c.eyebrow}</span>
                    </div>
                    <span className="mih-name">{c.name}</span>
                    <CardWidget type={c.widget} />
                    <span className="mih-sub">{c.sub}</span>
                    <span className="mih-fases"><span className="play">▶</span> {c.fases}</span>
                  </div>
                  <span className="mih-scan" aria-hidden="true" />
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
.mih-root{position:fixed;inset:0;z-index:60;overflow:hidden;font-family:ui-monospace,"SF Mono","Cascadia Code","Courier New",monospace;color:#dfeef2;background:radial-gradient(140% 120% at 50% 42%,#0b1518,#060a0c 70%,#04070a);--gold:#f0b23c;--emerald:#3ddc84;--violet:#b18bff;--dmg:#c6e64e;--cyan:#5cf0ff;--faint:#5c7a82;}
.mih-bg{position:absolute;inset:0;width:100%;height:100%;z-index:0;display:block;touch-action:none;}
.mih-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(120% 100% at 50% 46%,transparent 34%,rgba(4,8,10,0.5) 82%,rgba(3,6,8,0.86) 100%);}
.mih-root::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:6;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.16) 0 1px,transparent 1px 3px),radial-gradient(120% 100% at 50% 50%,transparent 60%,rgba(0,0,0,0.42) 100%);mix-blend-mode:multiply;}

/* Cada card tem PERSPECTIVA PRÓPRIA (centrada nele) → fica reto, sem a distorção
   off-axis do ponto de fuga único. IMPORTANTE: nada de filter/opacity/clip no
   .mih-obj — achata o preserve-3d. */
.mih-space{position:absolute;inset:0;z-index:3;pointer-events:none;}
.mih-slot{--hue:var(--gold);--w:clamp(104px,26vw,158px);--h:clamp(140px,35vw,204px);--t:clamp(20px,6vw,28px);
  position:absolute;top:0;left:0;width:var(--w);height:var(--h);padding:0;border:0;background:none;cursor:pointer;
  pointer-events:auto;will-change:transform;}
.mih-slot:focus-visible{outline:none;}
.mih-persp{width:100%;height:100%;perspective:640px;}
.mih-obj{position:relative;width:100%;height:100%;transform-style:preserve-3d;transform-origin:center center;will-change:transform;}

.mih-face{position:absolute;top:50%;left:50%;backface-visibility:hidden;}
.mih-front,.mih-back{width:var(--w);height:var(--h);border-radius:9px;}
.mih-side-l,.mih-side-r{width:var(--t);height:var(--h);}
.mih-side-t,.mih-side-b{width:var(--w);height:var(--t);}
/* FRENTE = painel HUD de vidro com brilho neon da cor do card */
.mih-front{transform:translate(-50%,-50%) translateZ(calc(var(--t)/2));border-radius:13px;
  background:linear-gradient(157deg,color-mix(in srgb,var(--hue) 12%,transparent),transparent 52%),linear-gradient(160deg,#131b1f,#080d10);
  border:1px solid color-mix(in srgb,var(--hue) 34%,#2a353a);
  box-shadow:0 36px 48px -22px rgba(0,0,0,0.92),0 0 26px -6px color-mix(in srgb,var(--hue) 46%,transparent),inset 0 1px 0 rgba(255,255,255,0.09),inset 0 0 30px -14px color-mix(in srgb,var(--hue) 70%,transparent);
  padding:10px;display:flex;flex-direction:column;overflow:hidden;}
.mih-back{transform:translate(-50%,-50%) rotateY(180deg) translateZ(calc(var(--t)/2));border-radius:13px;background:linear-gradient(160deg,color-mix(in srgb,var(--hue) 13%,#0c1417),#070c0f);border:1px solid color-mix(in srgb,var(--hue) 28%,#1e2a2e);}
/* Espessura NÃO é caixa fria: cada face herda a cor do card, com bevel/fio de luz
   onde a frente iluminada "vaza" pra borda. Glow interno mantém tudo quente. */
.mih-side-r{transform:translate(-50%,-50%) rotateY(90deg) translateZ(calc(var(--w)/2));
  background:linear-gradient(180deg,color-mix(in srgb,var(--hue) 30%,#121b1f),color-mix(in srgb,var(--hue) 9%,#080d0f));
  box-shadow:inset 3px 0 0 -1px color-mix(in srgb,var(--hue) 65%,transparent),inset 0 0 16px -5px color-mix(in srgb,var(--hue) 60%,transparent),inset 0 0 0 1px rgba(0,0,0,0.25);}
.mih-side-l{transform:translate(-50%,-50%) rotateY(-90deg) translateZ(calc(var(--w)/2));
  background:linear-gradient(180deg,color-mix(in srgb,var(--hue) 30%,#121b1f),color-mix(in srgb,var(--hue) 9%,#080d0f));
  box-shadow:inset -3px 0 0 -1px color-mix(in srgb,var(--hue) 65%,transparent),inset 0 0 16px -5px color-mix(in srgb,var(--hue) 60%,transparent),inset 0 0 0 1px rgba(0,0,0,0.25);}
.mih-side-t{transform:translate(-50%,-50%) rotateX(90deg) translateZ(calc(var(--h)/2));
  background:linear-gradient(180deg,color-mix(in srgb,var(--hue) 46%,#0d161a),color-mix(in srgb,var(--hue) 13%,#0a1013));
  box-shadow:inset 0 2px 0 -0.5px color-mix(in srgb,var(--hue) 72%,transparent),inset 0 -2px 0 -0.5px color-mix(in srgb,var(--hue) 34%,transparent),inset 0 0 18px -5px color-mix(in srgb,var(--hue) 70%,transparent);}
.mih-side-b{transform:translate(-50%,-50%) rotateX(-90deg) translateZ(calc(var(--h)/2));
  background:linear-gradient(180deg,color-mix(in srgb,var(--hue) 11%,#0a1013),#05090b);
  box-shadow:inset 0 0 12px -6px color-mix(in srgb,var(--hue) 40%,transparent);}

.mih-slot:hover .mih-front{border-color:color-mix(in srgb,var(--hue) 60%,transparent);box-shadow:0 40px 52px -22px rgba(0,0,0,0.95),0 0 40px -6px color-mix(in srgb,var(--hue) 62%,transparent),inset 0 1px 0 rgba(255,255,255,0.12),inset 0 0 34px -12px color-mix(in srgb,var(--hue) 80%,transparent);}
.mih-slot:focus-visible .mih-front{box-shadow:0 36px 48px -22px rgba(0,0,0,0.92),inset 0 0 0 2px var(--hue);}

/* varredura de luz que atravessa o vidro */
.mih-scan{position:absolute;inset:0;border-radius:13px;pointer-events:none;background:linear-gradient(115deg,transparent 30%,color-mix(in srgb,var(--hue) 22%,transparent) 48%,transparent 62%);background-size:280% 100%;background-position:130% 0;animation:mih-sheen 5.5s ease-in-out infinite;mix-blend-mode:screen;}
@keyframes mih-sheen{0%,72%{background-position:130% 0;}100%{background-position:-60% 0;}}

.mih-hud{flex:1;display:flex;flex-direction:column;gap:6px;position:relative;z-index:1;}
.mih-hud-top{display:flex;align-items:center;gap:7px;min-height:22px;}
.mih-chip{width:23px;height:23px;flex:none;display:grid;place-items:center;border-radius:6px;background:color-mix(in srgb,var(--hue) 15%,#0a1012);border:1px solid color-mix(in srgb,var(--hue) 50%,transparent);box-shadow:0 0 12px -3px color-mix(in srgb,var(--hue) 75%,transparent),inset 0 0 8px -4px color-mix(in srgb,var(--hue) 80%,transparent);}
.mih-chip svg{width:14px;height:14px;color:var(--hue);filter:drop-shadow(0 0 3px color-mix(in srgb,var(--hue) 70%,transparent));}
.mih-chip svg rect{fill:currentColor;} .mih-chip svg rect.k{fill:#0a1012;}
.mih-eyebrow{font-size:7.5px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700;line-height:1.15;color:color-mix(in srgb,var(--hue) 78%,#93b0b7);}
.mih-name{font-size:clamp(11px,3vw,13.5px);font-weight:800;letter-spacing:0.01em;color:#eef6f8;text-shadow:0 0 12px color-mix(in srgb,var(--hue) 40%,transparent);line-height:1;}
.mih-sub{font-size:8px;letter-spacing:0.06em;font-weight:700;color:color-mix(in srgb,var(--hue) 82%,#9fc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mih-fases{margin-top:auto;font-size:7.5px;letter-spacing:0.14em;text-transform:uppercase;color:var(--faint);display:flex;align-items:center;gap:5px;}
.mih-slot:hover .mih-fases{color:color-mix(in srgb,var(--hue) 70%,var(--faint));}
.mih-fases .play{color:var(--hue);}
.c-invest{--hue:var(--gold);} .c-fin{--hue:var(--emerald);} .c-barroots{--hue:var(--violet);} .c-config{--hue:var(--dmg);}

/* ── Mini-widgets de dados (moldura de "tela") ── */
.mih-w{position:relative;border-radius:6px;background:linear-gradient(180deg,#081013,#050a0c);border:1px solid color-mix(in srgb,var(--hue) 22%,#16202400);box-shadow:inset 0 0 20px -9px color-mix(in srgb,var(--hue) 70%,transparent);overflow:hidden;}
/* linha 1: gráfico area+linha rolando */
.mih-w-chart{height:clamp(32px,8.5vw,42px);}
.mih-chart-scroll{display:flex;width:200%;height:100%;animation:mih-scroll 6s linear infinite;}
.mih-chart-svg{width:50%;height:100%;display:block;}
.mih-chart-svg .area{fill:color-mix(in srgb,var(--hue) 20%,transparent);}
.mih-chart-svg .line{stroke:var(--hue);stroke-width:1.6;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 3px color-mix(in srgb,var(--hue) 85%,transparent));}
@keyframes mih-scroll{to{transform:translateX(-50%);}}
/* barras +/- estilo equalizador */
.mih-w-bars{height:clamp(32px,8.5vw,42px);display:flex;align-items:flex-end;gap:3px;padding:5px 7px;}
.mih-w-bars span{flex:1;height:100%;border-radius:1.5px;transform-origin:bottom;animation:mih-bar 1.7s ease-in-out infinite;}
.mih-w-bars .pos{background:linear-gradient(180deg,var(--emerald),#1f8a52);box-shadow:0 0 6px -1px var(--emerald);}
.mih-w-bars .neg{background:linear-gradient(180deg,#ff7a7a,#c0392b);box-shadow:0 0 6px -1px #ff6b6b;}
@keyframes mih-bar{0%,100%{transform:scaleY(0.32);}50%{transform:scaleY(1);}}
/* grafo de nós (árvore) com travados */
.mih-w-nodes{height:clamp(38px,10vw,50px);width:100%;display:block;}
.mih-w-nodes line{stroke:color-mix(in srgb,var(--hue) 52%,transparent);stroke-width:1.1;}
.mih-w-nodes circle{fill:color-mix(in srgb,var(--hue) 26%,#0a1012);stroke:var(--hue);stroke-width:1.3;animation:mih-pulse 2.4s ease-in-out infinite;}
.mih-w-nodes circle.lock{stroke-dasharray:2.2 2.2;opacity:0.45;animation:none;fill:#0a1012;}
@keyframes mih-pulse{0%,100%{opacity:0.55;}50%{opacity:1;filter:drop-shadow(0 0 3px var(--hue));}}
/* telemetria CPU/MEM/NET */
.mih-w-tel{padding:7px 8px;display:flex;flex-direction:column;gap:5px;}
.mih-tel-row{display:flex;align-items:center;gap:6px;}
.mih-tel-row .lbl{font-size:7px;letter-spacing:0.08em;color:var(--faint);width:22px;flex:none;}
.mih-tel-row .bar{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,0.06);overflow:hidden;}
.mih-tel-row .bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,color-mix(in srgb,var(--hue) 55%,transparent),var(--hue));box-shadow:0 0 8px -2px var(--hue);animation:mih-tel 3s ease-in-out infinite;}
@keyframes mih-tel{0%,100%{transform:translateX(-14%);}50%{transform:translateX(0);}}
@media (prefers-reduced-motion:reduce){.mih-chart-scroll,.mih-w-bars span,.mih-w-nodes circle,.mih-tel-row .bar i,.mih-scan{animation:none;}}

.mih-controls{position:fixed;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:5;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:0 12px;}
.mih-ctl{font:inherit;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--faint);background:rgba(12,15,10,0.72);border:1px solid rgba(255,255,255,0.12);padding:10px 15px;border-radius:999px;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
.mih-ctl-cam{color:#06110a;background:linear-gradient(180deg,#5cf0ff,#35c9dd);border:none;font-weight:700;box-shadow:0 8px 22px -8px rgba(92,240,255,0.7);}
.mih-ctl-cam[data-on="true"]{background:linear-gradient(180deg,#f0b23c,#c9852e);box-shadow:0 8px 22px -8px rgba(240,178,60,0.7);}
`;

// ── Versão SÓBRIA e elegante — estática, sem canvas/3D/animações ─────────────
// Glifo de dados apenas ilustrativo (traçado fixo, tom discreto da cor do card).
function SobrioGlyph({ type }: { type: Widget }) {
  if (type === "chart") {
    const AREA = "M0 27 L12 20 L24 28 L36 13 L48 22 L60 9 L72 18 L84 12 L96 25 L108 12 L120 27 L120 40 L0 40 Z";
    const LINE = "M0 27 L12 20 L24 28 L36 13 L48 22 L60 9 L72 18 L84 12 L96 25 L108 12 L120 27";
    return (
      <svg className="sob-g sob-g-chart" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">
        <path className="area" d={AREA} /><path className="line" d={LINE} fill="none" />
      </svg>
    );
  }
  if (type === "bars") {
    const H = [42, 68, 30, 82, 54, 36, 74, 60, 46];
    return (
      <div className="sob-g sob-g-bars">
        {H.map((h, i) => <span key={i} className={i % 3 === 2 ? "neg" : "pos"} style={{ height: `${h}%` }} />)}
      </div>
    );
  }
  if (type === "nodes") {
    const N: [number, number][] = [[60, 8], [34, 24], [86, 24], [20, 40], [46, 40], [74, 40], [100, 40]];
    const L: [number, number][] = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]];
    return (
      <svg className="sob-g sob-g-nodes" viewBox="0 0 120 46" aria-hidden="true">
        {L.map(([a, b], i) => <line key={i} x1={N[a][0]} y1={N[a][1]} x2={N[b][0]} y2={N[b][1]} />)}
        {N.map(([x, y], i) => <circle key={i} className={i >= 3 ? "lock" : ""} cx={x} cy={y} r={i === 0 ? 4.5 : 3.2} />)}
      </svg>
    );
  }
  const rows: [string, number][] = [["CPU", 62], ["MEM", 41], ["NET", 78]];
  return (
    <div className="sob-g sob-g-tel">
      {rows.map(([k, v]) => (
        <div className="sob-tel-row" key={k}><span className="lbl">{k}</span><span className="bar"><i style={{ width: `${v}%` }} /></span></div>
      ))}
    </div>
  );
}

function SobrioHub() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="sob-root">
      <div className="sob-inner">
        <div className="sob-brand">Barroots<span>· início</span></div>
        <div className="sob-grid">
          {CARTS.map((c) => (
            <button key={c.href} className={`sob-card ${c.cls}`} onClick={() => router.push(c.href)} aria-label={c.name}>
              <div className="sob-head">
                <span className="sob-chip" aria-hidden="true">{c.icon}</span>
                <span className="sob-eyebrow">{c.eyebrow}</span>
              </div>
              <div className="sob-name">{c.name}</div>
              <div className="sob-glyph"><SobrioGlyph type={c.widget} /></div>
              <div className="sob-foot">
                <span className="sob-sub">{c.sub}</span>
                <span className="sob-go">{c.fases} <span className="arw">→</span></span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <style>{SOBRIO_CSS}</style>
    </div>,
    document.body,
  );
}

const SOBRIO_CSS = `
.sob-root{position:fixed;inset:0;z-index:60;overflow:auto;display:grid;place-items:center;padding:32px 20px;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e7ecee;
  background:radial-gradient(120% 90% at 50% 0%,#12171b,#0a0d0f 62%,#070809);
  --gold:#e0b155;--emerald:#5bb98a;--violet:#a693e6;--dmg:#a9c05a;--faint:#7c878c;}
.sob-inner{width:100%;max-width:720px;display:flex;flex-direction:column;gap:22px;}
.sob-brand{text-align:center;font-size:12px;letter-spacing:0.34em;text-transform:uppercase;color:#aeb8bc;font-weight:600;}
.sob-brand span{color:var(--faint);margin-left:8px;font-weight:400;}
.sob-grid{display:grid;grid-template-columns:1fr;gap:14px;}
@media(min-width:560px){.sob-grid{grid-template-columns:1fr 1fr;}}

.sob-card{--hue:var(--gold);position:relative;text-align:left;display:flex;flex-direction:column;gap:11px;
  padding:18px 18px 15px;border-radius:14px;cursor:pointer;
  background:linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.012));
  border:1px solid rgba(255,255,255,0.09);
  box-shadow:0 1px 0 rgba(255,255,255,0.03) inset;
  transition:border-color .18s ease,background .18s ease,transform .18s ease;}
.sob-card::before{content:"";position:absolute;left:18px;right:18px;top:0;height:1px;border-radius:1px;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--hue) 60%,transparent),transparent);opacity:.55;}
.sob-card:hover{border-color:color-mix(in srgb,var(--hue) 42%,rgba(255,255,255,0.12));background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02));transform:translateY(-2px);}
.sob-card:focus-visible{outline:2px solid color-mix(in srgb,var(--hue) 60%,transparent);outline-offset:2px;}

.sob-head{display:flex;align-items:center;gap:10px;}
.sob-chip{width:30px;height:30px;flex:none;display:grid;place-items:center;border-radius:8px;color:var(--hue);
  background:color-mix(in srgb,var(--hue) 12%,rgba(255,255,255,0.02));border:1px solid color-mix(in srgb,var(--hue) 32%,transparent);}
.sob-chip svg{width:16px;height:16px;color:var(--hue);}
.sob-chip svg rect{fill:currentColor;} .sob-chip svg rect.k{fill:#0a0d0f;}
.sob-eyebrow{font-size:10px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:var(--faint);}
.sob-name{font-size:19px;font-weight:600;letter-spacing:-0.01em;color:#f1f5f6;line-height:1.05;}

.sob-glyph{height:44px;display:flex;align-items:center;}
.sob-g{opacity:.9;}
.sob-g-chart{width:100%;height:40px;display:block;}
.sob-g-chart .area{fill:color-mix(in srgb,var(--hue) 12%,transparent);}
.sob-g-chart .line{stroke:color-mix(in srgb,var(--hue) 72%,transparent);stroke-width:1.4;vector-effect:non-scaling-stroke;}
.sob-g-bars{width:100%;height:40px;display:flex;align-items:flex-end;gap:4px;}
.sob-g-bars span{flex:1;border-radius:2px;min-height:4px;}
.sob-g-bars .pos{background:color-mix(in srgb,var(--emerald) 55%,transparent);}
.sob-g-bars .neg{background:color-mix(in srgb,#d98a8a 55%,transparent);}
.sob-g-nodes{width:100%;height:44px;display:block;}
.sob-g-nodes line{stroke:color-mix(in srgb,var(--hue) 42%,transparent);stroke-width:1.1;}
.sob-g-nodes circle{fill:color-mix(in srgb,var(--hue) 20%,#0a0d0f);stroke:color-mix(in srgb,var(--hue) 65%,transparent);stroke-width:1.2;}
.sob-g-nodes circle.lock{stroke-dasharray:2.2 2.2;opacity:.4;}
.sob-g-tel{width:100%;display:flex;flex-direction:column;gap:6px;}
.sob-tel-row{display:flex;align-items:center;gap:8px;}
.sob-tel-row .lbl{font-size:8.5px;letter-spacing:0.08em;color:var(--faint);width:26px;flex:none;}
.sob-tel-row .bar{flex:1;height:4px;border-radius:3px;background:rgba(255,255,255,0.06);overflow:hidden;}
.sob-tel-row .bar i{display:block;height:100%;border-radius:3px;background:color-mix(in srgb,var(--hue) 55%,transparent);}

.sob-foot{margin-top:2px;display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
.sob-sub{font-size:12px;font-weight:500;color:color-mix(in srgb,var(--hue) 70%,#aeb8bc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sob-go{font-size:11px;letter-spacing:0.04em;color:var(--faint);white-space:nowrap;flex:none;}
.sob-go .arw{transition:transform .18s ease;display:inline-block;}
.sob-card:hover .sob-go{color:color-mix(in srgb,var(--hue) 70%,var(--faint));}
.sob-card:hover .sob-go .arw{transform:translateX(3px);}

.sob-card.c-invest{--hue:var(--gold);} .sob-card.c-fin{--hue:var(--emerald);} .sob-card.c-barroots{--hue:var(--violet);} .sob-card.c-config{--hue:var(--dmg);}
`;
