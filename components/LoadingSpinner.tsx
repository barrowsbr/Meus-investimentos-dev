"use client";

// Estado de carregamento das páginas: SÓ a animação personalizada por rota
// (PageLoader), centralizada na tela, sobre o fundo direto — sem esqueletos
// de cards nem caixa em volta (decisão do dono: os skeletons brigavam com a
// cena e poluíam o fundo).

import PageLoader from "./PageLoader";

export default function LoadingSpinner() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center animate-fade-in">
      <PageLoader />
    </div>
  );
}
