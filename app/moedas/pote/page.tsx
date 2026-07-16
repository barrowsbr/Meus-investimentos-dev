import { Suspense } from "react";
import MoedasPote from "@/components/moedas/MoedasPote";
import LoadingSpinner from "@/components/LoadingSpinner";

export const metadata = {
  title: "Pote de moedas · Meus Investimentos",
  description: "A coleção em escala real, com física: incline o celular e as moedas tombam.",
};

export default function MoedasPotePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MoedasPote />
    </Suspense>
  );
}
