"use client";

// Página Game Boy — UMA interface só: o fliperama do EmulatorJS (catálogo do
// Drive por console + abrir arquivo do aparelho). O antigo "console clássico"
// (WasmBoy) foi removido a pedido do dono. Cada jogo abre no "modo jogo"
// (public/emulatorjs/player.html) — página crua, para o Safari do iPhone não
// estourar a memória.

import { Gamepad2 } from "lucide-react";
import EmulatorJsPanel from "./EmulatorJsPanel";

export default function GameBoyShell() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
          <Gamepad2 size={18} className="text-amber-400" /> Fliperama
        </h1>
        <p className="text-xs text-zinc-500">
          Seus jogos do Drive por console + qualquer ROM do aparelho — Game Boy, GBA, Mega Drive e Super Nintendo,
          rodando no seu iPhone. Toque num jogo para jogar.
        </p>
      </div>
      <EmulatorJsPanel />
    </div>
  );
}
