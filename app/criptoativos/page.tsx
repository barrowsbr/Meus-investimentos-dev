import StandbyPage from "@/components/StandbyPage";
import { Bitcoin } from "lucide-react";

export default function CriptativosPage() {
  return (
    <StandbyPage
      title="Criptoativos"
      description="Acompanhe seus ativos digitais, histórico de transações e performance em Bitcoin, Ethereum e outros tokens."
      icon={<Bitcoin size={32} strokeWidth={1.4} />}
      accentColor="#f97316"
      features={[
        "Portfólio de Bitcoin, Ethereum e altcoins",
        "Histórico de compras e vendas",
        "Performance em BRL e USD",
        "Rastreamento de exchanges (Binance, Coinbase...)",
        "Cálculo de lucro/prejuízo por ativo",
      ]}
    />
  );
}
