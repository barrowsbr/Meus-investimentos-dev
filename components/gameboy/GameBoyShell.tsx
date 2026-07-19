"use client";

// Game Boy no app — emulador EMBUTIDO (WasmBoy, roda 100% no navegador, sem
// CDN nem servidor de emulação). Pensado para o Pokémon Gold Spaceworld '97
// (demo traduzido — WavelinkStudios/pokegold-spaceworld-en-old), mas toca
// qualquer .gb/.gbc.
//
// ROM: 1) se existir /roms/pokegold-spaceworld-en.gb no repo, carrega sozinha;
//      2) senão, a última ROM escolhida fica salva no APARELHO (IndexedDB) e
//         recarrega nas próximas visitas; 3) senão, botão "Escolher ROM".
//      A ROM em si NÃO é distribuída pelo app por padrão (direitos da
//      Nintendo) — o dono carrega o arquivo que já possui.
// Controles: toque (D-pad + A/B + Start/Select, multi-toque) e teclado
// (setas, Z=B, X=A, Enter=Start, Shift=Select — padrão do WasmBoy).
// Save states ficam no IndexedDB do WasmBoy (Salvar / Continuar).

import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Save, RotateCcw, History, Upload, Joystick } from "lucide-react";
import EmulatorJsPanel from "./EmulatorJsPanel";
import { ROM_DO_REPO, idbLerRom, idbGravarRom } from "./rom-store";

// WasmBoy não tem tipos publicados — superfície mínima usada aqui.
interface WasmBoyApi {
  config(opts: Record<string, unknown>, canvas: HTMLCanvasElement): Promise<void>;
  loadROM(rom: Uint8Array): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  reset(): Promise<void>;
  saveState(): Promise<unknown>;
  getSaveStates(): Promise<Array<{ date: number }>>;
  loadState(state: unknown): Promise<void>;
  setJoypadState(state: Record<string, boolean>): void;
  enableDefaultJoypad(): void;
  disableDefaultJoypad(): void;
  saveLoadedCartridge(): Promise<unknown>;
}

type Estado = "carregando" | "sem-rom" | "pronto" | "rodando";

const JOYPAD_ZERADO = { UP: false, RIGHT: false, DOWN: false, LEFT: false, A: false, B: false, SELECT: false, START: false };

