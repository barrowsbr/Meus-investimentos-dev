/**
 * Formata um timestamp ISO em rótulo de frescor legível.
 * Ex.: "agora", "há 5min", "há 3h", "há 2d", "dados de 2024".
 */
export function freshLabel(isoDate: string | undefined | null): string {
  if (!isoDate) return "";
  const diff = Date.now() - new Date(isoDate).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 365) return `há ${d}d`;
  const year = new Date(isoDate).getFullYear();
  return `dados de ${year}`;
}
