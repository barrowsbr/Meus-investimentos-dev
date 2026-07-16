"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Pote de moedas — a coleção REAL dentro de uma caixa com física (matter-js):
// cada exemplar vira um corpo circular com o DIÂMETRO REAL em escala
// (diametroMmDe) e a PRÓPRIA foto do anverso. Gravidade responde ao
// acelerômetro do celular (no iPhone exige permissão via botão — regra do iOS);
// sem sensor, gravidade fica para baixo. Dá para arrastar moedas com o dedo
// e sacudir o pote. Inspirado no efeito do CoinSnap (pedido do dono).
//
// Performance: cada moeda é pré-renderizada UMA vez num canvas circular
// (foto recortada + borda metálica); o loop só faz translate/rotate/drawImage.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Matter from "matter-js";
import { ArrowLeft, RotateCcw, Vibrate, Smartphone } from "lucide-react";
import { MOEDAS_COLECAO } from "@/lib/moedas-data";
import { diametroMmDe } from "@/lib/moedas";

interface CoinSpec { foto: string; mm: number; titulo: string }

function especificacoes(): CoinSpec[] {
  const out: CoinSpec[] = [];
  for (const m of MOEDAS_COLECAO) {
    const mm = diametroMmDe(m);
    for (const f of m.fotos) {
      const foto = f.anverso || f.reverso;
      if (foto) out.push({ foto, mm, titulo: `${m.denominacao} ${m.ano}` });
    }
  }
  return out;
}

