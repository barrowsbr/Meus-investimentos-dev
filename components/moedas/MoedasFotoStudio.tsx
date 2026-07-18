"use client";

// Estúdio de foto da coleção — tira/recebe uma foto e recorta em círculo no
// FORMATO EXATO das fotos do app (padrão CoinSnap): 512×512, fundo preto,
// moeda preenchendo o quadro (o app recorta em círculo na renderização).
// Fluxo de troca: abrir pelo dossiê da moeda (query `a`/`r` = paths atuais) →
// ajustar → baixar. O arquivo sai com o MESMO NOME do atual, então basta
// substituí-lo em public/colecao-moedas (o dono manda o arquivo no chat).
// Obs.: as fotos originais do CoinSnap são JPEG com extensão .webp — o export
// mantém a convenção (JPEG de alta qualidade com o nome original).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, Check, Download, Image as ImageIcon, RotateCw, Sun, Contrast, ZoomIn } from "lucide-react";

const EXPORT_PX = 512;          // lado do arquivo final
const COIN_FRAC = 0.98;         // diâmetro da moeda no quadro (igual às fotos atuais)

interface Alvo { face: "anverso" | "reverso"; path: string }

export default function MoedasFotoStudio() {
  const params = useSearchParams();
  const pathA = params.get("a");
  const pathR = params.get("r");
  const nome = params.get("nome");

  const alvos = useMemo<Alvo[]>(() => {
    const l: Alvo[] = [];
    if (pathA) l.push({ face: "anverso", path: pathA });
    if (pathR) l.push({ face: "reverso", path: pathR });
    return l;
  }, [pathA, pathR]);

  const [alvo, setAlvo] = useState(0);
  const atual = alvos[alvo] ?? null;
  const nomeArquivo = atual ? (atual.path.split("/").pop() ?? "moeda.webp") : `moeda-${Date.now()}.webp`;

  // Imagem carregada + ajustes do recorte
  const [img, setImg] = useState<ImageBitmap | HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);          // multiplicador sobre o "fit"
  const [rot, setRot] = useState(0);            // graus
  const [off, setOff] = useState({ x: 0, y: 0 }); // pan em px do palco
  const [brilho, setBrilho] = useState(1);
  const [contraste, setContraste] = useState(1);
  const [baixado, setBaixado] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileCamRef = useRef<HTMLInputElement | null>(null);
  const fileGalRef = useRef<HTMLInputElement | null>(null);

  const carregar = useCallback(async (f: File) => {
    try {
      // respeita a orientação EXIF (foto de celular vem "deitada" nos bytes)
      const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
      setImg(bmp);
    } catch {
      const url = URL.createObjectURL(f);
      const el = new Image();
      el.onload = () => setImg(el);
      el.src = url;
    }
    setZoom(1); setRot(0); setOff({ x: 0, y: 0 }); setBrilho(1); setContraste(1); setBaixado(false);
  }, []);

  // ── Desenho do palco (imagem + máscara circular) ────────────────────────────
  const desenhar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lado = canvas.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== lado * dpr) { canvas.width = lado * dpr; canvas.height = lado * dpr; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, lado, lado);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, lado, lado);

    const c = lado / 2;
    const R = (lado * COIN_FRAC) / 2;

    if (img) {
      const w = img.width, h = img.height;
      const fit = (R * 2) / Math.min(w, h); // menor lado da foto = diâmetro do círculo
      const s = fit * zoom;
      ctx.save();
      ctx.filter = `brightness(${brilho}) contrast(${contraste})`;
      ctx.translate(c + off.x, c + off.y);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(s, s);
      ctx.drawImage(img, -w / 2, -h / 2);
      ctx.restore();

      // máscara: escurece fora do círculo do recorte
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, lado, lado);
      ctx.arc(c, c, R, 0, Math.PI * 2, true);
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fill();
      ctx.restore();

      // contorno + mira
      ctx.strokeStyle = "rgba(245,158,11,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(245,158,11,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c - 10, c); ctx.lineTo(c + 10, c);
      ctx.moveTo(c, c - 10); ctx.lineTo(c, c + 10);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [img, zoom, rot, off, brilho, contraste]);

  useEffect(() => { desenhar(); }, [desenhar]);
  useEffect(() => {
    const on = () => desenhar();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [desenhar]);

  // ── Gestos: 1 dedo = pan · 2 dedos = pinça (zoom+rotação) · roda = zoom ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dedos = new Map<number, { x: number; y: number }>();
    let pinca: { dist: number; ang: number; zoom: number; rot: number } | null = null;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dedos.size === 2) {
        const [p1, p2] = [...dedos.values()];
        pinca = {
          dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
          ang: Math.atan2(p2.y - p1.y, p2.x - p1.x),
          zoom, rot,
        };
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = dedos.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      dedos.set(e.pointerId, cur);
      if (dedos.size === 1 && !pinca) {
        setOff((o) => ({ x: o.x + cur.x - prev.x, y: o.y + cur.y - prev.y }));
      } else if (dedos.size === 2 && pinca) {
        const [p1, p2] = [...dedos.values()];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        setZoom(Math.min(8, Math.max(0.3, pinca.zoom * (dist / pinca.dist))));
        setRot(pinca.rot + ((ang - pinca.ang) * 180) / Math.PI);
      }
    };
    const onUp = (e: PointerEvent) => {
      dedos.delete(e.pointerId);
      if (dedos.size < 2) pinca = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(8, Math.max(0.3, z * (e.deltaY < 0 ? 1.08 : 0.925))));
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [zoom, rot]);

  // ── Export 512×512 (mesma transformação, reescalada para o arquivo) ─────────
  const exportar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const lado = canvas.clientWidth;
    const k = EXPORT_PX / lado; // palco → arquivo
    const out = document.createElement("canvas");
    out.width = EXPORT_PX; out.height = EXPORT_PX;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, EXPORT_PX, EXPORT_PX);
    const c = EXPORT_PX / 2;
    const R = (lado * COIN_FRAC) / 2;
    const w = img.width, h = img.height;
    const s = ((R * 2) / Math.min(w, h)) * zoom * k;
    ctx.filter = `brightness(${brilho}) contrast(${contraste})`;
    ctx.translate(c + off.x * k, c + off.y * k);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(s, s);
    ctx.drawImage(img, -w / 2, -h / 2);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nomeArquivo;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setBaixado(true);
    }, "image/jpeg", 0.93);
  }, [img, zoom, rot, off, brilho, contraste, nomeArquivo]);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
          <Link href="/moedas" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10" aria-label="Voltar para a coleção"><ArrowLeft size={16} /></Link>
          <Camera size={17} className="text-amber-400" /> Estúdio de foto
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          {nome ? <>Refazendo a foto de <span className="font-semibold text-zinc-300">{nome}</span></> : "Recorte circular no formato da coleção (512×512, fundo preto)"}
        </p>
      </div>

      {alvos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {alvos.map((a, i) => (
            <button
              key={a.face}
              onClick={() => { setAlvo(i); setBaixado(false); }}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{
                background: i === alvo ? "rgba(245,158,11,0.16)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${i === alvo ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.12)"}`,
                color: i === alvo ? "#fbbf24" : "#a1a1aa",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.path} alt="" className="h-6 w-6 rounded-full object-cover" />
              {a.face === "anverso" ? "Anverso" : "Reverso"}
            </button>
          ))}
          <span className="font-mono text-[10px] text-zinc-600">{nomeArquivo}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => fileCamRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-amber-200"
          style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}
        >
          <Camera size={14} /> Tirar foto
        </button>
        <button
          onClick={() => fileGalRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-200"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}
        >
          <ImageIcon size={14} /> Da galeria
        </button>
        <input ref={fileCamRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) carregar(f); e.target.value = ""; }} />
        <input ref={fileGalRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) carregar(f); e.target.value = ""; }} />
      </div>

      <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
        <canvas
          ref={canvasRef}
          className="block aspect-square w-full"
          style={{ touchAction: "none", cursor: img ? "grab" : "default", background: "#000" }}
        />
      </div>

      {img ? (
        <>
          <p className="text-center text-[10px] text-zinc-600">arraste para posicionar · pinça gira e dá zoom · encoste a borda da moeda no círculo âmbar</p>

          <div className="space-y-2.5 rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {([
              ["Zoom", <ZoomIn key="i" size={12} />, zoom, 0.3, 8, 0.01, setZoom],
              ["Rotação", <RotateCw key="i" size={12} />, rot, -180, 180, 0.5, setRot],
              ["Brilho", <Sun key="i" size={12} />, brilho, 0.5, 1.8, 0.01, setBrilho],
              ["Contraste", <Contrast key="i" size={12} />, contraste, 0.5, 1.8, 0.01, setContraste],
            ] as Array<[string, React.ReactNode, number, number, number, number, (v: number) => void]>).map(([label, icone, valor, min, max, passo, setter]) => (
              <label key={label} className="flex items-center gap-2.5 text-[11px] text-zinc-400">
                <span className="flex w-20 shrink-0 items-center gap-1.5">{icone} {label}</span>
                <input
                  type="range" min={min} max={max} step={passo} value={valor}
                  onChange={(e) => setter(Number(e.target.value))}
                  className="h-1 flex-1 accent-amber-400"
                />
                <span className="w-12 shrink-0 text-right font-mono text-[10px] text-zinc-500">
                  {label === "Rotação" ? `${valor.toFixed(0)}°` : `${(valor * 100).toFixed(0)}%`}
                </span>
              </label>
            ))}
            <div className="flex justify-end">
              <button onClick={() => { setZoom(1); setRot(0); setOff({ x: 0, y: 0 }); setBrilho(1); setContraste(1); }} className="text-[10px] text-zinc-500 underline decoration-zinc-700 hover:text-zinc-300">
                restaurar ajustes
              </button>
            </div>
          </div>

          <button
            onClick={exportar}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-black"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          >
            {baixado ? <Check size={16} /> : <Download size={16} />}
            {baixado ? "Baixado!" : `Baixar ${nomeArquivo}`}
          </button>
          {baixado && (
            <p className="rounded-xl p-3 text-center text-[11px] leading-relaxed text-emerald-300/90" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
              Agora é só me mandar o arquivo no chat — como ele sai com o mesmo nome do atual, eu troco direto em <span className="font-mono">public/colecao-moedas</span> e a foto nova aparece em toda a coleção.
            </p>
          )}
        </>
      ) : (
        <p className="text-center text-[11px] leading-relaxed text-zinc-600">
          Dica: fotografe a moeda de cima, sobre um fundo escuro e com luz lateral suave —
          depois é só encaixar a borda dela no círculo âmbar. {alvos.length === 0 && "Para trocar a foto de uma moeda específica, abra o dossiê dela na coleção e toque em “Refazer foto”."}
        </p>
      )}
    </div>
  );
}
