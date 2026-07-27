"use client";

// Baú → Morse: réplica interativa do cartão-gadget de código Morse (árvore
// dicotômica gravada num cartão preto — nó redondo = ponto, retângulo = traço).
// Três brinquedos num só: o CARTÃO (a árvore acende o caminho da letra), o
// TELÉGRAFO (toque curto = ponto, longo = traço; decodifica ao vivo, com som)
// e o TRADUTOR (texto → morse com playback). Tudo client-side, zero API.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";

// ── Código Morse ─────────────────────────────────────────────────────────────
const MORSE: Record<string, string> = {
  A: "·−", B: "−···", C: "−·−·", D: "−··", E: "·", F: "··−·", G: "−−·", H: "····",
  I: "··", J: "·−−−", K: "−·−", L: "·−··", M: "−−", N: "−·", O: "−−−", P: "·−−·",
  Q: "−−·−", R: "·−·", S: "···", T: "−", U: "··−", V: "···−", W: "·−−", X: "−··−",
  Y: "−·−−", Z: "−−··",
  "0": "−−−−−", "1": "·−−−−", "2": "··−−−", "3": "···−−", "4": "····−",
  "5": "·····", "6": "−····", "7": "−−···", "8": "−−−··", "9": "−−−−·",
};
const DECODE = new Map(Object.entries(MORSE).map(([k, v]) => [v, k]));

// Ordem de aprendizado do treino (inspirada no método Koch: começa com códigos
// curtos/contrastantes e vai somando). A cada 5 acertos seguidos, +1 letra.
const ORDEM_TREINO = ["E", "T", "A", "N", "I", "M", "S", "O", "R", "U", "D", "K", "G", "W", "H", "V", "F", "L", "P", "J", "B", "X", "C", "Y", "Z", "Q"];
const NIVEL_KEY = "morse_treino_nivel";

// ── Geometria da árvore (só letras, como no cartão físico) ───────────────────
// Convenção do gadget: TRAÇO ramifica pra ESQUERDA, PONTO pra DIREITA (T à
// esquerda, E à direita). O deslocamento halva a cada nível.
interface NodeDef { code: string; letter: string; x: number; y: number }
const CX = 180, TOP = 84, DY = 59, SPREAD = 80;
function buildTree(): NodeDef[] {
  const nodes: NodeDef[] = [];
  for (const [letter, code] of Object.entries(MORSE)) {
    if (!/^[A-Z]$/.test(letter)) continue;
    let x = CX;
    for (let i = 0; i < code.length; i++) x += (code[i] === "−" ? -1 : 1) * (SPREAD / Math.pow(2, i));
    nodes.push({ code, letter, x, y: TOP + code.length * DY });
  }
  return nodes;
}
const TREE = buildTree();
const BY_CODE = new Map(TREE.map((n) => [n.code, n]));

// ── Áudio (Web Audio — criado no 1º gesto) ───────────────────────────────────
function useMorseAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const ensure = useCallback(() => {
    if (!ctxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);
  const startTone = useCallback(() => {
    const ctx = ensure();
    if (oscRef.current) return;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 620;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.012);
    osc.connect(gain); gain.connect(ctx.destination); osc.start();
    oscRef.current = { osc, gain };
  }, [ensure]);
  const stopTone = useCallback(() => {
    const ctx = ctxRef.current, cur = oscRef.current;
    if (!ctx || !cur) return;
    cur.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.02);
    cur.osc.stop(ctx.currentTime + 0.03);
    oscRef.current = null;
  }, []);
  const beep = useCallback((ms: number) => {
    const ctx = ensure();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 620;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    gain.gain.setValueAtTime(0.22, t + ms / 1000 - 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + ms / 1000 + 0.01);
  }, [ensure]);
  useEffect(() => () => { stopTone(); void ctxRef.current?.close().catch(() => {}); }, [stopTone]);
  return { startTone, stopTone, beep };
}

