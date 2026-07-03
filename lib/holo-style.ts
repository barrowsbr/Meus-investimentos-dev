// ─────────────────────────────────────────────────────────────────────────────
// Preferência de estilo do HoloGlobo (Configurações → Preferências do Sistema):
//   • "imersivo" — tela cheia, espaço infinito, zoom com limites (padrão)
//   • "classico" — janela compacta com bordas (como era antes)
// Persiste no localStorage; o evento custom permite o overlay reagir na hora,
// sem recarregar a página.
// ─────────────────────────────────────────────────────────────────────────────

export type HoloStyle = "imersivo" | "classico";

export const HOLO_STYLE_KEY = "holoGlobeStyle";
export const HOLO_STYLE_EVENT = "holo-style-change";

export function getHoloStyle(): HoloStyle {
  if (typeof window === "undefined") return "imersivo";
  return window.localStorage.getItem(HOLO_STYLE_KEY) === "classico" ? "classico" : "imersivo";
}

export function setHoloStyle(style: HoloStyle): void {
  window.localStorage.setItem(HOLO_STYLE_KEY, style);
  window.dispatchEvent(new CustomEvent(HOLO_STYLE_EVENT, { detail: style }));
}
