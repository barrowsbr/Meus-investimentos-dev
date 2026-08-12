// Precificador — consulta MCC × CNAE × custo de bandeira (versão "aderente
// ao uso" do dono): achar MCC por CNAE e vice-versa, ver o custo IC+Fee de
// cada bandeira×produto do MCC com clareza, e opcionalmente testar um preço
// (MDR − custo). Sem custos internos da Stone (servir/CAC/alçadas) — ruído.
// Base embutida no componente (planilha DataRequest Polos v2.01, 30/04/2025).

import ConsultaMcc from "@/components/precificador/ConsultaMcc";

export default function PrecificadorPage() {
  return <ConsultaMcc />;
}
