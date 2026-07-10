// Helper para abrir QUALQUER link externo embutido no app (iframe via EmbedModal)
// em vez de mandar para outra aba. Dispara um evento global escutado pelo
// <EmbedHost> montado no shell — assim qualquer botão pode chamar openEmbed sem
// precisar de estado próprio nem passar props.

export const EMBED_EVENT = "app:open-embed";

export interface EmbedTarget {
  url: string;
  title: string;
  sub?: string;
}

export function openEmbed(url: string, title: string, sub?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<EmbedTarget>(EMBED_EVENT, { detail: { url, title, sub } }));
}

// Reportagens (Yahoo, jornais etc.) quase sempre bloqueiam iframe
// (X-Frame-Options / CSP) → o EmbedModal fica em branco. Notícias devem abrir
// SEMPRE em aba nova (link normal), nunca embutidas. Use isto para reportagem.
export function openArticle(url: string): void {
  if (typeof window === "undefined" || !url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
