import StandbyPage from "@/components/StandbyPage";
import { BarChart2 } from "lucide-react";

export default function PerformanceAvancadaPage() {
  return (
    <StandbyPage
      title="Performance Avançada"
      description="Análise quantitativa aprofundada da carteira com métricas de risco/retorno, drawdown e rolling returns."
      icon={<BarChart2 size={32} strokeWidth={1.4} />}
      accentColor="#3b82f6"
      features={[
        "Drawdown máximo desde o início (série temporal)",
        "Rolling returns (1M, 3M, 6M, 1A)",
        "Sharpe Ratio e Sortino Ratio",
        "Attribution analysis por setor e ativo",
        "Value at Risk (VaR) 95% e 99%",
        "Correlation matrix entre ativos",
      ]}
    />
  );
}
