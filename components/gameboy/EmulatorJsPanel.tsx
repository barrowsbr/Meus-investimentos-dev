"use client";

// Modo EmulatorJS da página /gameboy — o emulador famoso do GitHub
// (EmulatorJS/RetroArch em wasm), SELF-HOSTED em public/emulatorjs/data
// (bundle estável + cores gambatte/mgba/genesis_plus_gx/snes9x baixados pelo
// workflow emulatorjs-data; sem CDN em produção).
//
// Este painel é só a ESTANTE: escolher um jogo NAVEGA para o "modo jogo"
// (/emulatorjs/player.html — página crua, fora do app). Motivo: no iPhone o
// emulador rodando DENTRO da página completa do app estourava a memória do
// Safari e a aba recarregava sozinha; na página dedicada o app é liberado da
// memória e sobra folga para o wasm + ROM. Voltar = link "‹ voltar" do player.
//
// Jogos: homebrew livre em public/roms/homebrew + a ROM do Pokémon do
// APARELHO (IndexedDB/repo) + "Abrir arquivo…" (.gb/.gbc/.gba/.md/.gen/.smd/
// .bin/.sfc/.smc — salvo no IndexedDB; o player escolhe o core pela extensão).
// ⚠️ SEM `accept` no input: o iOS não registra extensões de ROM como tipos
// conhecidos e ACINZENTA os arquivos no seletor; validamos depois da escolha.

import { useEffect, useState } from "react";
import { FolderOpen, Play, TriangleAlert } from "lucide-react";
import { CHAVE_ARQUIVO_EJS, idbGravarRom, idbLerRom, urlRomPokemon } from "./rom-store";

interface Jogo { id: string; nome: string; sub: string; url?: string }

// Jogos prontos: homebrew livre commitado pelo workflow + a ROM do Pokémon do
// aparelho. Para AMPLIAR a lista: colocar o .gb/.gbc em public/roms/homebrew
// (pelo workflow ou direto no repo), adicionar a entrada aqui e o caso no
// player.html — jogos cujo arquivo não existe são escondidos automaticamente.
const JOGOS: Jogo[] = [
  { id: "pokemon", nome: "Pokémon Gold Spaceworld ’97", sub: "a sua ROM — deste aparelho ou do repo" },
  { id: "ucity", nome: "µCity", sub: "cidade estilo SimCity — homebrew livre (GPLv3)", url: "/roms/homebrew/ucity.gbc" },
];

async function existe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && !(r.headers.get("content-type") ?? "").includes("text/html");
  } catch { return false; }
}

const irParaJogo = (jogo: string) => { window.location.assign(`/emulatorjs/player.html?jogo=${jogo}`); };

export default function EmulatorJsPanel() {
  const [temBundle, setTemBundle] = useState<boolean | null>(null);
  const [disponiveis, setDisponiveis] = useState<Record<string, boolean>>({});
  const [ultimoArquivo, setUltimoArquivo] = useState<string | null>(null);
  const [msgArquivo, setMsgArquivo] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      const bundle = await existe("/emulatorjs/data/loader.js");
      if (!vivo) return;
      setTemBundle(bundle);
      const disp: Record<string, boolean> = {};
      await Promise.all(JOGOS.map(async (j) => {
        if (j.url) { disp[j.id] = await existe(j.url); return; }
        const url = await urlRomPokemon();
        if (url) { disp[j.id] = true; URL.revokeObjectURL(url); }
      }));
      const salvo = await idbLerRom(CHAVE_ARQUIVO_EJS);
      if (!vivo) return;
      setDisponiveis(disp);
      if (salvo?.nome) setUltimoArquivo(salvo.nome);
    })();
    return () => { vivo = false; };
  }, []);

  const abrirArquivo = async (f: File | null) => {
    if (!f) return;
    setMsgArquivo("");
    if (/\.zip$/i.test(f.name)) {
      setMsgArquivo("Descompacte o .zip no app Arquivos (toque nele) e abra o arquivo do jogo que sai de dentro.");
      return;
    }
    if (!/\.(gb|gbc|gba|md|gen|smd|bin|sfc|smc)$/i.test(f.name)) {
      setMsgArquivo(`"${f.name}" não parece uma ROM suportada (.gb/.gbc/.gba/.md/.gen/.smd/.bin/.sfc/.smc).`);
      return;
    }
    const dados = new Uint8Array(await f.arrayBuffer());
    if (dados.length < 0x4000) { setMsgArquivo("Arquivo pequeno demais para ser uma ROM."); return; }
    await idbGravarRom(f.name, dados, CHAVE_ARQUIVO_EJS);
    irParaJogo("arquivo");
  };

  if (temBundle === false) {
    return (
      <div className="flex items-start gap-2 rounded-xl p-4 text-xs leading-relaxed text-amber-200/80" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          O pacote do EmulatorJS ainda não está no site — a workflow <span className="font-mono">emulatorjs-data</span> baixa
          o bundle + cores + jogos homebrew para <span className="font-mono">public/</span>. Rode-a (ou aguarde o
          deploy que a inclui) e recarregue.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {JOGOS.filter((j) => !j.url || disponiveis[j.id]).map((j) => {
          const ok = disponiveis[j.id];
          return (
            <button
              key={j.id}
              disabled={!ok}
              onClick={() => ok && irParaJogo(j.id)}
              className="group flex items-center gap-3 rounded-xl p-3 text-left transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-45"
              style={{ background: "linear-gradient(150deg, #221826 0%, #151019 100%)", border: "1px solid rgba(240,184,96,0.22)" }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" }}>
                <Play size={14} className="text-amber-300" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-zinc-100">{j.nome}</span>
                <span className="block truncate text-[11px] text-zinc-500">{ok ? j.sub : "carregue a ROM no console clássico primeiro"}</span>
              </span>
            </button>
          );
        })}

        {ultimoArquivo && (
          <button
            onClick={() => irParaJogo("arquivo")}
            className="group flex items-center gap-3 rounded-xl p-3 text-left transition-transform hover:-translate-y-0.5"
            style={{ background: "linear-gradient(150deg, #221826 0%, #151019 100%)", border: "1px solid rgba(240,184,96,0.22)" }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" }}>
              <Play size={14} className="text-amber-300" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-zinc-100">{ultimoArquivo}</span>
              <span className="block truncate text-[11px] text-zinc-500">último arquivo aberto — salvo neste aparelho</span>
            </span>
          </button>
        )}

        <label
          className="group flex cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-transform hover:-translate-y-0.5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(240,184,96,0.35)" }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" }}>
            <FolderOpen size={14} className="text-amber-300" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-zinc-100">Abrir arquivo…</span>
            <span className="block truncate text-[11px] text-zinc-500">Game Boy (.gb/.gbc) · GBA (.gba) · Mega Drive (.md/.gen/.smd/.bin) · SNES (.sfc/.smc)</span>
          </span>
          <input type="file" className="hidden" onChange={(e) => abrirArquivo(e.target.files?.[0] ?? null)} />
        </label>

        {msgArquivo && <p className="text-xs leading-relaxed text-amber-300 sm:col-span-2">{msgArquivo}</p>}
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-600">
        O jogo abre no <span className="font-bold text-zinc-500">modo jogo</span> — uma página dedicada e leve
        (no iPhone, o emulador dentro do app estourava a memória do Safari). Controles na tela, fullscreen e
        save states no menu do player; "‹ voltar" traz de volta ao app.
      </p>
    </div>
  );
}