// ── O cartão (SVG) ───────────────────────────────────────────────────────────
function MorseCard({ activeCode }: { activeCode: string }) {
  // Prefixos do código ativo → nós acesos no caminho.
  const lit = useMemo(() => {
    const s = new Set<string>();
    for (let i = 1; i <= activeCode.length; i++) s.add(activeCode.slice(0, i));
    return s;
  }, [activeCode]);

  const parentPos = (code: string): [number, number] =>
    code.length === 1 ? [CX, TOP] : (() => { const p = BY_CODE.get(code.slice(0, -1))!; return [p.x, p.y]; })();

  return (
    <svg viewBox="0 0 360 400" className="mor-card" aria-label="Cartão do código Morse">
      {/* cartão: borda clara + face preta + furo (como o gadget) */}
      <rect x="4" y="4" width="352" height="392" rx="20" fill="#d8dcd6" />
      <rect x="9" y="9" width="342" height="382" rx="16" fill="#141518" />
      <circle cx="322" cy="38" r="12" fill="#d8dcd6" />
      <circle cx="322" cy="38" r="7.5" fill="var(--mor-bg, #0b0e11)" />

      <text x="46" y="52" className="mor-title">MORSE</text>
      <text x="216" y="52" className="mor-title">CODE</text>
      {/* antena no topo da árvore */}
      <g stroke="#8d949c" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d={`M${CX} ${TOP} V ${TOP - 22}`} />
        <path d={`M${CX - 11} ${TOP - 34} L${CX} ${TOP - 22} L${CX + 11} ${TOP - 34}`} />
        <path d={`M${CX - 11} ${TOP - 34} H ${CX + 11}`} />
      </g>

      {/* ligações */}
      {TREE.map((n) => {
        const [px, py] = parentPos(n.code);
        const on = lit.has(n.code);
        return <path key={`l${n.code}`} d={`M${px} ${py} L${n.x} ${py} L${n.x} ${n.y}`} fill="none"
          stroke={on ? "#67e8f9" : "#4a5058"} strokeWidth={on ? 1.8 : 1.1} opacity={on ? 0.95 : 0.8} />;
      })}

      {/* nós: redondo = ponto, retângulo = traço (o ÚLTIMO símbolo da letra) */}
      {TREE.map((n) => {
        const dot = n.code.endsWith("·");
        const on = lit.has(n.code);
        const fill = on ? "#67e8f9" : "#63696f";
        const glow = on ? { filter: "drop-shadow(0 0 5px rgba(103,232,249,0.9))" } : undefined;
        const leaf = n.code.length >= 4;
        const lx = leaf ? n.x : n.x + (n.x < CX ? -14 : 14);
        const ly = leaf ? n.y + 17 : n.y + 3.5;
        return (
          <g key={n.code}>
            {dot
              ? <circle cx={n.x} cy={n.y} r="7" fill={fill} style={glow} />
              : <rect x={n.x - 8.5} y={n.y - 5} width="17" height="10" rx="2" fill={fill} style={glow} />}
            <text x={lx} y={ly} className={`mor-letter${on ? " on" : ""}`}
              textAnchor={leaf ? "middle" : n.x < CX ? "end" : "start"}>{n.letter}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function MorsePage() {
  const { startTone, stopTone, beep } = useMorseAudio();

  // Telégrafo
  const [buffer, setBuffer] = useState("");
  const [decoded, setDecoded] = useState("");
  const [keyDown, setKeyDown] = useState(false);
  const pressStart = useRef(0);
  const letterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferRef = useRef("");

  // Treino — refs preenchidas mais abaixo (o commitLetter desvia pra cá quando
  // o modo "bater" está ativo).
  const treinoRef = useRef<"ouvir" | "bater" | null>(null);
  const responderRef = useRef<((letra: string) => void) | null>(null);

  const clearTimers = () => {
    if (letterTimer.current) { clearTimeout(letterTimer.current); letterTimer.current = null; }
    if (spaceTimer.current) { clearTimeout(spaceTimer.current); spaceTimer.current = null; }
  };
  const commitLetter = useCallback(() => {
    const code = bufferRef.current;
    if (!code) return;
    bufferRef.current = ""; setBuffer("");
    // Modo treino "bater": a letra batida vira RESPOSTA, não texto.
    if (treinoRef.current === "bater") {
      responderRef.current?.(DECODE.get(code) ?? "?");
      return;
    }
    setDecoded((t) => t + (DECODE.get(code) ?? "?"));
    spaceTimer.current = setTimeout(() => setDecoded((t) => (t && !t.endsWith(" ") ? t + " " : t)), 1000);
  }, []);

  const keyPress = useCallback(() => {
    clearTimers();
    pressStart.current = performance.now();
    setKeyDown(true);
    startTone();
  }, [startTone]);
  const keyRelease = useCallback(() => {
    if (!pressStart.current) return;
    const dur = performance.now() - pressStart.current;
    pressStart.current = 0;
    setKeyDown(false);
    stopTone();
    const sym = dur < 220 ? "·" : "−";
    bufferRef.current = (bufferRef.current + sym).slice(0, 6);
    setBuffer(bufferRef.current);
    letterTimer.current = setTimeout(commitLetter, 700);
  }, [stopTone, commitLetter]);
  useEffect(() => () => clearTimers(), []);

  // Tradutor texto → morse (com playback)
  const [texto, setTexto] = useState("");
  const [tocando, setTocando] = useState(false);
  const [play, setPlay] = useState<{ letter: string; upTo: number } | null>(null);
  const cancelRef = useRef(false);

  const morseDoTexto = useMemo(() =>
    texto.toUpperCase().split("").map((ch) => (ch === " " ? "/" : MORSE[ch] ?? null)).filter(Boolean).join(" "),
  [texto]);

  const tocar = useCallback(async () => {
    if (tocando) { cancelRef.current = true; return; }
    const U = 80;  // unidade (ms): ponto=1u, traço=3u, gaps 1/3/7
    cancelRef.current = false;
    setTocando(true);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const ch of texto.toUpperCase()) {
      if (cancelRef.current) break;
      if (ch === " ") { setPlay(null); await sleep(U * 7); continue; }
      const code = MORSE[ch];
      if (!code) continue;
      for (let i = 0; i < code.length; i++) {
        if (cancelRef.current) break;
        setPlay({ letter: ch, upTo: i + 1 });
        const dur = code[i] === "·" ? U : U * 3;
        beep(dur);
        await sleep(dur + U);
      }
      await sleep(U * 2);   // (já esperou 1u) → gap de letra = 3u
    }
    setPlay(null);
    setTocando(false);
  }, [texto, tocando, beep]);

  // ── Treino (aprender Morse) ────────────────────────────────────────────────
  const [treino, setTreino] = useState<"ouvir" | "bater" | null>(null);
  const [nivel, setNivel] = useState(4);          // quantas letras desbloqueadas
  const [alvo, setAlvo] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  const [acertos, setAcertos] = useState(0);
  const [rodadas, setRodadas] = useState(0);
  const [fb, setFb] = useState<{ ok: boolean; letra: string; nova?: string } | null>(null);
  const alvoRef = useRef<string | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { treinoRef.current = treino; }, [treino]);
  useEffect(() => { alvoRef.current = alvo; }, [alvo]);
  useEffect(() => {
    try { const v = Number(localStorage.getItem(NIVEL_KEY)); if (v >= 4 && v <= 26) setNivel(v); } catch { /* sem storage */ }
  }, []);
  useEffect(() => () => { if (fbTimer.current) clearTimeout(fbTimer.current); }, []);

  const playCode = useCallback(async (code: string) => {
    const U = 80;
    for (const s of code) {
      const d = s === "·" ? U : U * 3;
      beep(d);
      await new Promise((r) => setTimeout(r, d + U));
    }
  }, [beep]);

  const proximaRodada = useCallback((modo: "ouvir" | "bater", nivelAtual: number) => {
    setFb(null);
    const set = ORDEM_TREINO.slice(0, nivelAtual);
    let l: string;
    do {
      // 35% de chance de puxar uma das 2 letras mais novas (fixa o recém-aprendido).
      l = Math.random() < 0.35 && set.length > 2
        ? set[set.length - 1 - Math.floor(Math.random() * 2)]
        : set[Math.floor(Math.random() * set.length)];
    } while (l === alvoRef.current && set.length > 1);
    setAlvo(l);
    if (modo === "ouvir") setTimeout(() => { void playCode(MORSE[l]); }, 300);
  }, [playCode]);

  const responder = useCallback((letra: string) => {
    const alvoL = alvoRef.current;
    if (!alvoL || fb) return;
    const ok = letra === alvoL;
    setRodadas((r) => r + 1);
    let nivelNovo = nivel;
    if (ok) {
      setAcertos((a) => a + 1);
      const ns = seq + 1;
      setSeq(ns);
      if (ns % 5 === 0 && nivel < 26) {
        nivelNovo = nivel + 1;
        setNivel(nivelNovo);
        try { localStorage.setItem(NIVEL_KEY, String(nivelNovo)); } catch { /* sem storage */ }
      }
    } else setSeq(0);
    setFb({ ok, letra: alvoL, nova: nivelNovo > nivel ? ORDEM_TREINO[nivelNovo - 1] : undefined });
    if (!ok) void playCode(MORSE[alvoL]);   // reforço: ouve o certo junto do caminho aceso
    if (fbTimer.current) clearTimeout(fbTimer.current);
    fbTimer.current = setTimeout(() => {
      const m = treinoRef.current;
      if (m) proximaRodada(m, nivelNovo);
    }, ok ? 1000 : 2200);
  }, [fb, nivel, seq, playCode, proximaRodada]);
  useEffect(() => { responderRef.current = responder; }, [responder]);

  const iniciarTreino = (modo: "ouvir" | "bater") => {
    setTreino(modo); setSeq(0); setFb(null);
    bufferRef.current = ""; setBuffer("");
    proximaRodada(modo, nivel);
  };
  const pararTreino = () => {
    setTreino(null); setAlvo(null); setFb(null);
    if (fbTimer.current) clearTimeout(fbTimer.current);
  };
  const desbloqueadas = ORDEM_TREINO.slice(0, nivel);

  // Código aceso no cartão: telégrafo → feedback do treino → playback do tradutor.
  // (Durante a pergunta do "ouvir" o cartão fica APAGADO — senão entrega a resposta.)
  const fbCode = fb ? (MORSE[fb.letra] ?? "") : "";
  const activeCode = buffer || fbCode || (play && /^[A-Z]$/.test(play.letter) ? (MORSE[play.letter] ?? "").slice(0, play.upTo) : "");

  return (
    <>
      <PageHeader
        title="Morse"
        description="O cartão-gadget do código Morse, vivo: siga a árvore (redondo = ponto, retângulo = traço), bata no telégrafo ou traduza um texto — o caminho acende no cartão."
      />

      <div className="mor-wrap">
        <div className="mor-left">
          <MorseCard activeCode={activeCode} />
        </div>

        <div className="mor-right">
          {/* Treino — aprender de verdade (progressão estilo Koch) */}
          <section className="mor-panel">
            <h3 className="mor-h">Treino</h3>
            {!treino ? (
              <>
                <p className="mor-sub">
                  Aprenda progressivamente: começa com {Math.min(4, nivel)} letras e a cada <b>5 acertos seguidos</b> desbloqueia
                  mais uma. Nível atual: <b>{nivel}</b>/26 letras.
                </p>
                <div className="mor-treino-botoes">
                  <button className="mor-play" onClick={() => iniciarTreino("ouvir")}>🎧 Ouvir e adivinhar</button>
                  <button className="mor-play alt" onClick={() => iniciarTreino("bater")}>⚡ Ler e bater</button>
                </div>
              </>
            ) : (
              <>
                <div className="mor-treino-status">
                  <span>Nível <b>{nivel}</b>/26</span>
                  <span>Sequência <b>{seq}</b></span>
                  <span>Acertos <b>{acertos}</b>/{rodadas}</span>
                  <button className="mor-clear" onClick={pararTreino}>Parar</button>
                </div>

                {treino === "ouvir" ? (
                  <>
                    <p className="mor-sub">Ouça e responda — qual letra é essa?</p>
                    <div className="mor-treino-acao">
                      <button className="mor-play" onClick={() => { if (alvo && !fb) void playCode(MORSE[alvo]); }}>🔁 Ouvir de novo</button>
                    </div>
                    <div className="mor-keypad">
                      {[...desbloqueadas].sort().map((l) => (
                        <button key={l} className="mor-kp" disabled={!!fb} onClick={() => responder(l)}>{l}</button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mor-sub">Bata esta letra no telégrafo abaixo (curto = ponto · segurado = traço):</p>
                    <div className="mor-alvo">{alvo}</div>
                  </>
                )}

                {fb && (
                  <div className={`mor-fb ${fb.ok ? "ok" : "erro"}`}>
                    {fb.ok ? "✓ Acertou!" : <>✗ Era <b>{fb.letra}</b> ({MORSE[fb.letra]}) — olhe o caminho no cartão</>}
                    {fb.nova && <span className="mor-nova">🔓 Nova letra: <b>{fb.nova}</b> ({MORSE[fb.nova]})</span>}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Telégrafo */}
          <section className="mor-panel">
            <h3 className="mor-h">Telégrafo</h3>
            <p className="mor-sub">Toque curto = ponto · segurado = traço. Pausa fecha a letra; pausa longa dá espaço.</p>
            <div className="mor-display">
              <span className="mor-decoded">{decoded || <i>—</i>}</span>
              <span className="mor-buffer">{buffer}</span>
            </div>
            <div className="mor-key-row">
              <button
                className={`mor-key${keyDown ? " down" : ""}`}
                onPointerDown={(e) => { e.preventDefault(); keyPress(); }}
                onPointerUp={keyRelease}
                onPointerLeave={() => { if (keyDown) keyRelease(); }}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="Tecla do telégrafo"
              >
                <span className="mor-key-cap" />
              </button>
              <button className="mor-clear" onClick={() => { clearTimers(); bufferRef.current = ""; setBuffer(""); setDecoded(""); }}>
                Limpar
              </button>
            </div>
          </section>

          {/* Tradutor */}
          <section className="mor-panel">
            <h3 className="mor-h">Tradutor</h3>
            <input
              className="mor-input"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva algo (A–Z, 0–9)…"
              maxLength={60}
            />
            <div className="mor-out">{morseDoTexto || <i>· − · −</i>}</div>
            <button className="mor-play" onClick={() => void tocar()} disabled={!morseDoTexto}>
              {tocando ? "⏹ Parar" : "▶ Tocar no cartão"}
            </button>
            {play && <span className="mor-playing">tocando: <b>{play.letter}</b></span>}
          </section>
        </div>
      </div>

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.mor-wrap{display:grid;grid-template-columns:1fr;gap:16px;max-width:62rem;--mor-bg:var(--bg,#0b0e11);}
@media(min-width:880px){.mor-wrap{grid-template-columns:1.15fr 1fr;align-items:start;}}
.mor-left{display:flex;justify-content:center;}
.mor-card{width:100%;max-width:420px;height:auto;display:block;filter:drop-shadow(0 26px 40px rgba(0,0,0,0.55));}
.mor-title{font-family:ui-sans-serif,system-ui,sans-serif;font-size:21px;font-weight:600;letter-spacing:0.34em;fill:#aeb4ba;}
.mor-letter{font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.04em;fill:#8d949c;}
.mor-letter.on{fill:#bff5ff;}

.mor-right{display:flex;flex-direction:column;gap:14px;}
.mor-panel{border-radius:16px;padding:16px;background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012));border:1px solid rgba(255,255,255,0.09);}
.mor-h{margin:0 0 4px;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif;font-size:17px;font-weight:500;color:#f1f5f6;}
.mor-sub{margin:0 0 10px;font-size:11.5px;line-height:1.4;color:var(--muted,#8b969b);}

.mor-display{min-height:52px;border-radius:10px;background:#0a0d10;border:1px solid rgba(103,232,249,0.18);padding:10px 12px;display:flex;flex-direction:column;gap:2px;}
.mor-decoded{font-family:ui-monospace,"SF Mono",monospace;font-size:16px;letter-spacing:0.14em;color:#d9f6fb;min-height:20px;word-break:break-all;}
.mor-decoded i{color:#3f4850;font-style:normal;}
.mor-buffer{font-size:20px;line-height:1;letter-spacing:0.2em;color:#67e8f9;min-height:22px;}

.mor-key-row{display:flex;align-items:center;gap:14px;margin-top:12px;}
.mor-key{width:86px;height:86px;border-radius:50%;border:1px solid rgba(255,255,255,0.14);cursor:pointer;touch-action:none;
  background:radial-gradient(circle at 34% 30%,#3a4148,#15181c 70%);
  box-shadow:0 10px 22px -8px rgba(0,0,0,0.8),inset 0 2px 0 rgba(255,255,255,0.08);display:grid;place-items:center;
  transition:transform .08s ease,box-shadow .08s ease;-webkit-tap-highlight-color:transparent;user-select:none;}
.mor-key .mor-key-cap{width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 36% 30%,#79e6f6,#1d7f92 75%);
  box-shadow:inset 0 -3px 6px rgba(0,0,0,0.4),0 0 14px -2px rgba(103,232,249,0.4);transition:box-shadow .08s ease;}
.mor-key.down{transform:translateY(2px) scale(0.98);}
.mor-key.down .mor-key-cap{box-shadow:inset 0 3px 8px rgba(0,0,0,0.5),0 0 22px -2px rgba(103,232,249,0.9);}
.mor-clear{font:inherit;font-size:11px;letter-spacing:0.06em;color:var(--muted,#8b969b);background:transparent;border:1px solid rgba(255,255,255,0.12);
  padding:8px 14px;border-radius:999px;cursor:pointer;}
.mor-clear:hover{color:#dfe9ec;border-color:rgba(255,255,255,0.24);}

.mor-input{width:100%;font:inherit;font-size:13px;color:#e9f2f4;background:#0a0d10;border:1px solid rgba(255,255,255,0.12);border-radius:10px;
  padding:9px 12px;outline:none;}
.mor-input:focus{border-color:rgba(103,232,249,0.45);}
.mor-out{margin-top:8px;min-height:34px;border-radius:10px;background:#0a0d10;border:1px solid rgba(255,255,255,0.08);padding:8px 12px;
  font-size:15px;letter-spacing:0.16em;line-height:1.6;color:#9fd7e0;word-break:break-all;}
.mor-out i{color:#3f4850;font-style:normal;}
.mor-play{margin-top:10px;font:inherit;font-size:12px;font-weight:700;letter-spacing:0.04em;color:#04121a;cursor:pointer;
  background:linear-gradient(180deg,#5cf0ff,#35c9dd);border:none;padding:9px 16px;border-radius:999px;box-shadow:0 8px 20px -8px rgba(92,240,255,0.6);}
.mor-play:disabled{opacity:0.4;cursor:default;box-shadow:none;}
.mor-playing{margin-left:10px;font-size:11px;color:var(--muted,#8b969b);}
.mor-playing b{color:#67e8f9;}

/* Treino */
.mor-treino-botoes{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;}
.mor-play.alt{color:#eafff5;background:linear-gradient(180deg,#3ddc84,#22a05e);box-shadow:0 8px 20px -8px rgba(61,220,132,0.55);}
.mor-treino-status{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--muted,#8b969b);margin-bottom:8px;}
.mor-treino-status b{color:#dff2f6;}
.mor-treino-status .mor-clear{margin-left:auto;padding:5px 11px;}
.mor-treino-acao{margin-bottom:10px;}
.mor-keypad{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:6px;}
.mor-kp{font:inherit;font-size:14px;font-weight:700;color:#dfeef2;background:#0a0d10;border:1px solid rgba(255,255,255,0.12);
  border-radius:9px;padding:9px 0;cursor:pointer;transition:border-color .15s,color .15s;-webkit-tap-highlight-color:transparent;}
.mor-kp:hover{border-color:rgba(103,232,249,0.5);color:#bff5ff;}
.mor-kp:disabled{opacity:0.45;cursor:default;}
.mor-alvo{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif;font-size:64px;line-height:1;
  color:#f3f6f7;text-align:center;padding:8px 0 4px;text-shadow:0 0 24px rgba(103,232,249,0.35);}
.mor-fb{margin-top:10px;font-size:12.5px;border-radius:10px;padding:9px 12px;display:flex;flex-direction:column;gap:3px;}
.mor-fb.ok{color:#8ff0bf;background:rgba(61,220,132,0.08);border:1px solid rgba(61,220,132,0.3);}
.mor-fb.erro{color:#ffb3b3;background:rgba(255,107,107,0.07);border:1px solid rgba(255,107,107,0.3);}
.mor-fb b{color:inherit;}
.mor-nova{font-size:11.5px;color:#ffe08a;}
`;
