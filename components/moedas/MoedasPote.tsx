"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Pote de moedas — a coleção REAL numa caixa com física (matter-js):
// • Cada exemplar é um corpo circular com DIÂMETRO EM ESCALA (diametroMmDe)
//   e a própria foto do anverso (sprite circular pré-renderizado 1×).
// • Gravidade segue o acelerômetro (iOS exige botão de permissão).
// • ZOOM: pinça no celular, roda do mouse no desktop, botões +/− (a vista é
//   um transform escala+offset; o Mouse do matter é sincronizado via
//   setScale/setOffset para o arraste continuar preciso em qualquer zoom).
// • Segurar uma moeda CARREGA ela (MouseConstraint); DUPLO TOQUE abre o card
//   de detalhes daquele exemplar.
// • Filtros por CONJUNTO monetário (Réis, Cruzeiro, Real, estrangeiras…)
//   despejam só o pacote escolhido no pote.
// mouse.pixelRatio = dpr é OBRIGATÓRIO: sem ele o arraste desalinha em tela
// retina (o canvas interno é W×dpr e o Mouse divide pelo pixelRatio).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import Matter from "matter-js";
import { ArrowLeft, RotateCcw, Vibrate, Smartphone, ZoomIn, ZoomOut, X, Library } from "lucide-react";
import { MOEDAS_COLECAO } from "@/lib/moedas-data";
import { diametroMmDe, conjuntoMonetario, gradTone, GRAD_LABEL, type Moeda } from "@/lib/moedas";

interface Spec { m: Moeda; foto: string; mm: number }

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function montarSpecs(sel: Set<string> | null): Spec[] {
  const out: Spec[] = [];
  for (const m of MOEDAS_COLECAO) {
    if (sel && !sel.has(conjuntoMonetario(m).nome)) continue;
    const mm = diametroMmDe(m);
    for (const f of m.fotos) {
      const foto = f.anverso || f.reverso;
      if (foto) out.push({ m, foto, mm });
    }
  }
  return out;
}

