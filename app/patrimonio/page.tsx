"use client";

import PageHeader from "@/components/PageHeader";
import PatrimonioContent from "@/components/PatrimonioContent";

export default function PatrimonioPage() {
  return (
    <>
      <PageHeader title="Patrimônio" description="Histórico do patrimônio total · aba historico_patrimonio" />
      <PatrimonioContent />
    </>
  );
}
