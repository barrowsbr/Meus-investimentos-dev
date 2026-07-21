"use client";

// Modo EmulatorJS da página /gameboy — RetroArch em wasm, SELF-HOSTED em
// public/emulatorjs/data. Escolher um jogo NAVEGA para o "modo jogo"
// (/emulatorjs/player.html — página crua; no iPhone o emulador dentro do app
// estourava a memória do Safari).
//
// CATÁLOGO lido AO VIVO da pasta do Drive do dono (/api/gameboy/catalogo),
// agrupado por CONSOLE — novos jogos aparecem sozinhos. Estilo arcade: cada
// console tem sua cor de néon, cards de jogo e busca. A ROM baixa pelo proxy
// same-origin /api/gameboy/rom. "Abrir arquivo…" segue para ROMs do aparelho.
// ⚠️ SEM `accept` no input: o iOS acinzenta extensões de ROM desconhecidas.

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Gamepad2, Search, Share, TriangleAlert, X } from "lucide-react";
import { CHAVE_ARQUIVO_EJS, idbGravarRom, idbLerRom } from "./rom-store";

interface JogoDrive { id: string; nome: string; sistema: string; core: string; tamanho: number }
interface ConsoleCatalogo { chave: string; nome: string; sistemaBase: string; jogos: JogoDrive[] }

// Cor de néon por console — o toque "bem gamer".
const TEMA: Record<string, { cor: string; icone: string }> = {
  gameboy: { cor: "#9ae66e", icone: "🎮" },
  gbc: { cor: "#a78bfa", icone: "🎮" },
  gba: { cor: "#818cf8", icone: "🎮" },
  snes: { cor: "#f472b6", icone: "🕹️" },
  megadrive: { cor: "#60a5fa", icone: "🕹️" },
};
const temaDe = (chave: string) => TEMA[chave] ?? { cor: "#fbbf24", icone: "🎮" };

async function existe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && !(r.headers.get("content-type") ?? "").includes("text/html");
  } catch { return false; }
}

const irParaDrive = (j: JogoDrive) =>
  window.location.assign(`/emulatorjs/player.html?drive=${encodeURIComponent(j.id)}&nome=${encodeURIComponent(j.nome)}&core=${j.core}`);

