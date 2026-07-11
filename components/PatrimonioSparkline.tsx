"use client";

// Mini-histórico do patrimônio (sparkline) para o herói da Home. Lê a série
// `historico_patrimonio` (mesma da página Patrimônio) e desenha os últimos
// pontos num canvas — área + linha + ponto final. Não-crítico: busca depois do
// mount e não renderiza nada enquanto não há dados suficientes.

import { useEffect, useRef, useState } from "react";

export default function PatrimonioSparkline({ height = 46, max = 60 }: { height?: number; max?: number }) {
  const [pontos, setPontos] = useState<number[] | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/sheets/historico_patrimonio")
      .then((r) => r.json())
      .then((x) => {
        if (!alive || !Array.isArray(x)) return;
        const vals = x
          .map((row: Record<string, unknown>) => Number(row?.patrimonio_total))
          .filter((n) => Number.isFinite(n) && n > 0);
        setPontos(vals.slice(-max));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [max]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !pontos || pontos.length < 3) return;

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

      const pad = 4;
      const lo = Math.min(...pontos), hi = Math.max(...pontos);
      const span = hi - lo || 1;
      const xs = (i: number) => pad + (w - 2 * pad) * (i / (pontos.length - 1));
      const ys = (v: number) => height - pad - (height - 2 * pad) * ((v - lo) / span);

      // área
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "rgba(63,185,80,0.26)");
      grad.addColorStop(1, "rgba(63,185,80,0)");
      ctx.beginPath();
      ctx.moveTo(xs(0), ys(pontos[0]));
      pontos.forEach((v, i) => ctx.lineTo(xs(i), ys(v)));
      ctx.lineTo(xs(pontos.length - 1), height - pad);
      ctx.lineTo(xs(0), height - pad);
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
  }, [pontos, height]);

  if (!pontos || pontos.length < 3) return <div style={{ height }} />;
  return (
    <div ref={wrapRef} style={{ width: "100%", height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
