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
}

export default function AppBackground() {
  const [bg, setBg] = useState(DEFAULT_BG);

  useEffect(() => {
    setBg(getBackgroundImage());
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
        backgroundImage: `url('${bg}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        opacity: 0.06,
      }}
    />
  );
}
