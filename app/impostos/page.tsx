import StandbyPage from "@/components/StandbyPage";
import { Receipt } from "lucide-react";

export default function ImpostosPage() {
  return (
    <StandbyPage
      title="Impostos"
      description="Controle completo de obrigações tributárias sobre seus investimentos — DARFs, isenções e declaração de IR."
      icon={<Receipt size={32} strokeWidth={1.4} />}
      accentColor="#6366f1"
      features={[
        "Geração de DARFs mensais (renda variável)",
        "Controle de isenção até R$ 20k/mês",
        "Cálculo de ganho de capital por ativo",
        "Resumo anual para declaração IR",
        "Compensação de prejuízos acumulados",
      ]}
    />
  );
}
