import StandbyPage from "@/components/StandbyPage";
import { Newspaper } from "lucide-react";

export default function NoticiasPage() {
  return (
    <StandbyPage
      title="Notícias"
      description="Feed de notícias financeiras relevantes para o seu portfólio — mercados, empresas e economia."
      icon={<Newspaper size={32} strokeWidth={1.4} />}
      accentColor="#06b6d4"
      features={[
        "Notícias sobre ativos da sua carteira",
        "Cobertura de mercados B3 e internacionais",
        "Filtro por setor ou ticker",
        "Agente IA comentando notícias vs. portfólio",
        "Alertas de eventos corporativos (resultados, dividendos)",
      ]}
    />
  );
}
