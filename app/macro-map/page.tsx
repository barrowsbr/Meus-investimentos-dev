"use client";

// Página do Mapa de Transmissão Macro. O detector também vive DENTRO do Radar
// (components/radar/TransmissaoPanel) reusando a mesma vista; aqui é a versão
// completa, com a tese em destaque.

import PageHeader from "@/components/PageHeader";
import Panel from "@/components/terminal/Panel";
import { DivergenceView } from "@/components/macro-map/DivergenceView";
import { useDivergence } from "@/components/macro-map/useDivergence";

export default function MacroMapPage() {
  const { report, loading, erro } = useDivergence();

  return (
    <>
      <PageHeader
        title="Transmissão Macro"
        description="Detector de divergência: o mapa diz o que deveria acontecer quando um driver sofre um choque; o alerta dispara quando não acontece."
      />

      <div className="max-w-4xl space-y-4">
        <Panel title="A tese">
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-2)" }}>
            &ldquo;Brent caiu e o ouro subiu&rdquo; é ruído — confirma o óbvio. &ldquo;Brent caiu 2σ e o ouro
            <strong style={{ color: "var(--text)" }}> não reagiu</strong>&rdquo; é sinal. Duas pernas, EUA e Brasil,
            com sinal oposto no mesmo choque. Os cards <strong style={{ color: "#E8A33D" }}>Anômalo</strong> são o produto;
            os <strong style={{ color: "#3FB950" }}>Confirmado</strong> só calibram a confiança.
          </p>
        </Panel>

        <DivergenceView report={report} loading={loading} erro={erro} />
      </div>
    </>
  );
}
