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
