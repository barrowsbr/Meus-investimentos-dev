"use client";

// Reconhecimento de expressões faciais AO VIVO — 100% no aparelho (MediaPipe
// FaceLandmarker via lib/face-mesh). Desenha a malha do rosto (linhas dos traços
// analisados — contorno, olhos, sobrancelhas, boca, íris) sobre a câmera e mostra
// a expressão detectada + barras de confiança derivadas dos 52 blendshapes.
// Nada de vídeo sai do dispositivo.

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { FaceMesh, analyzeExpression, type FaceFrame, type ExprScore } from "@/lib/face-mesh";

const COLOR: Record<string, string> = {
  feliz: "#3ddc84", surpreso: "#5cf0ff", bravo: "#ff6b6b", triste: "#8aa0ff",
  nojo: "#a9c05a", piscadinha: "#f0b23c", lingua: "#ff8bd0", beijo: "#ff8bd0", neutro: "#9fb2b8",
};

type Status = "idle" | "loading" | "on" | "error";

export default function ExpressoesPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<FaceMesh | null>(null);
  const smoothRef = useRef<Record<string, number>>({});
  const frameN = useRef(0);

  const [status, setStatus] = useState<Status>("idle");
  const [top, setTop] = useState<ExprScore>({ key: "neutro", label: "Neutro", emoji: "😐", score: 0 });
  const [bars, setBars] = useState<ExprScore[]>([]);
  const [face, setFace] = useState(false);

  useEffect(() => () => { trackerRef.current?.stop(); trackerRef.current = null; }, []);

  function draw(f: FaceFrame) {
    const cv = canvasRef.current, video = videoRef.current;
    if (!cv || !video) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = cv.clientWidth, cssH = cv.clientHeight;
    if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) {
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    }
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    const vw = f.vw || video.videoWidth || 640, vh = f.vh || video.videoHeight || 480;
    const scale = Math.max(W / vw, H / vh);       // cover
    const dw = vw * scale, dh = vh * scale, ox = (W - dw) / 2, oy = (H - dh) / 2;

    ctx.save();
    ctx.translate(W, 0); ctx.scale(-1, 1);        // espelho (selfie)
    ctx.drawImage(video, ox, oy, dw, dh);
    ctx.fillStyle = "rgba(6,10,14,0.42)"; ctx.fillRect(0, 0, W, H);   // escurece p/ contraste das linhas

    const lm = f.landmarks, conns = trackerRef.current?.conns;
    if (lm && conns) {
      const mx = (x: number) => ox + x * dw, my = (y: number) => oy + y * dh;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stroke = (cs: any, style: string, w: number, glow = 0) => {
        ctx.strokeStyle = style; ctx.lineWidth = w * dpr;
        ctx.shadowBlur = glow * dpr; ctx.shadowColor = glow ? style : "transparent";
        ctx.beginPath();
        for (const c of cs) { const a = lm[c.start], b = lm[c.end]; if (!a || !b) continue; ctx.moveTo(mx(a.x), my(a.y)); ctx.lineTo(mx(b.x), my(b.y)); }
        ctx.stroke();
      };
      const hue = COLOR[top.key] || "#5cf0ff";
      stroke(conns.tess, "rgba(120,220,255,0.16)", 0.5);            // malha completa (traços)
      stroke(conns.oval, "rgba(120,235,255,0.85)", 1.3, 6);        // contorno
      stroke(conns.leftBrow, "#f0b23c", 1.5, 6); stroke(conns.rightBrow, "#f0b23c", 1.5, 6);
      stroke(conns.leftEye, "#5cf0ff", 1.4, 6); stroke(conns.rightEye, "#5cf0ff", 1.4, 6);
      stroke(conns.leftIris, "rgba(230,250,255,0.95)", 1.2, 5); stroke(conns.rightIris, "rgba(230,250,255,0.95)", 1.2, 5);
      stroke(conns.lips, hue, 1.7, 8);                              // boca acompanha a cor da expressão
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  const onFrame = (f: FaceFrame) => {
    draw(f);
    if (!f.landmarks || f.blends.length === 0) { if (face) setFace(false); return; }
    const { top: t, all } = analyzeExpression(f.blends);
    // Suaviza (EMA) pra evitar tremeliques.
    const s = smoothRef.current;
    for (const e of all) s[e.key] = (s[e.key] ?? 0) * 0.6 + e.score * 0.4;
    s[t.key] = (s[t.key] ?? 0) * 0.6 + t.score * 0.4;
    if ((frameN.current++ % 3) === 0) {
      const smoothed = all.map((e) => ({ ...e, score: s[e.key] ?? 0 })).sort((a, b) => b.score - a.score);
      const best = smoothed[0];
      const topSmoothed: ExprScore = best.score >= 0.3 ? best : { key: "neutro", label: "Neutro", emoji: "😐", score: 1 - best.score };
      setTop(topSmoothed); setBars(smoothed); setFace(true);
    }
  };

  async function startCam() {
    if (trackerRef.current) return;
    setStatus("loading");
    try {
      const t = new FaceMesh(onFrame);
      trackerRef.current = t;
      await t.start(videoRef.current!);
      setStatus("on");
    } catch { trackerRef.current?.stop(); trackerRef.current = null; setStatus("error"); }
  }
  function stopCam() {
    trackerRef.current?.stop(); trackerRef.current = null;
    setStatus("idle"); setFace(false); setBars([]);
    const cv = canvasRef.current; const ctx = cv?.getContext("2d"); if (cv && ctx) ctx.clearRect(0, 0, cv.width, cv.height);
  }

  return (
    <>
      <PageHeader
        title="Expressões"
        description="Reconhecimento facial ao vivo — a malha mostra os traços analisados. Roda 100% no seu aparelho; nada de vídeo sai do dispositivo."
      />

      <div className="exp-wrap">
        <div className="exp-stage">
          <video ref={videoRef} playsInline muted className="exp-video" />
          <canvas ref={canvasRef} className="exp-canvas" />

          {status !== "on" && (
            <div className="exp-overlay">
              {status === "loading" ? (
                <div className="exp-loading"><span className="exp-spin" /> Ativando câmera e modelo…</div>
              ) : (
                <>
                  <div className="exp-face">😊</div>
                  <button className="exp-start" onClick={startCam}>▶ Ativar câmera</button>
                  {status === "error" && <p className="exp-err">Não foi possível abrir a câmera. Verifique a permissão do navegador.</p>}
                  <p className="exp-priv">🔒 Processado no aparelho · nada é enviado ou gravado</p>
                </>
              )}
            </div>
          )}

          {status === "on" && (
            <>
              <div className="exp-top" style={{ ["--c" as string]: COLOR[top.key] || "#5cf0ff" }}>
                <span className="exp-emoji">{face ? top.emoji : "🙈"}</span>
                <div className="exp-top-txt">
                  <span className="exp-label">{face ? top.label : "Procurando rosto…"}</span>
                  {face && <span className="exp-conf">{Math.round(top.score * 100)}%</span>}
                </div>
              </div>
              <button className="exp-stop" onClick={stopCam}>⏹ Parar</button>
            </>
          )}
        </div>

        {status === "on" && (
          <div className="exp-bars">
            {bars.map((b) => (
              <div className="exp-bar" key={b.key} style={{ ["--c" as string]: COLOR[b.key] || "#5cf0ff" }}>
                <span className="exp-bar-emoji">{b.emoji}</span>
                <span className="exp-bar-lbl">{b.label}</span>
                <span className="exp-bar-track"><i style={{ width: `${Math.round(b.score * 100)}%` }} /></span>
                <span className="exp-bar-val">{Math.round(b.score * 100)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.exp-wrap{display:grid;gap:14px;grid-template-columns:1fr;max-width:60rem;}
@media(min-width:900px){.exp-wrap{grid-template-columns:1.4fr 1fr;align-items:start;}}
.exp-stage{position:relative;aspect-ratio:3/4;max-height:72vh;border-radius:18px;overflow:hidden;background:#05080a;
  border:1px solid rgba(120,220,255,0.16);box-shadow:0 24px 46px -26px rgba(0,0,0,0.8),inset 0 0 40px -20px rgba(92,240,255,0.35);}
@media(min-width:900px){.exp-stage{aspect-ratio:4/3;}}
.exp-video{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;}
.exp-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}

.exp-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;
  background:radial-gradient(80% 70% at 50% 40%,rgba(12,18,22,0.4),rgba(5,8,10,0.85));}
.exp-face{font-size:56px;filter:drop-shadow(0 0 18px rgba(92,240,255,0.5));}
.exp-start{font:inherit;font-size:14px;font-weight:700;letter-spacing:.04em;color:#04121a;cursor:pointer;
  background:linear-gradient(180deg,#5cf0ff,#35c9dd);border:none;padding:12px 22px;border-radius:999px;box-shadow:0 10px 26px -10px rgba(92,240,255,0.7);}
.exp-priv{margin:0;font-size:11px;color:var(--muted,#8b969b);letter-spacing:.02em;}
.exp-err{margin:0;font-size:12px;color:#ff9b9b;max-width:280px;}
.exp-loading{display:flex;align-items:center;gap:10px;font-size:13px;color:#cfeaf0;letter-spacing:.03em;}
.exp-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(92,240,255,0.3);border-top-color:#5cf0ff;animation:exp-rot .8s linear infinite;}
@keyframes exp-rot{to{transform:rotate(360deg);}}

.exp-top{position:absolute;left:12px;top:12px;display:flex;align-items:center;gap:11px;padding:9px 15px 9px 10px;border-radius:14px;
  background:rgba(6,11,14,0.55);border:1px solid color-mix(in srgb,var(--c) 45%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:0 0 24px -8px color-mix(in srgb,var(--c) 70%,transparent);}
.exp-emoji{font-size:34px;line-height:1;filter:drop-shadow(0 0 10px color-mix(in srgb,var(--c) 60%,transparent));}
.exp-top-txt{display:flex;flex-direction:column;gap:1px;}
.exp-label{font-size:15px;font-weight:800;color:#eef6f8;letter-spacing:.01em;}
.exp-conf{font-size:11px;font-weight:700;letter-spacing:.08em;color:color-mix(in srgb,var(--c) 80%,#cfe);}
.exp-stop{position:absolute;right:12px;top:12px;font:inherit;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#e7eef0;cursor:pointer;
  background:rgba(6,11,14,0.55);border:1px solid rgba(255,255,255,0.16);padding:7px 12px;border-radius:999px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}

.exp-bars{display:flex;flex-direction:column;gap:9px;padding:4px 2px;}
.exp-bar{display:grid;grid-template-columns:22px 78px 1fr 26px;align-items:center;gap:9px;}
.exp-bar-emoji{font-size:16px;text-align:center;}
.exp-bar-lbl{font-size:12px;color:var(--text,#dfe7ea);font-weight:600;}
.exp-bar-track{height:8px;border-radius:5px;background:rgba(255,255,255,0.07);overflow:hidden;}
.exp-bar-track i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 55%,transparent),var(--c));
  box-shadow:0 0 10px -2px var(--c);transition:width .12s linear;}
.exp-bar-val{font-size:11px;font-variant-numeric:tabular-nums;color:var(--muted,#8b969b);text-align:right;}
`;
