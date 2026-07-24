// Preferência: tela inicial (hub "Game Select") como primeira tela pós-login.
// Client-only (localStorage), mesmo padrão de home-prefs. Quando ligada, o
// AuthGate direciona para /inicio logo após o login. Default: desligada.

export const HUB_KEY = "mi_hub_inicio";
export const HUB_EVENT = "mi-hub-inicio-change";

export function getHubAtivo(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(HUB_KEY) === "1"; } catch { return false; }
}

export function setHubAtivo(on: boolean): void {
  try {
    localStorage.setItem(HUB_KEY, on ? "1" : "0");
    window.dispatchEvent(new CustomEvent(HUB_EVENT, { detail: on }));
  } catch { /* ignore */ }
}

// Estilo da tela inicial: "vivo" (glass HUD 3D animado, default) ou "sobrio"
// (versão estática, sóbria e elegante — sem canvas, sem 3D, sem animações).
export const HUB_ESTILO_KEY = "mi_hub_estilo";
export const HUB_ESTILO_EVENT = "mi-hub-estilo-change";
export type HubEstilo = "vivo" | "sobrio";

export function getHubEstilo(): HubEstilo {
  if (typeof window === "undefined") return "vivo";
  try { return localStorage.getItem(HUB_ESTILO_KEY) === "sobrio" ? "sobrio" : "vivo"; } catch { return "vivo"; }
}

export function setHubEstilo(estilo: HubEstilo): void {
  try {
    localStorage.setItem(HUB_ESTILO_KEY, estilo);
    window.dispatchEvent(new CustomEvent(HUB_ESTILO_EVENT, { detail: estilo }));
  } catch { /* ignore */ }
}
