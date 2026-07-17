import { Suspense } from "react";
import MoedasEstojo from "@/components/moedas/MoedasEstojo";
import LoadingSpinner from "@/components/LoadingSpinner";

export const metadata = {
  title: "Estojos · Meus Investimentos",
  description: "A coleção em estojos por conjunto: pegue as moedas, use a gravidade e compare lado a lado.",
};

export default function MoedasEstojoPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MoedasEstojo />
    </Suspense>
  );
}
