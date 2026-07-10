"use client";

// Central de Notícias & Previsões — funde o jornal (NoticiasPanel) com os
// mercados preditivos (PreditivosPanel) numa página só, focos separados por aba.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import NoticiasPanel from "@/components/noticias/NoticiasPanel";
import PreditivosPanel from "@/components/noticias/PreditivosPanel";

type Tab = "noticias" | "previsoes";

export default function NoticiasPage() {
  const params = useSearchParams();
  const initial: Tab = params.get("tab") === "previsoes" ? "previsoes" : "noticias";
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <>
      <PageHeader
        title="Notícias & Previsões"
        description={tab === "noticias" ? "Jornal do mercado — relevante para a sua carteira" : "Mercados preditivos com impacto econômico"}
        tabs={[{ id: "noticias", label: "Notícias" }, { id: "previsoes", label: "Previsões" }]}
        activeTab={tab}
        onTab={(id) => setTab(id as Tab)}
      />
      <div className="mt-4">
        {tab === "noticias" ? <NoticiasPanel /> : <PreditivosPanel />}
      </div>
    </>
  );
}
