"use client";

// A página de predições foi fundida em /noticias (aba Previsões). Mantém a rota
// antiga funcionando via redirect.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PolymarketRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/noticias?tab=previsoes");
  }, [router]);
  return null;
}
