"use client";

// Fliperama — a tela é uma GRADE de consoles (retratos grandes, efeito arcade).
// Tocar num console abre um POPUP com os jogos daquele console (lidos AO VIVO da
// pasta do Drive do dono, /api/gameboy/catalogo). Tocar num jogo NAVEGA para o
// "modo jogo" (/emulatorjs/player.html) — igual a antes. Também há um tile "Do
// aparelho" para abrir qualquer ROM do próprio iPhone.

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Search, Share, TriangleAlert, X } from "lucide-react";
import ConsoleArt from "./ConsoleArt";
import { CHAVE_ARQUIVO_EJS, idbGravarRom, idbLerRom } from "./rom-store";

interface JogoDrive { id: string; nome: string; sistema: string; core: string; tamanho: number }
interface ConsoleCatalogo { chave: string; nome: string; sistemaBase: string; jogos: JogoDrive[] }

// Cor de néon por console — o toque "bem gamer".
const TEMA: Record<string, string> = {
  gameboy: "#9ae66e", gbc: "#a78bfa", gba: "#818cf8", snes: "#f472b6", megadrive: "#60a5fa",
};
const corDe = (chave: string) => TEMA[chave] ?? "#fbbf24";

async function existe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && !(r.headers.get("content-type") ?? "").includes("text/html");
  } catch { return false; }
}

const irParaDrive = (j: JogoDrive) =>
  window.location.assign(`/emulatorjs/player.html?drive=${encodeURIComponent(j.id)}&nome=${encodeURIComponent(j.nome)}&core=${j.core}`);

