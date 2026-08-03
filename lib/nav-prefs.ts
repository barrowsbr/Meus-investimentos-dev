// Preferência: estilo do MENU INFERIOR (mobile). Client-only (localStorage),
// mesmo padrão de hub-prefs. Default: "atual" (a barra pill clássica do app).
// "playstation" = barra curva com item ativo iluminado + rótulo (inspirada no
// app da PlayStation).

export const NAV_ESTILO_KEY = "mi_nav_estilo";
export const NAV_ESTILO_EVENT = "mi-nav-estilo-change";
export type NavEstilo = "atual" | "playstation";

export function getNavEstilo(): NavEstilo {
  if (typeof window === "undefined") return "atual";
  try {
    return localStorage.getItem(NAV_ESTILO_KEY) === "playstation" ? "playstation" : "atual";
  } catch {
    return "atual";
  }
}

export function setNavEstilo(estilo: NavEstilo): void {
  try {
    localStorage.setItem(NAV_ESTILO_KEY, estilo);
    window.dispatchEvent(new CustomEvent(NAV_ESTILO_EVENT, { detail: estilo }));
  } catch {
    /* ignore */
  }
}
