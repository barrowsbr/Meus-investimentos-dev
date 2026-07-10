"use client";

// global-error — último recurso: captura erros que acontecem no PRÓPRIO layout
// raiz (fora do app/error.tsx). Precisa renderizar <html>/<body> próprios.
// Sem isto, um erro no layout = tela 100% branca.

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global-error]", error);
    if (/ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(error?.message ?? "")) {
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#0a0a0a", color: "#e4e4e7", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Não foi possível carregar o app</h2>
          <p style={{ fontSize: 14, color: "#a1a1aa", maxWidth: 420, margin: 0 }}>
            Isso costuma acontecer logo após um novo deploy. Recarregue a página para pegar a versão mais recente.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => reset()}
              style={{ borderRadius: 12, background: "rgba(255,255,255,0.08)", color: "#e4e4e7", border: "none", padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Tentar de novo
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ borderRadius: 12, background: "rgba(34,211,238,0.18)", color: "#a5f3fc", border: "none", padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Recarregar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
