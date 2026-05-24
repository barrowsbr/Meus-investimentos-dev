import StandbyPage from "@/components/StandbyPage";
import { Activity } from "lucide-react";

export default function EvolucaoPage() {
  return (
    <StandbyPage
      title="Evolução Patrimonial"
      description="Análise detalhada da evolução do seu patrimônio ao longo do tempo, com comparativos entre classes de ativos e projeções futuras."
      icon={<Activity size={32} strokeWidth={1.4} />}
      accentColor="#60a5fa"
      features={[
        "Gráfico histórico de patrimônio total",
        "Decomposição por classe de ativo ao longo do tempo",
        "Comparativo com benchmarks (CDI, IBOV, S&P500)",
        "Taxa de crescimento anual (CAGR)",
        "Projeções com base na taxa histórica",
      ]}
    />
  );
}
