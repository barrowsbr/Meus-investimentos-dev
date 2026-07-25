"use client";

// Reconhecimento de expressões faciais AO VIVO — 100% no aparelho (MediaPipe
// FaceLandmarker via lib/face-mesh). Desenha a malha do rosto (linhas dos traços
// analisados — contorno, olhos, sobrancelhas, boca, íris) sobre a câmera e mostra
// a expressão detectada + barras de confiança derivadas dos 52 blendshapes.
// Nada de vídeo sai do dispositivo.

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { FaceMesh, analyzeExpression, adjustBlends, type FaceFrame, type ExprScore, type Blend } from "@/lib/face-mesh";

const COLOR: Record<string, string> = {
  feliz: "#3ddc84", surpreso: "#5cf0ff", bravo: "#ff6b6b", triste: "#8aa0ff",
  nojo: "#a9c05a", piscadinha: "#f0b23c", lingua: "#ff8bd0", beijo: "#ff8bd0", neutro: "#9fb2b8",
};

// Nomes amigáveis (PT) dos blendshapes → "traços" mostrados ao vivo.
const AU_PT: Record<string, string> = {
  mouthSmileLeft: "sorriso", mouthSmileRight: "sorriso", jawOpen: "boca aberta",
  browDownLeft: "sobrancelha franzida", browDownRight: "sobrancelha franzida", browInnerUp: "sobrancelha interna ↑",
  browOuterUpLeft: "sobrancelha ↑", browOuterUpRight: "sobrancelha ↑",
  eyeWideLeft: "olhos arregalados", eyeWideRight: "olhos arregalados",
  eyeBlinkLeft: "olho esq. fechado", eyeBlinkRight: "olho dir. fechado",
  mouthPucker: "beicinho", mouthFrownLeft: "boca ↓", mouthFrownRight: "boca ↓",
  noseSneerLeft: "nariz torcido", noseSneerRight: "nariz torcido", cheekPuff: "bochecha inflada", tongueOut: "língua",
};

// Top "traços" ativos (dedupe por rótulo PT) a partir dos blends ajustados.
function topTraits(blends: Blend[], n = 3): { label: string; score: number }[] {
  const best = new Map<string, number>();
  for (const b of blends) {
    const label = AU_PT[b.name]; if (!label) continue;
    if (b.score > (best.get(label) ?? 0)) best.set(label, b.score);
  }
  return [...best.entries()].map(([label, score]) => ({ label, score }))
    .filter((t) => t.score >= 0.15).sort((a, b) => b.score - a.score).slice(0, n);
}

type Status = "idle" | "loading" | "on" | "error";