// Pré-renderiza a moeda: foto recortada em círculo + borda/sombra de metal.
function prerender(img: HTMLImageElement, raioPx: number, dpr: number): HTMLCanvasElement {
  const d = Math.ceil(raioPx * 2 * dpr);
  const c = document.createElement("canvas");
  c.width = d; c.height = d;
  const ctx = c.getContext("2d")!;
  ctx.save();
  ctx.beginPath();
  ctx.arc(d / 2, d / 2, d / 2 - dpr, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, 0, 0, d, d);
  ctx.restore();
  // borda metálica sutil (dá leitura de "moeda física" sobre o fundo escuro)
  ctx.beginPath();
  ctx.arc(d / 2, d / 2, d / 2 - dpr, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();
  return c;
}

export default function MoedasPote() {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const shakeRef = useRef<() => void>(() => {});
  const [sensor, setSensor] = useState<"inativo" | "ativo" | "negado" | "indisponivel">("inativo");
  const [prontas, setProntas] = useState(0);
  const [reinicio, setReinicio] = useState(0);

  const total = MOEDAS_COLECAO.reduce((s, m) => s + m.qtd, 0);

  // iOS 13+ exige gesto do usuário para liberar o acelerômetro.
  const precisaPermissao = typeof window !== "undefined"
    && typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })?.requestPermission === "function";

  useEffect(() => {
    const box = boxRef.current, canvas = canvasRef.current;
    if (!box || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = box.clientWidth;
    const H = box.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d")!;

    const specs = especificacoes();

    // Escala px/mm: as moedas ocupam ~52% da área do pote (proporção REAL entre elas).
    const areaMm2 = specs.reduce((s, e) => s + Math.PI * (e.mm / 2) ** 2, 0);
    const pxPorMm = Math.max(1.1, Math.min(4, Math.sqrt((W * H * 0.52) / areaMm2)));

    const { Engine, Bodies, Composite, Body, Mouse, MouseConstraint, Sleeping } = Matter;
    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 1;
    engineRef.current = engine;

    // Paredes do pote (o teto fica bem acima, para a "chuva" de moedas entrar).
    const esp = 200;
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, H + esp / 2, W * 2, esp, { isStatic: true }),
      Bodies.rectangle(-esp / 2, H / 2, esp, H * 4, { isStatic: true }),
      Bodies.rectangle(W + esp / 2, H / 2, esp, H * 4, { isStatic: true }),
      Bodies.rectangle(W / 2, -H * 2 - esp / 2, W * 2, esp, { isStatic: true }),
    ]);

    // Corpos: um por exemplar, raio proporcional ao diâmetro real.
    const corpos: Matter.Body[] = specs.map((e, i) => {
      const r = (e.mm / 2) * pxPorMm;
      const b = Bodies.circle(
        20 + Math.random() * (W - 40),
        -20 - (i % 40) * 26 - Math.floor(i / 40) * H * 0.5, // entram em levas, de cima
        r,
        { restitution: 0.18, friction: 0.35, frictionAir: 0.012, density: 0.0012 },
      );
      Body.setAngle(b, Math.random() * Math.PI * 2);
      return b;
    });
    Composite.add(engine.world, corpos);

    // Fotos → sprites circulares pré-renderizados (progressivo).
    const sprites: Array<HTMLCanvasElement | null> = specs.map(() => null);
    let vivas = true;
    specs.forEach((e, i) => {
      const img = new Image();
      img.onload = () => {
        if (!vivas) return;
        sprites[i] = prerender(img, (e.mm / 2) * pxPorMm, dpr);
        setProntas((p) => p + 1);
      };
      img.src = e.foto;
    });

    // Arrastar moedas com o dedo/mouse (física em px CSS — o Mouse já mapeia).
    const mouse = Mouse.create(canvas);
    const arrasto = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.15, damping: 0.12, render: { visible: false } } });
    Composite.add(engine.world, arrasto);

    // Acelerômetro → vetor de gravidade (iOS reporta o próprio vetor g;
    // Android usa a convenção invertida — o sinal muda por plataforma).
    const ios = precisaPermissao || /iPhone|iPad/.test(navigator.userAgent);
    let gAnterior = { x: 0, y: 1 };
    const onMotion = (ev: DeviceMotionEvent) => {
      const a = ev.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null) return;
      const gx = (ios ? a.x : -a.x) / 9.81;
      const gy = (ios ? -a.y : a.y) / 9.81;
      const mag = Math.hypot(gx, gy) || 1;
      const lim = Math.min(mag, 1.4) / mag;
      engine.gravity.x = gx * lim;
      engine.gravity.y = gy * lim;
      // Só acorda o pote quando o tombo é real (senão os corpos nunca dormem).
      if (Math.hypot(engine.gravity.x - gAnterior.x, engine.gravity.y - gAnterior.y) > 0.05) {
        gAnterior = { x: engine.gravity.x, y: engine.gravity.y };
        corpos.forEach((b) => Sleeping.set(b, false));
      }
    };
    window.addEventListener("devicemotion", onMotion);

    shakeRef.current = () => {
      corpos.forEach((b) => {
        Sleeping.set(b, false);
        Body.setVelocity(b, { x: (Math.random() - 0.5) * 14, y: -6 - Math.random() * 8 });
        Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.6);
      });
    };

    // Loop: física + desenho (sprites prontos; disco dourado enquanto carrega).
    let raf = 0;
    let antes = performance.now();
    const desenhar = (agora: number) => {
      const dt = Math.min(agora - antes, 33);
      antes = agora;
      Engine.update(engine, dt);
      ctx.clearRect(0, 0, W * dpr, H * dpr);
      for (let i = 0; i < corpos.length; i++) {
        const b = corpos[i];
        const r = b.circleRadius ?? 10;
        ctx.save();
        ctx.translate(b.position.x * dpr, b.position.y * dpr);
        ctx.rotate(b.angle);
        const sp = sprites[i];
        if (sp) {
          ctx.drawImage(sp, -r * dpr, -r * dpr);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, r * dpr, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(232,163,61,0.25)";
          ctx.fill();
          ctx.strokeStyle = "rgba(232,163,61,0.5)";
          ctx.stroke();
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(desenhar);
    };
    raf = requestAnimationFrame(desenhar);

    return () => {
      vivas = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("devicemotion", onMotion);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reinicio]);

  const ativarSensor = async () => {
    try {
      if (precisaPermissao) {
        const r = await (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        setSensor(r === "granted" ? "ativo" : "negado");
      } else if (typeof DeviceMotionEvent !== "undefined") {
        setSensor("ativo"); // Android/desktop com sensor: evento já flui
      } else {
        setSensor("indisponivel");
      }
    } catch { setSensor("negado"); }
  };

  const totalFotos = especificacoes().length;

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
            <Link href="/moedas" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10" aria-label="Voltar para a coleção"><ArrowLeft size={16} /></Link>
            Pote de moedas
          </h1>
          <p className="text-xs text-zinc-500">
            {total} exemplares em escala real · incline o celular para tombar
            {prontas < totalFotos ? ` · carregando fotos ${prontas}/${totalFotos}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sensor !== "ativo" && (
            <button onClick={ativarSensor} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold" style={{ background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
              <Smartphone size={12} /> {sensor === "negado" ? "Permissão negada — tentar de novo" : "Ativar gravidade do celular"}
            </button>
          )}
          <button onClick={() => shakeRef.current()} className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-2 text-xs text-zinc-300" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
            <Vibrate size={12} /> Sacudir
          </button>
          <button onClick={() => { setProntas(0); setReinicio((v) => v + 1); }} className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-2 text-xs text-zinc-300" style={{ border: "1px solid rgba(255,255,255,0.1)" }} aria-label="Despejar de novo">
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* O pote */}
      <div
        ref={boxRef}
        className="relative w-full flex-1 overflow-hidden rounded-2xl"
        style={{
          minHeight: "62vh",
          background: "radial-gradient(120% 90% at 50% 0%, rgba(232,163,61,0.06), transparent 55%), #07090f",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "inset 0 -30px 60px -30px rgba(0,0,0,0.8), inset 0 8px 24px -12px rgba(0,0,0,0.7)",
          touchAction: "none", // o dedo arrasta MOEDA, não a página
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      <p className="mt-2 text-[10px] text-zinc-600">
        Tamanhos proporcionais aos diâmetros reais (mm de catálogo por denominação/era). Arraste as moedas com o dedo.
        No iPhone, o botão &quot;Ativar gravidade&quot; é exigência do iOS para liberar o acelerômetro.
      </p>
    </div>
  );
}