export default function GameBoyShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wbRef = useRef<WasmBoyApi | null>(null);
  const joyRef = useRef<Record<string, boolean>>({ ...JOYPAD_ZERADO });
  const [estado, setEstado] = useState<Estado>("carregando");
  const [nomeRom, setNomeRom] = useState("");
  const [msg, setMsg] = useState("");
  const [modo, setModo] = useState<"classico" | "emulatorjs">("classico");

  const trocarModo = (m: "classico" | "emulatorjs") => {
    if (m === "emulatorjs" && estado === "rodando") {
      // pausa o console clássico para os dois não disputarem áudio/CPU
      wbRef.current?.saveLoadedCartridge().catch(() => {});
      wbRef.current?.pause().catch(() => {});
      setEstado("pronto");
    }
    setModo(m);
  };

  const configurar = useCallback(async (): Promise<WasmBoyApi> => {
    if (wbRef.current) return wbRef.current;
    const mod = (await import("wasmboy")) as unknown as { WasmBoy: WasmBoyApi };
    const wb = mod.WasmBoy;
    await wb.config({
      useGbcWhenOptional: true,
      isAudioEnabled: true,
      frameSkip: 1,
      audioBatchProcessing: true,
      audioAccumulateSamples: true,
      tileRendering: true,
      tileCaching: true,
      gameboyFPSCap: 60,
    }, canvasRef.current!);
    wbRef.current = wb;
    return wb;
  }, []);

  const carregarRom = useCallback(async (nome: string, dados: Uint8Array) => {
    const wb = await configurar();
    await wb.loadROM(dados);
    setNomeRom(nome);
    setEstado("pronto");
    setMsg("");
  }, [configurar]);

  // Na montagem: ROM do repo → ROM salva no aparelho → pedir arquivo.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(ROM_DO_REPO);
        if (r.ok && (r.headers.get("content-type") ?? "").includes("octet")) {
          const buf = new Uint8Array(await r.arrayBuffer());
          if (vivo && buf.length > 0x8000) { await carregarRom("Pokémon Gold Spaceworld '97 (EN)", buf); return; }
        }
      } catch { /* não existe no repo — segue */ }
      const salvo = await idbLerRom();
      if (vivo && salvo?.dados?.length) { await carregarRom(salvo.nome, new Uint8Array(salvo.dados)); return; }
      if (vivo) setEstado("sem-rom");
    })();
    return () => {
      vivo = false;
      // guarda o save da bateria (SRAM) ao sair da página
      wbRef.current?.saveLoadedCartridge().catch(() => {});
      wbRef.current?.pause().catch(() => {});
    };
  }, [carregarRom]);

  // ⚠️ SEM `accept` nos inputs: o iOS não conhece extensões de ROM e
  // acinzentaria os arquivos no seletor — a validação acontece aqui.
  const escolherArquivo = async (f: File | null) => {
    if (!f) return;
    if (!/\.(gb|gbc|bin)$/i.test(f.name)) {
      setMsg(/\.(gba|md|gen|smd|sfc|smc)$/i.test(f.name)
        ? `"${f.name}" é de outro console — use o modo EmulatorJS (Abrir arquivo…).`
        : `"${f.name}" não parece uma ROM de Game Boy (.gb/.gbc).`);
      return;
    }
    const dados = new Uint8Array(await f.arrayBuffer());
    if (dados.length < 0x8000) { setMsg("Arquivo pequeno demais para ser uma ROM de Game Boy."); return; }
    await idbGravarRom(f.name, dados);
    await carregarRom(f.name, dados);
  };

  const ligar = async () => {
    const wb = wbRef.current;
    if (!wb) return;
    wb.enableDefaultJoypad();
    await wb.play();
    setEstado("rodando");
  };

  const salvar = async () => {
    const wb = wbRef.current;
    if (!wb || estado !== "rodando") return;
    await wb.saveState();
    await wb.saveLoadedCartridge().catch(() => {});
    await wb.play();
    setMsg("Estado salvo ✓");
    setTimeout(() => setMsg(""), 2500);
  };

  const continuar = async () => {
    const wb = wbRef.current;
    if (!wb) return;
    const states = await wb.getSaveStates().catch(() => []);
    if (!states?.length) { setMsg("Nenhum estado salvo ainda."); return; }
    const ultimo = [...states].sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
    await wb.loadState(ultimo);
    wb.enableDefaultJoypad();
    await wb.play();
    setEstado("rodando");
    setMsg("Estado restaurado ✓");
    setTimeout(() => setMsg(""), 2500);
  };

  const reiniciar = async () => {
    const wb = wbRef.current;
    if (!wb) return;
    await wb.reset();
    wb.enableDefaultJoypad();
    await wb.play();
    setEstado("rodando");
  };

  // ── Controles de toque (multi-toque: cada botão tem seus pointer events) ───
  const tecla = (k: keyof typeof JOYPAD_ZERADO, pressionada: boolean) => {
    joyRef.current[k] = pressionada;
    wbRef.current?.setJoypadState(joyRef.current);
  };
  const botaoToque = (k: keyof typeof JOYPAD_ZERADO) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); tecla(k, true); },
    onPointerUp: () => tecla(k, false),
    onPointerCancel: () => tecla(k, false),
    onPointerLeave: () => tecla(k, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const btnBase = "flex items-center justify-center select-none rounded-lg text-[11px] font-semibold";
  const estiloAcao = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fcd9a0" } as const;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-100"><Gamepad2 size={18} className="text-amber-400" /> Game Boy</h1>
          <p className="text-xs text-zinc-500">Pokémon Gold Spaceworld ’97 — emulador embutido (roda no seu aparelho; toque e teclado)</p>
        </div>
        {modo === "classico" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <label className={`${btnBase} cursor-pointer gap-1.5 px-2.5 py-2`} style={estiloAcao}>
              <Upload size={12} /> ROM
              <input type="file" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)} />
            </label>
            <button onClick={salvar} disabled={estado !== "rodando"} className={`${btnBase} gap-1.5 px-2.5 py-2 disabled:opacity-40`} style={estiloAcao}><Save size={12} /> Salvar</button>
            <button onClick={continuar} disabled={estado === "carregando" || estado === "sem-rom"} className={`${btnBase} gap-1.5 px-2.5 py-2 disabled:opacity-40`} style={estiloAcao}><History size={12} /> Continuar</button>
            <button onClick={reiniciar} disabled={estado === "carregando" || estado === "sem-rom"} className={`${btnBase} gap-1.5 px-2.5 py-2 disabled:opacity-40`} style={estiloAcao}><RotateCcw size={12} /> Reiniciar</button>
          </div>
        )}
      </div>

      {/* seletor de emulador */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { m: "classico" as const, icone: <Gamepad2 size={14} />, titulo: "Console clássico", sub: "WasmBoy — shell de Game Boy do app" },
          { m: "emulatorjs" as const, icone: <Joystick size={14} />, titulo: "EmulatorJS", sub: "RetroArch em wasm + jogos prontos" },
        ]).map(({ m, icone, titulo, sub }) => (
          <button
            key={m}
            onClick={() => trocarModo(m)}
            className="flex items-center gap-2.5 rounded-xl p-3 text-left"
            style={modo === m
              ? { background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.5)" }
              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <span className={modo === m ? "text-amber-300" : "text-zinc-500"}>{icone}</span>
            <span className="min-w-0">
              <span className={`block truncate text-xs font-bold ${modo === m ? "text-amber-100" : "text-zinc-300"}`}>{titulo}</span>
              <span className="block truncate text-[10px] text-zinc-500">{sub}</span>
            </span>
          </button>
        ))}
      </div>

      {modo === "emulatorjs" && <EmulatorJsPanel />}

      {msg && modo === "classico" && <p className="text-xs text-amber-300">{msg}</p>}

      {/* ── o console clássico ── */}
      <div className="mx-auto w-full max-w-[430px]" style={{ display: modo === "classico" ? undefined : "none" }}>
        <div
          className="rounded-3xl p-4 pb-6"
          style={{
            background: "linear-gradient(165deg, #2b2030 0%, #1a1420 55%, #131019 100%)",
            border: "1px solid rgba(240,184,96,0.22)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 24px 50px -24px rgba(0,0,0,0.9)",
          }}
        >
          {/* moldura da tela */}
          <div className="rounded-2xl px-4 pb-3 pt-2" style={{ background: "#0d0a12", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "inset 0 2px 10px rgba(0,0,0,0.8)" }}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[8px] uppercase tracking-[0.2em] text-zinc-600">Dot Matrix with Stereo Sound</span>
              <span className="flex items-center gap-1 text-[8px] uppercase tracking-widest text-zinc-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: estado === "rodando" ? "#f43f5e" : "#3f3f46", boxShadow: estado === "rodando" ? "0 0 6px #f43f5e" : "none" }} />
                Battery
              </span>
            </div>
            <div className="relative overflow-hidden rounded-lg" style={{ aspectRatio: "160 / 144", background: "#1c2410" }}>
              <canvas ref={canvasRef} width={160} height={144} className="h-full w-full" style={{ imageRendering: "pixelated" }} />
              {estado !== "rodando" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center" style={{ background: "rgba(10,8,14,0.82)" }}>
                  {estado === "carregando" && <p className="text-xs text-zinc-400">Preparando o emulador…</p>}
                  {estado === "sem-rom" && (
                    <>
                      <p className="text-xs leading-relaxed text-zinc-300">
                        Escolha a ROM (<span className="font-mono">.gb</span>) do Pokémon Gold Spaceworld —
                        ela fica <span className="font-bold text-amber-300">salva neste aparelho</span> e
                        carrega sozinha nas próximas visitas.
                      </p>
                      <label className="cursor-pointer rounded-xl px-4 py-2.5 text-xs font-bold text-black" style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}>
                        Escolher ROM
                        <input type="file" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)} />
                      </label>
                    </>
                  )}
                  {estado === "pronto" && (
                    <>
                      <p className="max-w-[240px] truncate text-[11px] text-zinc-400">{nomeRom}</p>
                      <button onClick={ligar} className="rounded-full px-6 py-3 text-sm font-bold text-black" style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", boxShadow: "0 0 24px rgba(251,191,36,0.35)" }}>
                        ▶ Ligar
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* marca */}
          <p className="mt-2 text-center text-[10px] font-bold italic tracking-wider text-amber-200/50">MEUS INVESTIMENTOS · GAME BOY</p>

          {/* ── controles ── */}
          <div className="mt-3 flex items-center justify-between" style={{ touchAction: "none" }}>
            {/* D-pad */}
            <div className="grid" style={{ gridTemplateColumns: "repeat(3, 44px)", gridTemplateRows: "repeat(3, 44px)" }}>
              <div />
              <button {...botaoToque("UP")} className="rounded-t-lg active:brightness-150" style={{ background: "#26202e", border: "1px solid rgba(255,255,255,0.10)" }} aria-label="Cima">▲</button>
              <div />
              <button {...botaoToque("LEFT")} className="rounded-l-lg active:brightness-150" style={{ background: "#26202e", border: "1px solid rgba(255,255,255,0.10)" }} aria-label="Esquerda">◀</button>
              <div style={{ background: "#26202e" }} />
              <button {...botaoToque("RIGHT")} className="rounded-r-lg active:brightness-150" style={{ background: "#26202e", border: "1px solid rgba(255,255,255,0.10)" }} aria-label="Direita">▶</button>
              <div />
              <button {...botaoToque("DOWN")} className="rounded-b-lg active:brightness-150" style={{ background: "#26202e", border: "1px solid rgba(255,255,255,0.10)" }} aria-label="Baixo">▼</button>
              <div />
            </div>

            {/* A / B */}
            <div className="flex items-center gap-3" style={{ transform: "rotate(-14deg)" }}>
              <button {...botaoToque("B")} className="flex h-14 w-14 items-center justify-center rounded-full text-sm font-black text-black active:brightness-125" style={{ background: "radial-gradient(circle at 34% 30%, #fcd9a0, #d97706 70%)", boxShadow: "0 4px 10px rgba(0,0,0,0.5)" }} aria-label="B">B</button>
              <button {...botaoToque("A")} className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full text-sm font-black text-black active:brightness-125" style={{ background: "radial-gradient(circle at 34% 30%, #fcd9a0, #d97706 70%)", boxShadow: "0 4px 10px rgba(0,0,0,0.5)" }} aria-label="A">A</button>
            </div>
          </div>

          {/* Select / Start */}
          <div className="mt-4 flex items-center justify-center gap-4" style={{ touchAction: "none" }}>
            {(["SELECT", "START"] as const).map((k) => (
              <button key={k} {...botaoToque(k)} className="rounded-full px-4 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400 active:brightness-150" style={{ background: "#26202e", border: "1px solid rgba(255,255,255,0.10)", transform: "rotate(-14deg)" }}>
                {k === "SELECT" ? "Select" : "Start"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {modo === "classico" && (
        <p className="text-[10px] leading-relaxed text-zinc-600">
          No desktop: setas movem, <span className="font-mono">X</span>=A, <span className="font-mono">Z</span>=B,{" "}
          <span className="font-mono">Enter</span>=Start, <span className="font-mono">Shift</span>=Select.
          "Salvar" grava um save state neste aparelho (IndexedDB) e "Continuar" restaura o mais recente —
          além do save da bateria do próprio jogo. A ROM não sai do seu aparelho.
        </p>
      )}
    </div>
  );
}
