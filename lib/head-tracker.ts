// ─────────────────────────────────────────────────────────────────────────────
// Head tracking ON-DEVICE (webcam) — MediaPipe FaceDetector (BlazeFace).
//
// Dá a posição normalizada da cabeça (x,y,z) relativa a um centro calibrado,
// para dirigir a perspectiva off-axis (head-coupled perspective — o efeito
// "janela 3D" que segue a cabeça). Roda 100% no aparelho via WASM/WebGL; NADA
// de vídeo sai do dispositivo. Modelo e runtime servidos localmente de
// /mediapipe (sem CDN).
//
// Suavização: One Euro filter (padrão de tracking — baixa latência + baixo
// jitter, ao contrário de um low-pass fixo). Calibra o "zero" na 1ª leitura.
// ─────────────────────────────────────────────────────────────────────────────

export interface Head { x: number; y: number; z: number; ok: boolean }

// ── One Euro filter ─────────────────────────────────────────────────────────
class LowPass {
  private y = 0;
  private started = false;
  filter(x: number, alpha: number): number {
    if (!this.started) { this.started = true; this.y = x; }
    else this.y = alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  reset() { this.started = false; }
}

class OneEuro {
  private xf = new LowPass();
  private dxf = new LowPass();
  private lastT: number | null = null;
  private lastX = 0;
  constructor(private minCutoff = 1.2, private beta = 0.03, private dCutoff = 1.0) {}
  private alpha(cutoff: number, dt: number) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x: number, tMs: number): number {
    let dt = this.lastT == null ? 1 / 60 : (tMs - this.lastT) / 1000;
    if (!(dt > 0)) dt = 1 / 60;
    this.lastT = tMs;
    const dx = (x - this.lastX) / dt; this.lastX = x;
    const edx = this.dxf.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xf.filter(x, this.alpha(cutoff, dt));
  }
  reset() { this.xf.reset(); this.dxf.reset(); this.lastT = null; this.lastX = 0; }
}

// ── Tracker ─────────────────────────────────────────────────────────────────
export class HeadTracker {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private detector: any = null;
  private raf = 0;
  private running = false;
  private lastTs = 0;
  private fx = new OneEuro(1.3, 0.04);
  private fy = new OneEuro(1.3, 0.04);
  private fz = new OneEuro(1.0, 0.02);
  private base: { x: number; y: number; z: number } | null = null;

  constructor(private onHead: (h: Head) => void) {}

  /** Abre a câmera, carrega o modelo e começa a rastrear. Lança se sem permissão. */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    const v = document.createElement("video");
    v.playsInline = true; v.muted = true; v.autoplay = true;
    v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
    // iOS Safari costuma exigir o <video> no DOM para tocar → escondido.
    v.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;z-index:-1;";
    document.body.appendChild(v);
    v.srcObject = this.stream;
    await v.play();
    this.video = v;

    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    this.detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite", delegate: "GPU" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });

    this.running = true;
    this.loop();
  }

  /** Recentraliza o "zero" na pose atual. */
  recalibrate() { this.base = null; }

  private loop = () => {
    if (!this.running || !this.video || !this.detector) return;
    const now = performance.now();
    // detectForVideo exige timestamp estritamente crescente.
    const ts = now <= this.lastTs ? this.lastTs + 1 : now;
    this.lastTs = ts;
    if (this.video.readyState >= 2) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let res: any = null;
      try { res = this.detector.detectForVideo(this.video, ts); } catch { res = null; }
      const det = res?.detections?.[0];
      const kp = det?.keypoints;
      if (kp && kp.length >= 2) {
        // BlazeFace: kp[0]=olho direito, kp[1]=olho esquerdo (normalizado 0..1).
        const cx = (kp[0].x + kp[1].x) / 2;
        const cy = (kp[0].y + kp[1].y) / 2;
        const dist = Math.hypot(kp[0].x - kp[1].x, kp[0].y - kp[1].y) || 0.1;
        const fx = this.fx.filter(cx, now);
        const fy = this.fy.filter(cy, now);
        const fz = this.fz.filter(dist, now);
        if (this.base == null) this.base = { x: fx, y: fy, z: fz };
        // Deltas relativos ao centro calibrado. x invertido → "janela" natural
        // (mover a cabeça p/ a direita revela o lado direito da sala).
        const hx = -(fx - this.base.x);
        const hy = fy - this.base.y;
        const hz = this.base.z > 0 ? (fz - this.base.z) / this.base.z : 0;
        this.onHead({ x: hx, y: hy, z: hz, ok: true });
      } else {
        this.onHead({ x: 0, y: 0, z: 0, ok: false });
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Para o tracking e libera a câmera. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.detector?.close) { try { this.detector.close(); } catch { /* ignore */ } }
    if (this.video) { try { this.video.srcObject = null; this.video.remove(); } catch { /* ignore */ } }
    this.detector = null; this.stream = null; this.video = null;
    this.fx.reset(); this.fy.reset(); this.fz.reset(); this.base = null;
  }
}
