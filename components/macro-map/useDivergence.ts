"use client";

// Fetch do relatório de divergência, compartilhado pela página /macro-map e pelo
// painel do Radar. A rota tem cache CDN de 30 min, então chamar de dois lugares
// é barato. Expõe reload() para o botão de atualizar.

import { useCallback, useEffect, useState } from "react";
import type { DivergenceReport } from "@/lib/macro-map/types";

export function useDivergence() {
  const [report, setReport] = useState<DivergenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    setErro(null);
    let vivo = true;
    fetch("/api/macro-map/divergence")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => vivo && setReport(d))
      .catch((e) => vivo && setErro(String(e?.message ?? e)))
      .finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
  }, []);

  useEffect(() => carregar(), [carregar]);

  return { report, loading, erro, reload: carregar };
}
