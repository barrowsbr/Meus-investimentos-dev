"use client";

// Error boundary de rota (App Router). Substitui a TELA BRANCA por uma tela de
// erro recuperável quando um componente da página quebra em runtime — inclusive
// o caso comum de "ChunkLoadError" após um deploy novo (o botão Recarregar puxa
// os bundles atualizados).

import { useEffect } from "react";
import { RotateCw, AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[app/error]", error);
    // ChunkLoadError = bundle antigo após deploy → um reload resolve.
    if (/ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(error?.message ?? "")) {
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle size={34} className="text-amber-400/70" />
      <div>
        <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>Algo quebrou nesta tela</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          O resto do app segue funcionando. Tente recarregar — se acabou de sair um deploy, isso costuma resolver.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.12]"
        >
          <RotateCw size={15} /> Tentar de novo
        </button>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25"
        >
          Recarregar página
        </button>
      </div>
    </div>
  );
}
