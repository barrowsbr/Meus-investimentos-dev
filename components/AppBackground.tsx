"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "mi_bg_image";
const DEFAULT_BG = "/midias/home-bg.jpeg";

export function getBackgroundImage(): string {
  if (typeof window === "undefined") return DEFAULT_BG;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_BG;
}

export function setBackgroundImage(path: string) {
  localStorage.setItem(STORAGE_KEY, path);
  window.dispatchEvent(new Event("bg-change"));
  fetch("/api/config/background", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => {});
}

export default function AppBackground() {
  const [bg, setBg] = useState(DEFAULT_BG);

  useEffect(() => {
    setBg(getBackgroundImage());

    fetch("/api/config/background")
      .then(r => r.json())
      .then(d => {
        const local = localStorage.getItem(STORAGE_KEY);
        if (d.saved && d.background && d.background !== local) {
          // servidor tem escolha persistida → vale para todos os dispositivos
          localStorage.setItem(STORAGE_KEY, d.background);
          setBg(d.background);
        } else if (!d.saved && local) {
          // servidor sem valor salvo mas há escolha local → re-persiste
          // (auto-cura de quando o save falhava por falta da aba config)
          fetch("/api/config/background", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: local }),
          }).catch(() => {});
        }
      })
      .catch(() => {});

    const handler = () => setBg(getBackgroundImage());
    window.addEventListener("bg-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("bg-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      style={{
        backgroundImage: bg ? `url('${bg}')` : "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        opacity: 0.06,
      }}
    />
  );
}
