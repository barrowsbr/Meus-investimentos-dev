"use client";

// Página "Hoje" — zerada a pedido do dono para ser refeita do zero.
// A rota e o item de navegação continuam vivos; o conteúdo novo entra aqui.
// (O endpoint /api/hoje/comentario segue disponível caso a nova versão o use.)

export default function HojePage() {
  return (
    <div className="max-w-3xl mx-auto pt-16 text-center space-y-3">
      <p className="font-mono text-[10px] font-bold uppercase" style={{ letterSpacing: ".22em", color: "var(--muted)" }}>
        Hoje
      </p>
      <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>
        Página em reconstrução
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        O conteúdo anterior foi removido — a nova versão será montada aqui.
      </p>
    </div>
  );
}
