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
