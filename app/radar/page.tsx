import { Suspense } from "react";
import RadarShell from "@/components/radar/RadarShell";
import LoadingSpinner from "@/components/LoadingSpinner";

export const metadata = {
  title: "Radar · Meus Investimentos",
  description: "Mapa-múndi geoeconômico: índices, moedas e dossiê por país.",
};

export default function RadarPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <RadarShell />
    </Suspense>
  );
}
