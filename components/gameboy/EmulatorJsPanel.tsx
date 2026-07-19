"use client";

// Modo EmulatorJS da página /gameboy — o emulador famoso do GitHub
// (EmulatorJS/RetroArch em wasm), SELF-HOSTED em public/emulatorjs/data
// (bundle estável + core gambatte baixados pelo workflow emulatorjs-data;
// sem CDN em produção). Cada jogo roda num IFRAME srcdoc same-origin —
// desmontar o iframe desliga o emulador por completo (teardown limpo).
//
// Jogos prontos: homebrew com licença livre (public/roms/homebrew, também
// baixados pelo workflow) + a ROM do Pokémon do APARELHO (IndexedDB/repo,
// via blob URL — a mesma do console clássico). O EmulatorJS traz gamepad
// virtual no toque, fullscreen e save states próprios (menu do player).

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Play, TriangleAlert } from "lucide-react";
import { CHAVE_ARQUIVO_EJS, blobUrlDe, coreDoArquivo, idbGravarRom, idbLerRom, urlRomPokemon, type CoreEjs } from "./rom-store";

interface Jogo { id: string; nome: string; sub: string; url?: string }
interface Ativo { nome: string; url: string; core: CoreEjs }

// Jogos prontos: homebrew livre commitado pelo workflow + a ROM do Pokémon do
// aparelho. Para AMPLIAR a lista: colocar o .gb/.gbc em public/roms/homebrew
// (pelo workflow ou direto no repo) e adicionar a entrada aqui — jogos cujo
// arquivo não existe são escondidos automaticamente.
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

export default function EmulatorJsPanel() {
  const [temBundle, setTemBundle] = useState<boolean | null>(null);
  const [disponiveis, setDisponiveis] = useState<Record<string, string>>({});
  const [ultimoArquivo, setUltimoArquivo] = useState<string | null>(null);
  const [ativo, setAtivo] = useState<Ativo | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const bundle = await existe("/emulatorjs/data/loader.js");
      if (!vivo) return;
      setTemBundle(bundle);
      const disp: Record<string, string> = {};
      await Promise.all(JOGOS.map(async (j) => {
        if (j.url) { if (await existe(j.url)) disp[j.id] = j.url; return; }
        const url = await urlRomPokemon();
        if (url) disp[j.id] = url;
      }));
      const salvo = await idbLerRom(CHAVE_ARQUIVO_EJS);
      if (!vivo) return;
      setDisponiveis(disp);
      if (salvo?.nome) setUltimoArquivo(salvo.nome);
    })();
    return () => { vivo = false; };
  }, []);

  // "Abrir arquivo" (.gb/.gbc/.gba) — salva no aparelho e escolhe o core pela
  // extensão (mGBA para Game Boy Advance; gambatte para GB/GBC).
  const abrirArquivo = async (f: File | null) => {
    if (!f) return;
    const dados = new Uint8Array(await f.arrayBuffer());
    if (dados.length < 0x4000) return;
    await idbGravarRom(f.name, dados, CHAVE_ARQUIVO_EJS);
    setUltimoArquivo(f.name);
    setAtivo({ nome: f.name, url: blobUrlDe(dados), core: coreDoArquivo(f.name) });
  };

  const abrirUltimo = async () => {
    const salvo = await idbLerRom(CHAVE_ARQUIVO_EJS);
    if (salvo?.dados?.length) setAtivo({ nome: salvo.nome, url: blobUrlDe(salvo.dados), core: coreDoArquivo(salvo.nome) });
  };

  const srcdoc = useMemo(() => {
    if (!ativo) return "";
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#0b090d}#game{width:100%;height:100%}</style></head><body>
<div id="game"></div>
<script>
window.EJS_player = "#game";
window.EJS_core = ${JSON.stringify(ativo.core)};
window.EJS_gameName = ${JSON.stringify(ativo.nome)};
window.EJS_gameUrl = ${JSON.stringify(ativo.url)};
window.EJS_pathtodata = "/emulatorjs/data/";
window.EJS_startOnLoaded = true;
window.EJS_backgroundColor = "#0b090d";
</script>
<script src="/emulatorjs/data/loader.js"></script>
</body></html>`;
  }, [ativo]);

  if (temBundle === false) {
    return (
      <div className="flex items-start gap-2 rounded-xl p-4 text-xs leading-relaxed text-amber-200/80" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          O pacote do EmulatorJS ainda não está no site — a workflow <span className="font-mono">emulatorjs-data</span> baixa
          o bundle + core de Game Boy + jogos homebrew para <span className="font-mono">public/</span>. Rode-a (ou aguarde o
          deploy que a inclui) e recarregue.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ativo ? (
        <>
          <div className="flex items-center justify-between">
            <p className="truncate text-sm font-bold text-amber-100">{ativo.nome}</p>
            <button
              onClick={() => setAtivo(null)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-zinc-300"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Trocar de jogo
            </button>
          </div>
          <iframe
            srcDoc={srcdoc}
            className="w-full rounded-2xl"
            style={{ height: "min(72vh, 620px)", border: "1px solid rgba(240,184,96,0.25)", background: "#0b090d" }}
            allow="fullscreen; gamepad; autoplay"
            title={`EmulatorJS — ${ativo.nome}`}
          />
          <p className="text-[10px] text-zinc-600">
            Controles na tela (toque), teclado no desktop e menu do player (engrenagem) com fullscreen, save states e
            mapeamento de controle — tudo do EmulatorJS.
          </p>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {JOGOS.filter((j) => !j.url || disponiveis[j.id]).map((j) => {
            const url = disponiveis[j.id];
            return (
              <button
                key={j.id}
                disabled={!url}
                onClick={() => url && setAtivo({ nome: j.nome, url, core: "gambatte" })}
                className="group flex items-center gap-3 rounded-xl p-3 text-left transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-45"
                style={{ background: "linear-gradient(150deg, #221826 0%, #151019 100%)", border: "1px solid rgba(240,184,96,0.22)" }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" }}>
                  <Play size={14} className="text-amber-300" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-zinc-100">{j.nome}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{url ? j.sub : j.id === "pokemon" ? "carregue a ROM no console clássico primeiro" : "ainda não baixado pela workflow"}</span>
                </span>
              </button>
            );
          })}

          {ultimoArquivo && (
            <button
              onClick={abrirUltimo}
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
            <input type="file" accept=".gb,.gbc,.gba,.md,.gen,.smd,.bin,.sfc,.smc" className="hidden" onChange={(e) => abrirArquivo(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      )}
    </div>
  );
}
