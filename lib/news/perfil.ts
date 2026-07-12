// Perfil de interesses de notícias — client-only (localStorage), mesmo padrão
// das preferências da Home. O NoticiasPanel envia o perfil como query params e
// o motor ranqueia no servidor. Default = o perfil do dono.

import { DEFAULT_INTERESSES, type Tema } from "./temas";

export interface PerfilNoticias {
  interesses: Tema[];
  semBriga: boolean; // filtra picuinha política (default: sim)
}

const KEY = "noticias-perfil";
export const PERFIL_EVENT = "noticias-perfil-change";

export const PERFIL_DEFAULT: PerfilNoticias = {
  interesses: [...DEFAULT_INTERESSES],
  semBriga: true,
};

export function getPerfilNoticias(): PerfilNoticias {
  if (typeof window === "undefined") return PERFIL_DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return PERFIL_DEFAULT;
    const p = JSON.parse(raw) as Partial<PerfilNoticias>;
    return {
      interesses: Array.isArray(p.interesses) && p.interesses.length > 0 ? (p.interesses as Tema[]) : [...DEFAULT_INTERESSES],
      semBriga: p.semBriga !== false,
    };
  } catch {
    return PERFIL_DEFAULT;
  }
}

export function setPerfilNoticias(p: PerfilNoticias): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    window.dispatchEvent(new CustomEvent(PERFIL_EVENT));
  } catch { /* ignore */ }
}

export function perfilQuery(p: PerfilNoticias): string {
  return `interesses=${encodeURIComponent(p.interesses.join(","))}&semBriga=${p.semBriga ? 1 : 0}`;
}
