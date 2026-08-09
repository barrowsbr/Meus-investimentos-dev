import { Suspense } from "react";
import EtfCemShell from "@/components/etfcem/EtfCemShell";
import LoadingSpinner from "@/components/LoadingSpinner";

export const metadata = {
  title: "ETF Cem · Meus Investimentos",
  description: "O S&P 500 completo (via VOO): preço, P/L e distância do topo histórico.",
};

export default function EtfCemPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <EtfCemShell />
    </Suspense>
  );
}
