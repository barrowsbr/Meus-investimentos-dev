import { Suspense } from "react";
import MoedasShell from "@/components/moedas/MoedasShell";
import LoadingSpinner from "@/components/LoadingSpinner";

export const metadata = {
  title: "Moedas · Meus Investimentos",
  description: "Coleção numismática: fotos, valores, graduação e mapa-múndi.",
};

export default function MoedasPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MoedasShell />
    </Suspense>
  );
}
