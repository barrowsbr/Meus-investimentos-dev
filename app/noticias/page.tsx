"use client";

// Central de Notícias & Previsões — funde o jornal (NoticiasPanel) com os
// mercados preditivos (PreditivosPanel) numa página só, focos separados por aba.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import NoticiasPanel from "@/components/noticias/NoticiasPanel";
import PreditivosPanel from "@/components/noticias/PreditivosPanel";
import TvAoVivoPanel from "@/components/noticias/TvAoVivoPanel";

type Tab = "noticias" | "previsoes" | "tv";

const DESCRICOES: Record<Tab, string> = {
  noticias: "Jornal do mercado — relevante para a sua carteira",
  previsoes: "Mercados preditivos com impacto econômico",
  tv: "Canais de notícia ao vivo (negócios, mundo e Brasil)",
};

export default function NoticiasPage() {
  const params = useSearchParams();
  const param = params.get("tab");
  const initial: Tab = param === "previsoes" ? "previsoes" : param === "tv" ? "tv" : "noticias";
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <>
      <PageHeader
        title="Notícias & Previsões"
        description={DESCRICOES[tab]}
        tabs={[{ id: "noticias", label: "Notícias" }, { id: "previsoes", label: "Previsões" }, { id: "tv", label: "TV ao vivo" }]}
        activeTab={tab}
        onTab={(id) => setTab(id as Tab)}
      />
      <div className="mt-4">
        {tab === "noticias" && <NoticiasPanel />}
        {tab === "previsoes" && <PreditivosPanel />}
        {tab === "tv" && <TvAoVivoPanel />}
      </div>
    </>
  );
}