export default function EmulatorJsPanel() {
  const [temBundle, setTemBundle] = useState<boolean | null>(null);
  const [consoles, setConsoles] = useState<ConsoleCatalogo[]>([]);
  const [erroCat, setErroCat] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ultimoArquivo, setUltimoArquivo] = useState<string | null>(null);
  const [msgArquivo, setMsgArquivo] = useState("");
  const [mostrarInstalar, setMostrarInstalar] = useState(false);
  const [aberto, setAberto] = useState<ConsoleCatalogo | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      const bundle = await existe("/emulatorjs/data/loader.js");
      if (!vivo) return;
      setTemBundle(bundle);
      try {
        const r = await fetch("/api/gameboy/catalogo");
        const j = await r.json();
        if (!vivo) return;
        setConsoles(j.consoles ?? []);
        if (j.erro) setErroCat(j.erro);
      } catch { if (vivo) setErroCat("falha ao carregar o catálogo"); }
      const salvo = await idbLerRom(CHAVE_ARQUIVO_EJS);
      if (!vivo) return;
      if (salvo?.nome) setUltimoArquivo(salvo.nome);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, []);

  // Aviso discreto: rodar como APP instalado dá mais memória e trava menos.
  useEffect(() => {
    try {
      const standalone =
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        window.matchMedia?.("(display-mode: standalone)").matches === true;
      const dispensado = localStorage.getItem("mi_gb_instalar") === "1";
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (ios && !standalone && !dispensado) setMostrarInstalar(true);
    } catch { /* ignora */ }
  }, []);

  // trava o scroll do fundo enquanto o popup está aberto
  useEffect(() => {
    if (!aberto) return;
    setBusca("");
    const ov = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(null); };
    window.addEventListener("keydown", onEsc);
    return () => { document.body.style.overflow = ov; window.removeEventListener("keydown", onEsc); };
  }, [aberto]);

  const dispensarInstalar = () => {
    try { localStorage.setItem("mi_gb_instalar", "1"); } catch { /* ignora */ }
    setMostrarInstalar(false);
  };

  const comJogos = consoles.filter((c) => c.jogos.length > 0);
  const totalJogos = comJogos.reduce((s, c) => s + c.jogos.length, 0);

  const jogosFiltrados = useMemo(() => {
    if (!aberto) return [];
    const q = busca.trim().toLowerCase();
    return q ? aberto.jogos.filter((j) => j.nome.toLowerCase().includes(q)) : aberto.jogos;
  }, [aberto, busca]);

  const abrirArquivo = async (f: File | null) => {
    if (!f) return;
    setMsgArquivo("");
    if (/\.zip$/i.test(f.name)) { setMsgArquivo("Descompacte o .zip no app Arquivos e abra o jogo de dentro."); return; }
    if (!/\.(gb|gbc|gba|md|gen|smd|bin|sfc|smc)$/i.test(f.name)) { setMsgArquivo(`"${f.name}" não é uma ROM suportada.`); return; }
    const dados = new Uint8Array(await f.arrayBuffer());
    if (dados.length < 0x4000) { setMsgArquivo("Arquivo pequeno demais para ser uma ROM."); return; }
    await idbGravarRom(f.name, dados, CHAVE_ARQUIVO_EJS);
    window.location.assign("/emulatorjs/player.html?jogo=arquivo");
  };

  if (temBundle === false) {
    return (
      <div className="flex items-start gap-2 rounded-xl p-4 text-xs leading-relaxed text-amber-200/80" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>O pacote do EmulatorJS ainda não está no site — a workflow <span className="font-mono">emulatorjs-data</span> baixa o bundle + cores para <span className="font-mono">public/</span>. Rode-a (ou aguarde o deploy) e recarregue.</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* keyframes do efeito arcade */}
      <style>{`
        @keyframes miFloat { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-7px) } }
        @keyframes miGlow { 0%,100%{ opacity:.55 } 50%{ opacity:.95 } }
        @keyframes miShine { 0%{ transform: translateX(-120%) rotate(20deg) } 100%{ transform: translateX(260%) rotate(20deg) } }
        @keyframes miPop { 0%{ transform: scale(.94); opacity:0 } 100%{ transform: scale(1); opacity:1 } }
      `}</style>

      {/* dica: instalar como app */}
      {mostrarInstalar && (
        <div className="flex items-start gap-2.5 rounded-xl p-3 text-xs leading-relaxed" style={{ background: "linear-gradient(150deg, rgba(96,165,250,0.12), rgba(167,139,250,0.1))", border: "1px solid rgba(96,165,250,0.3)" }}>
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(96,165,250,0.16)" }}>🕹️</span>
          <div className="min-w-0 flex-1 text-blue-100/90">
            <span className="font-semibold text-blue-200">Jogue como app — mais fluido e trava menos.</span>{" "}
            No Safari, toque em <Share size={12} className="inline -translate-y-px" /> <span className="font-medium">Compartilhar</span> → <span className="font-medium">Adicionar à Tela de Início</span>.
          </div>
          <button onClick={dispensarInstalar} aria-label="Dispensar" className="shrink-0 rounded-md p-1 text-blue-200/60 transition-colors hover:text-blue-100">
            <X size={14} />
          </button>
        </div>
      )}

      {carregando && <p className="text-center text-xs text-zinc-500">Carregando os consoles…</p>}

      {!carregando && totalJogos === 0 && (
        <div className="rounded-xl p-4 text-xs leading-relaxed text-zinc-400" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
          Nenhum jogo no catálogo ainda. Ele é lido direto da sua pasta do Google Drive — jogue as ROMs lá
          (em subpastas por console) que os consoles aparecem aqui.
          {erroCat && <span className="mt-2 block text-amber-300/80">Detalhe técnico: {erroCat}. A leitura usa o service account (o mesmo do backup) — a pasta precisa estar compartilhada por link e a Drive API habilitada no projeto.</span>}
        </div>
      )}

      {/* GRADE DE CONSOLES */}
      {comJogos.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {comJogos.map((c, i) => {
            const cor = corDe(c.chave);
            return (
              <button
                key={c.chave}
                onClick={() => setAberto(c)}
                className="group relative overflow-hidden rounded-2xl p-4 text-center transition-transform duration-200 hover:-translate-y-1 active:scale-95"
                style={{ background: "linear-gradient(160deg, #191320 0%, #0f0b16 100%)", border: `1px solid ${cor}44`, boxShadow: `0 8px 30px rgba(0,0,0,.5)` }}
              >
                {/* halo néon pulsante */}
                <span className="pointer-events-none absolute inset-0" aria-hidden style={{ background: `radial-gradient(120% 80% at 50% 18%, ${cor}22, transparent 62%)`, animation: `miGlow ${3 + (i % 3) * 0.6}s ease-in-out infinite` }} />
                {/* brilho varrendo */}
                <span className="pointer-events-none absolute -top-6 left-0 h-40 w-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent)", animation: "miShine 1.1s ease-in-out infinite" }} />
                {/* retrato do console */}
                <div className="relative mx-auto flex h-24 items-end justify-center sm:h-28" style={{ animation: `miFloat ${3.4 + (i % 4) * 0.5}s ease-in-out infinite`, filter: `drop-shadow(0 10px 14px ${cor}55)` }}>
                  <ConsoleArt chave={c.chave} />
                </div>
                <h3 className="mt-3 truncate font-mono text-[13px] font-bold tracking-wide" style={{ color: cor, textShadow: `0 0 12px ${cor}55` }}>{c.nome}</h3>
                <span className="mt-0.5 block text-[10px] uppercase tracking-[0.2em] text-zinc-500">{c.jogos.length} {c.jogos.length === 1 ? "jogo" : "jogos"}</span>
              </button>
            );
          })}

          {/* tile "Do aparelho" */}
          <label
            className="group relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl p-4 text-center transition-transform duration-200 hover:-translate-y-1 active:scale-95"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(240,184,96,0.4)" }}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl sm:h-20 sm:w-20" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }}>
              <FolderOpen size={26} className="text-amber-300" />
            </span>
            <h3 className="mt-1 font-mono text-[13px] font-bold tracking-wide text-amber-200">Do aparelho</h3>
            <span className="block text-[10px] uppercase tracking-[0.15em] text-zinc-500">abrir ROM · GB · GBA · SNES · Mega</span>
            <input type="file" className="hidden" onChange={(e) => abrirArquivo(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      )}

      {/* atalho para o último arquivo aberto do aparelho */}
      {ultimoArquivo && (
        <button
          onClick={() => window.location.assign("/emulatorjs/player.html?jogo=arquivo")}
          className="flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left transition-transform hover:-translate-y-0.5"
          style={{ background: "linear-gradient(150deg, #1c1622 0%, #131019 100%)", border: "1px solid rgba(240,184,96,0.22)" }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-black" style={{ background: "#fbbf24" }}>▶</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-zinc-100">{ultimoArquivo}</span>
            <span className="block text-[10px] uppercase tracking-wider text-zinc-500">continuar — último arquivo aberto</span>
          </span>
        </button>
      )}
      {msgArquivo && <p className="text-xs leading-relaxed text-amber-300">{msgArquivo}</p>}

      {/* POPUP de jogos do console */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={() => setAberto(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl sm:max-w-lg sm:rounded-2xl"
            style={{ background: "linear-gradient(180deg, #17121f 0%, #0e0a15 100%)", border: `1px solid ${corDe(aberto.chave)}55`, boxShadow: `0 -10px 60px ${corDe(aberto.chave)}22`, animation: "miPop .18s ease-out" }}
          >
            {/* cabeçalho */}
            <div className="flex items-center gap-3 border-b p-4" style={{ borderColor: `${corDe(aberto.chave)}22` }}>
              <div className="h-10 w-10 shrink-0" style={{ filter: `drop-shadow(0 4px 8px ${corDe(aberto.chave)}66)` }}><ConsoleArt chave={aberto.chave} /></div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-mono text-sm font-bold tracking-wide" style={{ color: corDe(aberto.chave), textShadow: `0 0 12px ${corDe(aberto.chave)}55` }}>{aberto.nome}</h3>
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{aberto.jogos.length} {aberto.jogos.length === 1 ? "jogo" : "jogos"}</span>
              </div>
              <button onClick={() => setAberto(null)} aria-label="Fechar" className="shrink-0 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100">
                <X size={18} />
              </button>
            </div>

            {/* busca (se muitos) */}
            {aberto.jogos.length > 8 && (
              <div className="relative px-4 pt-3">
                <Search size={14} className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-zinc-500" style={{ marginTop: "6px" }} />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={`Buscar em ${aberto.jogos.length} jogos…`}
                  autoFocus
                  className="w-full rounded-xl bg-black/40 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600"
                  style={{ border: `1px solid ${corDe(aberto.chave)}33` }}
                />
              </div>
            )}

            {/* lista de jogos */}
            <div className="grid grid-cols-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
              {jogosFiltrados.map((j) => {
                const cor = corDe(aberto.chave);
                return (
                  <button
                    key={j.id}
                    onClick={() => irParaDrive(j)}
                    className="group flex items-center gap-2.5 rounded-xl p-2.5 text-left transition-transform hover:-translate-y-0.5 active:scale-95"
                    style={{ background: "linear-gradient(150deg, #1f1728 0%, #140f1c 100%)", border: `1px solid ${cor}33` }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-black" style={{ background: cor, boxShadow: `0 0 10px ${cor}55` }}>▶</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-zinc-100">{j.nome}</span>
                      <span className="block text-[10px] uppercase tracking-wider" style={{ color: `${cor}99` }}>{j.sistema}</span>
                    </span>
                  </button>
                );
              })}
              {jogosFiltrados.length === 0 && (
                <p className="col-span-full py-6 text-center text-xs text-zinc-500">Nenhum jogo com esse nome.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
