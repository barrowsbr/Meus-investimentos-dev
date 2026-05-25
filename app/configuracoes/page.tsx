import StandbyPage from "@/components/StandbyPage";
import { Settings } from "lucide-react";

export default function ConfiguracoesPage() {
  return (
    <StandbyPage
      title="Configurações"
      description="Gerencie preferências de exibição, integrações com corretoras e fontes de dados do seu dashboard."
      icon={<Settings size={32} strokeWidth={1.4} />}
      accentColor="#71717a"
      features={[
        "Configuração de API Key do Google Sheets",
        "Preferências de moeda e fuso horário",
        "Gerenciamento de corretoras cadastradas",
        "Temas e preferências visuais",
        "Exportação de dados em CSV/Excel",
      ]}
    />
  );
}
