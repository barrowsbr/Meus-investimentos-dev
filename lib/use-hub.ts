"use client";

// Hook do "modo espaços" (tela inicial /inicio + sidebar por categoria).
// Lê a preferência (localStorage via hub-prefs) e reage à mudança em tempo real
// — o card em Configurações dispara HUB_EVENT ao alternar. Default: desligado
// (comportamento antigo: sidebar com todas as páginas, sem tela inicial).

import { useState, useEffect } from "react";
import { getHubAtivo, HUB_EVENT, getHubEstilo, HUB_ESTILO_EVENT, type HubEstilo } from "./hub-prefs";

export function useHubAtivo(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(getHubAtivo());
    read();
    window.addEventListener(HUB_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(HUB_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return on;
}

/** Estilo da tela inicial ("vivo" | "sobrio"). `null` enquanto não montou (SSR). */
export function useHubEstilo(): HubEstilo | null {
  const [estilo, setEstilo] = useState<HubEstilo | null>(null);
  useEffect(() => {
    const read = () => setEstilo(getHubEstilo());
    read();
    window.addEventListener(HUB_ESTILO_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(HUB_ESTILO_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return estilo;
}