export default function ExpressoesPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<FaceMesh | null>(null);
  const smoothRef = useRef<Record<string, number>>({});
  const frameN = useRef(0);
  const baselineRef = useRef<Record<string, number> | null>(null);
  const calibRef = useRef<{ acc: Record<string, number>; n: number; until: number } | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [top, setTop] = useState<ExprScore>({ key: "neutro", label: "Neutro", emoji: "😐", score: 0 });
  const [bars, setBars] = useState<ExprScore[]>([]);
  const [traits, setTraits] = useState<{ label: string; score: number }[]>([]);
  const [face, setFace] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [calibrating, setCalibrating] = useState(false);

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

    // Coleta da linha de base "neutra" (calibração).
    const c = calibRef.current;
    if (c) {
      for (const b of f.blends) c.acc[b.name] = (c.acc[b.name] ?? 0) + b.score;
      c.n++;
      if (performance.now() >= c.until && c.n > 0) {
        const base: Record<string, number> = {};
        for (const k in c.acc) base[k] = c.acc[k] / c.n;
        baselineRef.current = base; calibRef.current = null;
        setCalibrated(true); setCalibrating(false);
      }
      return;   // durante a calibração não classifica
    }

    const adj = adjustBlends(f.blends, baselineRef.current);
    const { all } = analyzeExpression(adj);
    // Suaviza (EMA) pra evitar tremeliques.
    const s = smoothRef.current;
    for (const e of all) s[e.key] = (s[e.key] ?? 0) * 0.6 + e.score * 0.4;
    if ((frameN.current++ % 3) === 0) {
      const smoothed = all.map((e) => ({ ...e, score: s[e.key] ?? 0 })).sort((a, b) => b.score - a.score);
      const best = smoothed[0];
      const topSmoothed: ExprScore = best.score >= 0.3 ? best : { key: "neutro", label: "Neutro", emoji: "😐", score: 1 - best.score };
      setTop(topSmoothed); setBars(smoothed); setTraits(topTraits(adj)); setFace(true);
    }
  };

  function calibrar() {
    if (status !== "on") return;
    calibRef.current = { acc: {}, n: 0, until: performance.now() + 1000 };
    setCalibrating(true);
  }

  function foto() {
    const cv = canvasRef.current; if (!cv) return;
    cv.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `expressao-${top.key}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

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
    setStatus("idle"); setFace(false); setBars([]); setTraits([]);
    setCalibrated(false); setCalibrating(false); baselineRef.current = null; calibRef.current = null;
    const cv = canvasRef.current; const ctx = cv?.getContext("2d"); if (cv && ctx) ctx.clearRect(0, 0, cv.width, cv.height);
  }

  return (
    <>
      <PageHeader
        title="Expressões"
        description="Reconhecimento facial ao vivo — a malha mostra os traços analisados. Toque em Calibrar com o rosto neutro para afinar ao seu rosto. Roda 100% no seu aparelho; nada de vídeo sai do dispositivo."
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
                  {face && (
                    <span className="exp-conf">
                      {Math.round(top.score * 100)}%
                      {calibrated && <b className="exp-cal">• calibrado</b>}
                    </span>
                  )}
                </div>
              </div>

              {face && traits.length > 0 && (
                <div className="exp-traits">
                  {traits.map((t) => (
                    <span className="exp-trait" key={t.label}>{t.label}<i>{Math.round(t.score * 100)}</i></span>
                  ))}
                </div>
              )}

              {calibrating && <div className="exp-calibrating"><span className="exp-spin" /> Fique com o rosto neutro…</div>}

              <div className="exp-ctls">
                <button className="exp-ctl" onClick={calibrar} disabled={calibrating} title="Calibrar rosto neutro">◎ Calibrar</button>
                <button className="exp-ctl" onClick={foto} title="Salvar foto">📸</button>
                <button className="exp-ctl" onClick={stopCam} title="Parar">⏹</button>
              </div>
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
.exp-cal{font-weight:700;color:#5bd6a0;margin-left:4px;}

/* cluster de controles discretos (canto sup. direito) */
.exp-ctls{position:absolute;right:12px;top:12px;display:flex;gap:6px;}
.exp-ctl{font:inherit;font-size:11px;letter-spacing:.04em;color:#e7eef0;cursor:pointer;
  background:rgba(6,11,14,0.55);border:1px solid rgba(255,255,255,0.16);padding:7px 11px;border-radius:999px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:border-color .2s,opacity .2s;}
.exp-ctl:hover{border-color:rgba(92,240,255,0.5);}
.exp-ctl:disabled{opacity:.5;cursor:default;}

/* "traços ativos" ao vivo (reforça o que está sendo analisado) */
.exp-traits{position:absolute;left:12px;right:12px;bottom:12px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;pointer-events:none;}
.exp-trait{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#dff2f6;
  background:rgba(6,11,14,0.5);border:1px solid rgba(120,220,255,0.28);padding:4px 9px;border-radius:999px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
.exp-trait i{font-style:normal;font-size:10px;font-variant-numeric:tabular-nums;color:#5cf0ff;}

.exp-calibrating{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:9px;
  font-size:13px;color:#eafaff;letter-spacing:.02em;background:rgba(6,11,14,0.7);border:1px solid rgba(92,240,255,0.4);
  padding:10px 16px;border-radius:12px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}

.exp-bars{display:flex;flex-direction:column;gap:9px;padding:4px 2px;}
.exp-bar{display:grid;grid-template-columns:22px 78px 1fr 26px;align-items:center;gap:9px;}
.exp-bar-emoji{font-size:16px;text-align:center;}
.exp-bar-lbl{font-size:12px;color:var(--text,#dfe7ea);font-weight:600;}
.exp-bar-track{height:8px;border-radius:5px;background:rgba(255,255,255,0.07);overflow:hidden;}
.exp-bar-track i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 55%,transparent),var(--c));
  box-shadow:0 0 10px -2px var(--c);transition:width .12s linear;}
.exp-bar-val{font-size:11px;font-variant-numeric:tabular-nums;color:var(--muted,#8b969b);text-align:right;}
`;
