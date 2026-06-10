"use client";

import { useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function CotacoesRefresh() {
  useEffect(() => {
    fetch(`${API}/api/cotacoes/refresh`).catch(() => {});
  }, []);
  return null;
}
