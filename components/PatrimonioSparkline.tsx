"use client";

// Mini-histórico do patrimônio (sparkline) para o herói da Home. Lê a série
// `historico_patrimonio` (mesma da página Patrimônio), agrega para 1 ponto por
// dia (fechamento) e mostra as ÚLTIMAS 3 SEMANAS — área + linha + ponto final,
// com folga no eixo X e rótulos de data nas pontas. Não-crítico: busca depois
// do mount e não renderiza nada enquanto não há dados suficientes.

import { useEffect, useRef, useState } from "react";
import { toDailySeries, type DiaPatrimonio } from "@/lib/historico-daily";

const JANELA_DIAS = 21; // 3 semanas

function rotulo(ts: number): string {
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function PatrimonioSparkline({ height = 52 }: { height?: number }) {
  const [dias, setDias] = useState<DiaPatrimonio[] | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/sheets/historico_patrimonio")
      .then((r) => r.json())
      .then((x) => {
        if (!alive) return;
        const daily = toDailySeries(x);
        if (daily.length < 3) { setDias([]); return; }
        // Janela de 3 semanas a partir da data mais recente.
        const latest = daily[daily.length - 1].ts;
        let win = Number.isFinite(latest)
          ? daily.filter((d) => Number.isFinite(d.ts) && d.ts >= latest - JANELA_DIAS * 86400000)
          : daily;
        if (win.length < 3) win = daily.slice(-15); // fallback se datas não parsearam
        setDias(win);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !dias || dias.length < 3) return;
    const pontos = dias.map((d) => d.total);

    const draw = () => {
      const w = wrap.clientWidth;
      if (w <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, height);

      // Folga maior no eixo X para o traçado não encostar nas bordas.
      const padX = 12, padY = 6;
      const lo = Math.min(...pontos), hi = Math.max(...pontos);
      const span = hi - lo || 1;
      const xs = (i: number) => padX + (w - 2 * padX) * (i / (pontos.length - 1));
      const ys = (v: number) => height - padY - (height - 2 * padY) * ((v - lo) / span);

      // área
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "rgba(63,185,80,0.26)");
      grad.addColorStop(1, "rgba(63,185,80,0)");
      ctx.beginPath();
      ctx.moveTo(xs(0), ys(pontos[0]));
      pontos.forEach((v, i) => ctx.lineTo(xs(i), ys(v)));
      ctx.lineTo(xs(pontos.length - 1), height - padY);
      ctx.lineTo(xs(0), height - padY);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // linha
      ctx.beginPath();
      ctx.moveTo(xs(0), ys(pontos[0]));
      pontos.forEach((v, i) => ctx.lineTo(xs(i), ys(v)));
      ctx.strokeStyle = "#3FB950";
      ctx.lineWidth = 1.75;
      ctx.lineJoin = "round";
      ctx.stroke();

      // ponto final
      const ex = xs(pontos.length - 1), ey = ys(pontos[pontos.length - 1]);
      ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fillStyle = "#3FB950"; ctx.fill();
      ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.strokeStyle = "rgba(63,185,80,0.35)"; ctx.lineWidth = 1.25; ctx.stroke();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [dias, height]);

  if (!dias || dias.length < 3) return <div style={{ height: height + 16 }} />;
  return (
    <div>
      <div ref={wrapRef} style={{ width: "100%", height }}>
        <canvas ref={canvasRef} />
      </div>
      {/* Eixo X — pontas da janela (3 semanas) */}
      <div className="flex items-center justify-between font-mono" style={{ marginTop: 4, paddingLeft: 12, paddingRight: 12, color: "var(--faint)", fontSize: 9 }}>
        <span>{rotulo(dias[0].ts)}</span>
        <span style={{ letterSpacing: ".08em" }}>3 SEMANAS</span>
        <span>{rotulo(dias[dias.length - 1].ts)}</span>
      </div>
    </div>
  );
}