const ICONE_ESTILO = { background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" } as const;

export default function EmulatorJsPanel() {
  const [temBundle, setTemBundle] = useState<boolean | null>(null);
  const [consoles, setConsoles] = useState<ConsoleCatalogo[]>([]);
  const [erroCat, setErroCat] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [ultimoArquivo, setUltimoArquivo] = useState<string | null>(null);
  const [msgArquivo, setMsgArquivo] = useState("");
  const [mostrarInstalar, setMostrarInstalar] = useState(false);

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

  // Aviso discreto: rodar como APP instalado (standalone) dá mais memória e tira
  // a barra do Safari — jogo mais fluido e que trava menos no iPhone. Some quando
  // já está em modo app ou quando o dono dispensa (guardado no aparelho).
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

  const dispensarInstalar = () => {
    try { localStorage.setItem("mi_gb_instalar", "1"); } catch { /* ignora */ }
    setMostrarInstalar(false);
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return consoles;
    return consoles
      .map((c) => ({ ...c, jogos: c.jogos.filter((j) => j.nome.toLowerCase().includes(q)) }))
      .filter((c) => c.jogos.length > 0);
  }, [consoles, busca]);

  const totalJogos = consoles.reduce((s, c) => s + c.jogos.length, 0);

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
    <div className="space-y-4">
      {/* dica: instalar como app (mais memória, menos travadas no iPhone) */}
      {mostrarInstalar && (
        <div className="flex items-start gap-2.5 rounded-xl p-3 text-xs leading-relaxed" style={{ background: "linear-gradient(150deg, rgba(96,165,250,0.12), rgba(167,139,250,0.1))", border: "1px solid rgba(96,165,250,0.3)" }}>
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(96,165,250,0.16)" }}>🕹️</span>
          <div className="min-w-0 flex-1 text-blue-100/90">
            <span className="font-semibold text-blue-200">Jogue como app — mais fluido e trava menos.</span>{" "}
            No Safari, toque em <Share size={12} className="inline -translate-y-px" /> <span className="font-medium">Compartilhar</span> → <span className="font-medium">Adicionar à Tela de Início</span>. Abre em tela cheia e o iPhone libera mais memória pro emulador.
          </div>
          <button onClick={dispensarInstalar} aria-label="Dispensar" className="shrink-0 rounded-md p-1 text-blue-200/60 transition-colors hover:text-blue-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* busca */}
      {totalJogos > 6 && (
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar em ${totalJogos} jogos…`}
            className="w-full rounded-xl bg-black/40 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600"
            style={{ border: "1px solid rgba(240,184,96,0.22)" }}
          />
        </div>
      )}

      {carregando && <p className="text-xs text-zinc-500">Carregando o catálogo do Drive…</p>}

      {!carregando && totalJogos === 0 && (
        <div className="rounded-xl p-4 text-xs leading-relaxed text-zinc-400" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
          Nenhum jogo no catálogo ainda. Ele é lido direto da sua pasta do Google Drive — é só jogar as ROMs lá
          (em subpastas por console) que aparecem aqui.
          {erroCat && <span className="mt-2 block text-amber-300/80">Detalhe técnico: {erroCat}. A leitura usa o service account (o mesmo do backup) — a pasta precisa estar compartilhada por link e a Drive API habilitada no projeto.</span>}
        </div>
      )}

      {/* consoles */}
      {filtrados.map((c) => {
        const t = temaDe(c.chave);
        return (
          <section key={c.chave}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-base" aria-hidden>{t.icone}</span>
              <h3 className="font-mono text-xs font-bold uppercase tracking-[0.18em]" style={{ color: t.cor, textShadow: `0 0 12px ${t.cor}66` }}>{c.nome}</h3>
              <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${t.cor}55, transparent)` }} />
              <span className="font-mono text-[10px]" style={{ color: `${t.cor}aa` }}>{c.jogos.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {c.jogos.map((j) => (
                <button
                  key={j.id}
                  onClick={() => irParaDrive(j)}
                  className="group flex items-center gap-2.5 rounded-xl p-2.5 text-left transition-transform hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(150deg, #1c1622 0%, #131019 100%)", border: `1px solid ${t.cor}33` }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-black" style={{ background: t.cor, boxShadow: `0 0 10px ${t.cor}55` }}>▶</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-zinc-100">{j.nome}</span>
                    <span className="block text-[10px] uppercase tracking-wider" style={{ color: `${t.cor}99` }}>{j.sistema}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {/* do aparelho */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Gamepad2 size={14} className="text-zinc-500" />
          <h3 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Do aparelho</h3>
          <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.15), transparent)" }} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ultimoArquivo && (
            <button
              onClick={() => window.location.assign("/emulatorjs/player.html?jogo=arquivo")}
              className="group flex items-center gap-2.5 rounded-xl p-2.5 text-left transition-transform hover:-translate-y-0.5"
              style={{ background: "linear-gradient(150deg, #1c1622 0%, #131019 100%)", border: "1px solid rgba(240,184,96,0.22)" }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-black" style={{ background: "#fbbf24" }}>▶</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-zinc-100">{ultimoArquivo}</span>
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500">último arquivo aberto</span>
              </span>
            </button>
          )}
          <label className="group flex cursor-pointer items-center gap-2.5 rounded-xl p-2.5 text-left transition-transform hover:-translate-y-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(240,184,96,0.35)" }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={ICONE_ESTILO}><FolderOpen size={14} className="text-amber-300" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-zinc-100">Abrir arquivo…</span>
              <span className="block truncate text-[10px] text-zinc-500">GB · GBC · GBA · Mega · SNES</span>
            </span>
            <input type="file" className="hidden" onChange={(e) => abrirArquivo(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        {msgArquivo && <p className="mt-2 text-xs leading-relaxed text-amber-300">{msgArquivo}</p>}
      </section>
    </div>
  );
}
