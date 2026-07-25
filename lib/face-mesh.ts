// ─────────────────────────────────────────────────────────────────────────────
// Reconhecimento de expressões ON-DEVICE (webcam) — MediaPipe FaceLandmarker.
//
// Devolve a malha do rosto (468 landmarks + tesselação) e os 52 blendshapes
// (mouthSmile, jawOpen, browDown, ...). A partir dos blendshapes derivamos a
// expressão (feliz, surpreso, bravo, ...). Roda 100% no aparelho via WASM/WebGL;
// NADA de vídeo sai do dispositivo. Modelo e runtime servidos localmente de
// /mediapipe (sem CDN) — mesmo padrão do head-tracker.
// ─────────────────────────────────────────────────────────────────────────────

export interface Pt { x: number; y: number; z: number }
export interface Blend { name: string; score: number }
export interface FaceFrame { landmarks: Pt[] | null; blends: Blend[]; vw: number; vh: number }

export type Conn = ReadonlyArray<{ start: number; end: number }>;
export interface Conns {
  tess: Conn; oval: Conn; lips: Conn;
  leftEye: Conn; rightEye: Conn; leftBrow: Conn; rightBrow: Conn; leftIris: Conn; rightIris: Conn;
}

export interface ExprScore { key: string; label: string; emoji: string; score: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Deriva as expressões a partir dos blendshapes (0..1). Regras simples e
// legíveis — o "top" cai para Neutro quando nada se destaca.
export function analyzeExpression(blends: Blend[]): { top: ExprScore; all: ExprScore[] } {
  const m = new Map(blends.map((b) => [b.name, b.score]));
  const g = (n: string) => m.get(n) ?? 0;
  const avg = (a: string, b: string) => (g(a) + g(b)) / 2;

  const smile = avg("mouthSmileLeft", "mouthSmileRight");
  const jaw = g("jawOpen");
  const browDown = avg("browDownLeft", "browDownRight");
  const browOuter = avg("browOuterUpLeft", "browOuterUpRight");
  const browInner = g("browInnerUp");
  const eyeWide = avg("eyeWideLeft", "eyeWideRight");
  const frown = avg("mouthFrownLeft", "mouthFrownRight");
  const sneer = avg("noseSneerLeft", "noseSneerRight");
  const upperUp = avg("mouthUpperUpLeft", "mouthUpperUpRight");
  const press = avg("mouthPressLeft", "mouthPressRight");
  const blinkL = g("eyeBlinkLeft"), blinkR = g("eyeBlinkRight");
  const tongue = g("tongueOut");
  const pucker = g("mouthPucker");

  const feliz = clamp01(smile * 1.05);
  const surpreso = clamp01(jaw * 0.55 + browOuter * 0.3 + eyeWide * 0.25);
  const bravo = clamp01(browDown * 0.75 + press * 0.25);
  const triste = clamp01(frown * 0.6 + browInner * 0.45 - smile * 0.5);
  const nojo = clamp01(sneer * 0.6 + upperUp * 0.45 - smile * 0.3);
  const wink = clamp01(Math.abs(blinkL - blinkR) > 0.45 && Math.max(blinkL, blinkR) > 0.5 ? Math.max(blinkL, blinkR) : 0);
  const lingua = clamp01(tongue);
  const beijo = clamp01(pucker * 0.9 - smile * 0.4);

  const all: ExprScore[] = [
    { key: "feliz", label: "Feliz", emoji: "😄", score: feliz },
    { key: "surpreso", label: "Surpreso", emoji: "😲", score: surpreso },
    { key: "bravo", label: "Bravo", emoji: "😠", score: bravo },
    { key: "triste", label: "Triste", emoji: "😢", score: triste },
    { key: "nojo", label: "Nojo", emoji: "🤢", score: nojo },
    { key: "piscadinha", label: "Piscadinha", emoji: "😉", score: wink },
    { key: "lingua", label: "Língua", emoji: "😛", score: lingua },
    { key: "beijo", label: "Beijo", emoji: "😗", score: beijo },
  ];
  const best = [...all].sort((a, b) => b.score - a.score)[0];
  const top: ExprScore = best.score >= 0.3
    ? best
    : { key: "neutro", label: "Neutro", emoji: "😐", score: clamp01(1 - best.score) };
  return { top, all };
}

export class FaceMesh {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lm: any = null;
  private raf = 0;
  private running = false;
  private lastTs = 0;
  conns: Conns | null = null;

  constructor(private onFrame: (f: FaceFrame) => void) {}

  /** Abre a câmera (no <video> dado), carrega o modelo e começa. Lança se sem permissão. */
  async start(video: HTMLVideoElement): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.playsInline = true; video.muted = true; video.autoplay = true;
    video.setAttribute("playsinline", ""); video.setAttribute("muted", "");
    video.srcObject = this.stream;
    await video.play();
    this.video = video;

    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    this.lm = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const F = vision.FaceLandmarker as any;
    this.conns = {
      tess: F.FACE_LANDMARKS_TESSELATION, oval: F.FACE_LANDMARKS_FACE_OVAL, lips: F.FACE_LANDMARKS_LIPS,
      leftEye: F.FACE_LANDMARKS_LEFT_EYE, rightEye: F.FACE_LANDMARKS_RIGHT_EYE,
      leftBrow: F.FACE_LANDMARKS_LEFT_EYEBROW, rightBrow: F.FACE_LANDMARKS_RIGHT_EYEBROW,
      leftIris: F.FACE_LANDMARKS_LEFT_IRIS, rightIris: F.FACE_LANDMARKS_RIGHT_IRIS,
    };

    this.running = true;
    this.loop();
  }

  private loop = () => {
    if (!this.running || !this.video || !this.lm) return;
    const now = performance.now();
    const ts = now <= this.lastTs ? this.lastTs + 1 : now;   // timestamp estritamente crescente
    this.lastTs = ts;
    if (this.video.readyState >= 2) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let res: any = null;
      try { res = this.lm.detectForVideo(this.video, ts); } catch { res = null; }
      const lm: Pt[] | null = res?.faceLandmarks?.[0] ?? null;
      const cats = res?.faceBlendshapes?.[0]?.categories ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blends: Blend[] = cats.map((c: any) => ({ name: c.categoryName, score: c.score }));
      this.onFrame({ landmarks: lm, blends, vw: this.video.videoWidth, vh: this.video.videoHeight });
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.lm?.close) { try { this.lm.close(); } catch { /* ignore */ } }
    if (this.video) { try { this.video.srcObject = null; } catch { /* ignore */ } }
    this.lm = null; this.stream = null; this.video = null; this.conns = null;
  }
}
