"use client";

// Esqueleto de página + a animação personalizada por rota (PageLoader).
// Os KPIs continuam como skeleton (preservam o layout); o bloco grande vira
// o palco da cena — cofrinho na Home, radar no Radar, moeda em Moedas, etc.

import PageLoader from "./PageLoader";

export default function LoadingSpinner() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-2">
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass-card p-4 md:p-5 space-y-3">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-28" />
            <div className="skeleton h-3 w-36" />
          </div>
        ))}
      </div>
      <div className="glass-card flex min-h-[240px] items-center justify-center p-5">
        <PageLoader />
      </div>
    </div>
  );
}
