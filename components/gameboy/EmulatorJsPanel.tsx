"use client";

// Modo EmulatorJS da página /gameboy — RetroArch em wasm, SELF-HOSTED em
// public/emulatorjs/data (bundle + cores gambatte/mgba/genesis_plus_gx/snes9x
// baixados pela workflow emulatorjs-data; sem CDN em produção).
//
// Este painel é a ESTANTE: escolher um jogo NAVEGA para o "modo jogo"
// (/emulatorjs/player.html — página crua; no iPhone o emulador dentro do app
// estourava a memória do Safari). O CATÁLOGO vem de public/roms/catalogo.json
// — para adicionar um jogo: arquivo em public/roms/ + entrada no JSON; os
// cards aparecem aqui e (gb/gbc) também no console clássico.
// ⚠️ SEM `accept` no input de arquivo: o iOS não registra extensões de ROM e
// ACINZENTA os arquivos no seletor; a validação acontece depois da escolha.

import { useEffect, useState } from "react";
import { FolderOpen, Play, TriangleAlert } from "lucide-react";
import { CHAVE_ARQUIVO_EJS, idbGravarRom, idbLerRom, urlRomPokemon, type ItemCatalogo, lerCatalogo } from "./rom-store";

const SISTEMA_BADGE: Record<string, { rotulo: string; cor: string }> = {
  gb: { rotulo: "GB", cor: "#9ca3af" },
  gbc: { rotulo: "GBC", cor: "#a78bfa" },
  gba: { rotulo: "GBA", cor: "#818cf8" },
  md: { rotulo: "MEGA", cor: "#60a5fa" },
  snes: { rotulo: "SNES", cor: "#f472b6" },
};

async function existe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && !(r.headers.get("content-type") ?? "").includes("text/html");
  } catch { return false; }
}

const CARD_ESTILO = { background: "linear-gradient(150deg, #221826 0%, #151019 100%)", border: "1px solid rgba(240,184,96,0.22)" } as const;
const ICONE_ESTILO = { background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" } as const;

export default function EmulatorJsPanel() {
  const [temBundle, setTemBundle] = useState<boolean | null>(null);
  const [temPokemon, setTemPokemon] = useState(false);
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [ultimoArquivo, setUltimoArquivo] = useState<string | null>(null);
  const [msgArquivo, setMsgArquivo] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      const bundle = await existe("/emulatorjs/data/loader.js");
      if (!vivo) return;
      setTemBundle(bundle);
      const [itens, urlPoke, salvo] = await Promise.all([lerCatalogo(), urlRomPokemon(), idbLerRom(CHAVE_ARQUIVO_EJS)]);
      if (!vivo) return;
      setCatalogo(itens);
      if (urlPoke) { setTemPokemon(true); URL.revokeObjectURL(urlPoke); }
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
    window.location.assign("/emulatorjs/player.html?jogo=arquivo");
  };

  if (temBundle === false) {
    return (
      <div className="flex items-start gap-2 rounded-xl p-4 text-xs leading-relaxed text-amber-200/80" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          O pacote do EmulatorJS ainda não está no site — a workflow <span className="font-mono">emulatorjs-data</span> baixa
          o bundle + cores + jogos para <span className="font-mono">public/</span>. Rode-a (ou aguarde o deploy) e recarregue.
        </span>
      </div>
    );
  }

  const Badge = ({ sistema }: { sistema: string }) => {
    const b = SISTEMA_BADGE[sistema] ?? { rotulo: sistema.toUpperCase(), cor: "#9ca3af" };
    return (
      <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold" style={{ color: b.cor, border: `1px solid ${b.cor}55`, background: `${b.cor}18` }}>
        {b.rotulo}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* ── catálogo ── */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Catálogo</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {catalogo.map((j) => (
            <button
              key={j.id}
              onClick={() => window.location.assign(`/emulatorjs/player.html?rom=${encodeURIComponent(j.arquivo)}&nome=${encodeURIComponent(j.nome)}`)}
              className="group flex items-center gap-3 rounded-xl p-3 text-left transition-transform hover:-translate-y-0.5"
              style={CARD_ESTILO}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={ICONE_ESTILO}>
                <Play size={14} className="text-amber-300" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-zinc-100">{j.nome}</span>
                  <Badge sistema={j.sistema} />
                </span>
                {j.sub && <span className="block truncate text-[11px] text-zinc-500">{j.sub}</span>}
              </span>
            </button>
          ))}

          {temPokemon && (
            <button
              onClick={() => window.location.assign("/emulatorjs/player.html?jogo=pokemon")}
              className="group flex items-center gap-3 rounded-xl p-3 text-left transition-transform hover:-translate-y-0.5"
              style={CARD_ESTILO}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={ICONE_ESTILO}>
                <Play size={14} className="text-amber-300" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-zinc-100">Pokémon Gold Spaceworld ’97</span>
                  <Badge sistema="gb" />
                </span>
                <span className="block truncate text-[11px] text-zinc-500">a sua ROM — deste aparelho ou do repo</span>
              </span>
            </button>
          )}
        </div>
        {catalogo.length === 0 && !temPokemon && (
          <p className="text-xs text-zinc-600">
            Catálogo vazio por enquanto — adicione jogos em <span className="font-mono">public/roms/</span> +{" "}
            <span className="font-mono">catalogo.json</span>, ou abra um arquivo abaixo.
          </p>
        )}
      </div>

      {/* ── arquivos do aparelho ── */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Do aparelho</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ultimoArquivo && (
            <button
              onClick={() => window.location.assign("/emulatorjs/player.html?jogo=arquivo")}
              className="group flex items-center gap-3 rounded-xl p-3 text-left transition-transform hover:-translate-y-0.5"
              style={CARD_ESTILO}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={ICONE_ESTILO}>
                <Play size={14} className="text-amber-300" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-zinc-100">{ultimoArquivo}</span>
                <span className="block truncate text-[11px] text-zinc-500">último arquivo aberto — salvo neste aparelho</span>
              </span>
            </button>
          )}

          <label className="group flex cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-transform hover:-translate-y-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(240,184,96,0.35)" }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={ICONE_ESTILO}>
              <FolderOpen size={14} className="text-amber-300" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-zinc-100">Abrir arquivo…</span>
              <span className="block truncate text-[11px] text-zinc-500">GB · GBC · GBA · Mega Drive · SNES — fica salvo no aparelho</span>
            </span>
            <input type="file" className="hidden" onChange={(e) => abrirArquivo(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        {msgArquivo && <p className="mt-2 text-xs leading-relaxed text-amber-300">{msgArquivo}</p>}
      </div>
    </div>
  );
}
