import { redirect } from "next/navigation";

// A página de Alavancagem foi unificada com Caixa em "Caixa & Margem" (/caixa).
// Margem e caixa agora vêm automaticamente da IBKR (Flex). Redireciona.
export default function AlavancagemPage() {
  redirect("/caixa");
}
