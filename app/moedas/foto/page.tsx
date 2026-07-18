import { Suspense } from "react";
import MoedasFotoStudio from "@/components/moedas/MoedasFotoStudio";
import LoadingSpinner from "@/components/LoadingSpinner";

export const metadata = {
  title: "Estúdio de foto · Meus Investimentos",
  description: "Tire ou envie uma foto da moeda e recorte no formato circular da coleção.",
};

export default function MoedasFotoPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MoedasFotoStudio />
    </Suspense>
  );
}
