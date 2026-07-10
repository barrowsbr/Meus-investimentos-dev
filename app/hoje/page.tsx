"use client";

// A página Hoje é acessada principalmente pelo popup aberto ao clicar em
// "Σ Retorno do dia" na Home (HojeModal). A rota segue existindo para o link
// "Página" do modal e para deep-links diretos — mas saiu da sidebar.
import HojeContent from "@/components/HojeContent";

export default function HojePage() {
  return <HojeContent />;
}
