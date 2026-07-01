import { redirect } from "next/navigation";

// A página de Rebalanceamento foi fundida dentro de Simulações (aba
// "Rebalanceamento"). Mantemos esta rota como redirect para não quebrar
// links/bookmarks antigos.
export default function RebalanceamentoRedirect() {
  redirect("/simulacoes?tab=rebalanceamento");
}
