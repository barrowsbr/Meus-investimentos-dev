"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Menu } from "lucide-react";
import { useGlobeOverlay } from "@/components/GlobeOverlayContext";

interface Props {
  title: string;
  onMenu?: () => void;
}

export default function CommandBar({ title, onMenu }: Props) {
  const { setOpen: setGlobeOpen, originRef } = useGlobeOverlay();
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date()
          .toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          .replace(".", ""),
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Backup diário da planilha: 1 ping por sessão do navegador ao abrir o app;
  // o servidor decide (pula se já rodou hoje / modo demo). Fire-and-forget.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("bkp-daily-ping")) return;
      sessionStorage.setItem("bkp-daily-ping", "1");
    } catch { /* sessionStorage indisponível — pinga mesmo assim */ }
    fetch("/api/config/planilha/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "daily" }),
    }).catch(() => {});
  }, []);

  return (
    <div
      className="flex items-center gap-3 md:gap-4 px-3 md:px-[18px] shrink-0"
      style={{ height: 54, borderBottom: "1px solid var(--line)", background: "var(--bg)" }}
    >
      {/* Hamburger (mobile) */}
      <button
        onClick={onMenu}
        aria-label="Abrir navegação"
        className="min-[1100px]:hidden grid place-items-center"
        style={{ width: 30, height: 30, border: "1px solid var(--line)", color: "var(--muted)" }}
      >
        <Menu size={16} />
      </button>

      <span
        className="font-mono shrink-0"
        style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".16em", color: "var(--text)", textTransform: "uppercase" }}
      >
        {title}
      </span>

      <div className="flex-1" />

      {/* Logo redonda — dispara o globo holográfico (overlay global) */}
      <button
        ref={originRef}
        onClick={() => setGlobeOpen(true)}
        aria-label="Abrir globo de mercados"
        className="shrink-0 grid place-items-center transition-opacity hover:opacity-80"
        style={{ width: 32, height: 32 }}
      >
        <Image src="/midias/logo-globo.png" alt="Globo de mercados" width={30} height={30} className="rounded-full" priority />
      </button>

      {/* Relógio AO VIVO */}
      <span className="hidden md:flex items-center gap-1.5 font-mono shrink-0" style={{ fontSize: 10.5, color: "var(--muted)" }}>
        <span className="t-blink rounded-full" style={{ width: 6, height: 6, background: "var(--pos)" }} />
        {now || "—"}
      </span>
    </div>
  );
}
