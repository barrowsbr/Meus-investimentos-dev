// Preferências finas da Home (client-only, localStorage) — ajustes tipo
// "quantos pregões no termômetro". Persistem por navegador (mesmo padrão do
// tema/olho de privacidade). Mudanças disparam um evento p/ a Home reagir na
// hora, sem recarregar.

export const STREAK_DAYS_KEY = "home-streak-days";
export const STREAK_DAYS_DEFAULT = 30;
export const STREAK_DAYS_MIN = 2;
export const STREAK_DAYS_MAX = 90;
export const STREAK_DAYS_EVENT = "home-streak-days-change";

const clamp = (n: number) => Math.min(STREAK_DAYS_MAX, Math.max(STREAK_DAYS_MIN, Math.round(n)));

export function getStreakDays(): number {
  if (typeof window === "undefined") return STREAK_DAYS_DEFAULT;
  try {
    const n = parseInt(localStorage.getItem(STREAK_DAYS_KEY) ?? "", 10);
    if (Number.isFinite(n)) return clamp(n);
  } catch { /* ignore */ }
  return STREAK_DAYS_DEFAULT;
}

export function setStreakDays(n: number): void {
  const v = Number.isFinite(n) ? clamp(n) : STREAK_DAYS_DEFAULT;
  try {
    localStorage.setItem(STREAK_DAYS_KEY, String(v));
    window.dispatchEvent(new CustomEvent(STREAK_DAYS_EVENT, { detail: v }));
  } catch { /* ignore */ }
}