// Sprite circular: foto recortada + borda metálica (renderizado UMA vez).
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
  const shakeRef = useRef<() => void>(() => {});
  const zoomRef = useRef<(fator: number) => void>(() => {});
  const [sensor, setSensor] = useState<"inativo" | "ativo" | "negado">("inativo");
  const [zoomPct, setZoomPct] = useState(100);
  const [reinicio, setReinicio] = useState(0);
  const [conjSel, setConjSel] = useState<Set<string> | null>(null); // null = todos
  const [aberta, setAberta] = useState<Spec | null>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  // iOS 13+ exige gesto do usuário para liberar o acelerômetro.
  const precisaPermissao = typeof window !== "undefined"
    && typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })?.requestPermission === "function";

  const conjuntos = useMemo(() => {
    const map = new Map<string, { nome: string; ordem: number; qtd: number }>();
    for (const m of MOEDAS_COLECAO) {
      const c = conjuntoMonetario(m);
      const e = map.get(c.nome) ?? { nome: c.nome, ordem: c.ordem, qtd: 0 };
      e.qtd += m.qtd;
      map.set(c.nome, e);
    }
    return [...map.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  }, []);

  const chaveConj = conjSel ? [...conjSel].sort().join("|") : "todos";
  const specsAtuais = useMemo(() => montarSpecs(conjSel), [chaveConj]); // eslint-disable-line react-hooks/exhaustive-deps
  const valorSel = specsAtuais.reduce((s, e) => s + e.m.valorBrl, 0);

  useEffect(() => {
    const box = boxRef.current, canvas = canvasRef.current;
    if (!box || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = box.clientWidth;
    const H = box.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d")!;

    const specs = montarSpecs(conjSel);
    const areaMm2 = specs.reduce((s, e) => s + Math.PI * (e.mm / 2) ** 2, 0) || 1;
    // Poucas moedas → escala maior (limite 5×); coleção inteira → cabe no pote.
    const pxPorMm = Math.max(1.1, Math.min(5, Math.sqrt((W * H * 0.5) / areaMm2)));

    const { Engine, Bodies, Composite, Body, Mouse, MouseConstraint, Sleeping, Query } = Matter;
    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 1;

    const esp = 200;
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, H + esp / 2, W * 2, esp, { isStatic: true }),
      Bodies.rectangle(-esp / 2, H / 2, esp, H * 4, { isStatic: true }),
      Bodies.rectangle(W + esp / 2, H / 2, esp, H * 4, { isStatic: true }),
      Bodies.rectangle(W / 2, -H * 2 - esp / 2, W * 2, esp, { isStatic: true }),
    ]);

    const corpos: Matter.Body[] = specs.map((e, i) => {
      const r = (e.mm / 2) * pxPorMm;
      const b = Bodies.circle(
        20 + Math.random() * (W - 40),
        -20 - (i % 40) * 26 - Math.floor(i / 40) * H * 0.5,
        r,
        { restitution: 0.18, friction: 0.35, frictionAir: 0.012, density: 0.0012 },
      );
      Body.setAngle(b, Math.random() * Math.PI * 2);
      return b;
    });
    const idxPorBody = new Map(corpos.map((b, i) => [b.id, i]));
    Composite.add(engine.world, corpos);

    const sprites: Array<HTMLCanvasElement | null> = specs.map(() => null);
    let vivas = true;
    specs.forEach((e, i) => {
      const img = new Image();
      img.onload = () => { if (vivas) sprites[i] = prerender(img, (e.mm / 2) * pxPorMm, dpr); };
      img.src = e.foto;
    });

    // ── Vista (zoom/pan) + Mouse do matter sincronizado ───────────────────────
    const v = { s: 1, x: 0, y: 0 }; // tela = mundo*s + (x,y)
    const mouse = Mouse.create(canvas);
    mouse.pixelRatio = dpr; // ESSENCIAL em tela retina (ver cabeçalho)
    const arrasto = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, damping: 0.1, render: { visible: false } } });
    Composite.add(engine.world, arrasto);

    const clampView = () => {
      v.s = Math.max(1, Math.min(3.5, v.s));
      v.x = Math.min(0, Math.max(W - W * v.s, v.x));
      v.y = Math.min(0, Math.max(H - H * v.s, v.y));
    };
    const syncMouse = () => {
      Mouse.setScale(mouse, { x: 1 / v.s, y: 1 / v.s });
      Mouse.setOffset(mouse, { x: -v.x / v.s, y: -v.y / v.s });
      setZoomPct(Math.round(v.s * 100));
    };
    syncMouse();

    const soltarArrasto = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (arrasto as any).body = null;
      arrasto.constraint.bodyB = null;
    };

    const zoomEm = (fator: number, cx: number, cy: number) => {
      const s0 = v.s;
      v.s = Math.max(1, Math.min(3.5, v.s * fator));
      const k = v.s / s0;
      v.x = cx - (cx - v.x) * k;
      v.y = cy - (cy - v.y) * k;
      clampView(); syncMouse();
    };
    zoomRef.current = (fator: number) => zoomEm(fator, W / 2, H / 2);

    const paraTela = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };
    const paraMundo = (clientX: number, clientY: number) => {
      const p = paraTela(clientX, clientY);
      return { x: (p.x - v.x) / v.s, y: (p.y - v.y) / v.s };
    };

    // ── Gestos: pinça (2 dedos), pan em área vazia com zoom, duplo toque ─────
    const dedos = new Map<number, { x: number; y: number }>();
    let pinca: { dist: number; cx: number; cy: number } | null = null;
    let pan: { x: number; y: number } | null = null;
    let ultimoTapT = 0;
    let ultimoTapBody = -1;

    const onPointerDown = (ev: PointerEvent) => {
      dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (dedos.size === 2) {
        const [a, b] = [...dedos.values()];
        const pa = paraTela(a.x, a.y), pb = paraTela(b.x, b.y);
        pinca = { dist: Math.hypot(pa.x - pb.x, pa.y - pb.y) || 1, cx: (pa.x + pb.x) / 2, cy: (pa.y + pb.y) / 2 };
        pan = null;
        soltarArrasto(); // pinça não deve segurar moeda
        return;
      }
      const mundo = paraMundo(ev.clientX, ev.clientY);
      const hit = Query.point(corpos, mundo)[0];
      if (hit) {
        const idx = idxPorBody.get(hit.id) ?? -1;
        const agora = performance.now();
        if (agora - ultimoTapT < 350 && ultimoTapBody === idx && idx >= 0) {
          soltarArrasto();
          setAberta(specs[idx]); // DUPLO TOQUE → card de detalhes
        }
        ultimoTapT = agora; ultimoTapBody = idx;
      } else if (v.s > 1) {
        pan = paraTela(ev.clientX, ev.clientY); // arrastar a VISTA em área vazia
      }
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!dedos.has(ev.pointerId)) return;
      dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinca && dedos.size >= 2) {
        const [a, b] = [...dedos.values()];
        const pa = paraTela(a.x, a.y), pb = paraTela(b.x, b.y);
        const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y) || 1;
        const cx = (pa.x + pb.x) / 2, cy = (pa.y + pb.y) / 2;
        zoomEm(dist / pinca.dist, pinca.cx, pinca.cy);
        v.x += cx - pinca.cx; v.y += cy - pinca.cy;
        clampView(); syncMouse();
        pinca = { dist, cx, cy };
      } else if (pan) {
        const p = paraTela(ev.clientX, ev.clientY);
        v.x += p.x - pan.x; v.y += p.y - pan.y;
        clampView(); syncMouse();
        pan = p;
      }
    };
    const onPointerUp = (ev: PointerEvent) => {
      dedos.delete(ev.pointerId);
      if (dedos.size < 2) pinca = null;
      if (dedos.size === 0) pan = null;
    };
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const p = paraTela(ev.clientX, ev.clientY);
      zoomEm(Math.pow(1.0015, -ev.deltaY), p.x, p.y);
    };
    box.addEventListener("pointerdown", onPointerDown);
    box.addEventListener("pointermove", onPointerMove);
    box.addEventListener("pointerup", onPointerUp);
    box.addEventListener("pointercancel", onPointerUp);
    box.addEventListener("wheel", onWheel, { passive: false });

    // ── Acelerômetro → gravidade ──────────────────────────────────────────────
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

    // ── Loop: física + desenho com a vista aplicada ───────────────────────────
    let raf = 0;
    let antes = performance.now();
    const desenhar = (agora: number) => {
      const dt = Math.min(agora - antes, 33);
      antes = agora;
      Matter.Engine.update(engine, dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W * dpr, H * dpr);
      ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y);
      for (let i = 0; i < corpos.length; i++) {
        const b = corpos[i];
        const r = b.circleRadius ?? 10;
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        const sp = sprites[i];
        if (sp) {
          ctx.drawImage(sp, -r, -r, r * 2, r * 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
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
      box.removeEventListener("pointerdown", onPointerDown);
      box.removeEventListener("pointermove", onPointerMove);
      box.removeEventListener("pointerup", onPointerUp);
      box.removeEventListener("pointercancel", onPointerUp);
      box.removeEventListener("wheel", onWheel);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reinicio, chaveConj]);

  const ativarSensor = async () => {
    try {
      if (precisaPermissao) {
        const r = await (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        setSensor(r === "granted" ? "ativo" : "negado");
      } else setSensor("ativo");
    } catch { setSensor("negado"); }
  };

  const alternarConjunto = (nome: string) => {
    setConjSel((prev) => {
      const s = new Set(prev ?? []);
      if (s.has(nome)) s.delete(nome); else s.add(nome);
      return s.size === 0 ? null : s;
    });
  };

  const grad = aberta ? gradTone(aberta.m.graduacao) : null;

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      <style>{POTE_CSS}</style>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
            <Link href="/moedas" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10" aria-label="Voltar para a coleção"><ArrowLeft size={16} /></Link>
            Pote de moedas
          </h1>
          <p className="text-xs text-zinc-500">
            {specsAtuais.length} exemplar{specsAtuais.length !== 1 ? "es" : ""} em escala real · {fmtBRL(valorSel)} de catálogo
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {sensor !== "ativo" && (
            <button onClick={ativarSensor} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold" style={{ background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
              <Smartphone size={12} /> {sensor === "negado" ? "Tentar de novo" : "Ativar gravidade"}
            </button>
          )}
          <button onClick={() => shakeRef.current()} className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-2 text-xs text-zinc-300" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
            <Vibrate size={12} /> Sacudir
          </button>
          <button onClick={() => setReinicio((v) => v + 1)} className="rounded-lg bg-white/[0.05] p-2 text-zinc-300" style={{ border: "1px solid rgba(255,255,255,0.1)" }} aria-label="Despejar de novo">
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Filtros: pacotes da coleção (conjuntos monetários) */}
      <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
        <button
          onClick={() => setConjSel(null)}
          className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-medium"
          style={{ background: !conjSel ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.05)", border: `1px solid ${!conjSel ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.1)"}`, color: !conjSel ? "#fbbf24" : "#a1a1aa" }}
        >
          Coleção inteira
        </button>
        {conjuntos.map((c) => {
          const ativo = conjSel?.has(c.nome) ?? false;
          return (
            <button
              key={c.nome}
              onClick={() => alternarConjunto(c.nome)}
              className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-medium"
              style={{ background: ativo ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.05)", border: `1px solid ${ativo ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.1)"}`, color: ativo ? "#fbbf24" : "#a1a1aa" }}
            >
              {c.nome} ({c.qtd})
            </button>
          );
        })}
      </div>

      {/* O pote — com atmosfera (brilhos, poeira, varredura de luz) */}
      <div
        ref={boxRef}
        className="pote-palco relative w-full flex-1 overflow-hidden rounded-2xl"
        style={{ minHeight: "60vh", touchAction: "none" }}
      >
        <div className="pote-luz" />
        <div className="pote-poeira" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => <i key={i} />)}
        </div>
        <canvas ref={canvasRef} className="absolute inset-0" />
        <div className="pote-borda" aria-hidden />

        {/* Controles de zoom */}
        <div className="absolute right-2 top-2 flex flex-col items-center gap-1">
          <button onClick={() => zoomRef.current(1.35)} className="rounded-lg p-2 text-zinc-200" style={{ background: "rgba(10,14,22,0.75)", border: "1px solid rgba(255,255,255,0.12)" }} aria-label="Aproximar"><ZoomIn size={14} /></button>
          <button onClick={() => zoomRef.current(1 / 1.35)} className="rounded-lg p-2 text-zinc-200" style={{ background: "rgba(10,14,22,0.75)", border: "1px solid rgba(255,255,255,0.12)" }} aria-label="Afastar"><ZoomOut size={14} /></button>
          {zoomPct !== 100 && <span className="rounded-md px-1.5 py-0.5 font-mono text-[9px] text-amber-300" style={{ background: "rgba(10,14,22,0.75)", border: "1px solid rgba(245,158,11,0.3)" }}>{zoomPct}%</span>}
        </div>
      </div>

      <p className="mt-2 text-[10px] text-zinc-600">
        Pinça/roda dá zoom (área vazia arrasta a vista) · segure uma moeda para carregá-la · toque duas vezes para abrir os detalhes.
        Tamanhos proporcionais aos diâmetros reais. No iPhone, &quot;Ativar gravidade&quot; é exigência do iOS.
      </p>

      {/* Card de detalhes (duplo toque) */}
      {montado && aberta && createPortal(
        <div className="fixed inset-0 z-[220] flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: "rgba(0,0,0,0.66)", backdropFilter: "blur(5px)" }} onClick={() => setAberta(null)}>
          <div
            className="w-full max-w-sm overflow-hidden rounded-t-3xl sm:rounded-3xl"
            style={{ background: "#0a0e16", border: "1px solid rgba(255,255,255,0.1)", paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-3">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">{conjuntoMonetario(aberta.m).nome}</span>
              <button onClick={() => setAberta(null)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10" aria-label="Fechar"><X size={16} /></button>
            </div>
            <div className="flex flex-col items-center px-5 pb-5">
              <img
                src={aberta.foto}
                alt={aberta.m.denominacao}
                className="my-3 rounded-full"
                style={{ width: 150, height: 150, objectFit: "cover", boxShadow: "0 10px 34px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.14)" }}
              />
              <p className="text-base font-bold text-zinc-100">{aberta.m.denominacao} · {aberta.m.ano || "—"}</p>
              <p className="text-xs text-zinc-500">{aberta.m.pais}{aberta.m.krause ? ` · ${aberta.m.krause}` : ""}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="font-mono text-sm font-bold text-emerald-400">{fmtBRL(aberta.m.valorBrl)}</span>
                {aberta.m.graduacao && grad && (
                  <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold" style={{ background: grad.bg, border: `1px solid ${grad.border}`, color: grad.color }} title={GRAD_LABEL[aberta.m.graduacao] ?? ""}>
                    {aberta.m.graduacao}
                  </span>
                )}
                {aberta.m.composicao && <span className="text-[10px] text-zinc-500">{aberta.m.composicao}</span>}
              </div>
              {aberta.m.assunto && aberta.m.assunto !== "Séries comuns" && (
                <p className="mt-2 text-center text-[11px] text-zinc-400">{aberta.m.assunto}</p>
              )}
              <Link
                href="/moedas"
                className="mt-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}
              >
                <Library size={12} /> Ver dossiê completo na coleção
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Atmosfera do palco: fundo com brilhos, varredura de luz e poeira dourada.
const POTE_CSS = `
.pote-palco {
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(232,163,61,0.08), transparent 55%),
    radial-gradient(80% 60% at 12% 100%, rgba(109,91,208,0.10), transparent 60%),
    radial-gradient(80% 60% at 88% 100%, rgba(79,142,247,0.08), transparent 60%),
    #07090f;
  border: 1px solid rgba(255,255,255,0.09);
  box-shadow: inset 0 -34px 60px -30px rgba(0,0,0,0.85), inset 0 10px 26px -14px rgba(0,0,0,0.7);
}
.pote-borda { position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(255,255,255,0.04); }
.pote-luz { position: absolute; inset: -30%; pointer-events: none; opacity: .5;
  background: linear-gradient(115deg, transparent 42%, rgba(255,235,190,0.05) 50%, transparent 58%);
  animation: pote-varrer 7s ease-in-out infinite; }
@keyframes pote-varrer { 0%,100% { transform: translateX(-18%); } 50% { transform: translateX(18%); } }
.pote-poeira { position: absolute; inset: 0; pointer-events: none; }
.pote-poeira i { position: absolute; bottom: -4px; width: 3px; height: 3px; border-radius: 50%;
  background: rgba(240,184,96,0.6); filter: blur(0.5px); opacity: 0; animation: pote-subir 7s linear infinite; }
.pote-poeira i:nth-child(1){left:8%;animation-delay:0s} .pote-poeira i:nth-child(2){left:16%;animation-delay:2.4s}
.pote-poeira i:nth-child(3){left:26%;animation-delay:4.6s} .pote-poeira i:nth-child(4){left:34%;animation-delay:1.2s}
.pote-poeira i:nth-child(5){left:44%;animation-delay:5.4s} .pote-poeira i:nth-child(6){left:52%;animation-delay:3.1s}
.pote-poeira i:nth-child(7){left:61%;animation-delay:.7s} .pote-poeira i:nth-child(8){left:69%;animation-delay:5.9s}
.pote-poeira i:nth-child(9){left:77%;animation-delay:2s} .pote-poeira i:nth-child(10){left:85%;animation-delay:4s}
.pote-poeira i:nth-child(11){left:92%;animation-delay:1.6s} .pote-poeira i:nth-child(12){left:97%;animation-delay:3.6s}
@keyframes pote-subir { 0% { transform: translateY(0) scale(.7); opacity: 0; } 12% { opacity: .7; }
  80% { opacity: .35; } 100% { transform: translateY(-64vh) scale(1.1); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .pote-luz, .pote-poeira i { animation: none; opacity: 0; } }
`;
