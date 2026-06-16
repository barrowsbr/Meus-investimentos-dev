"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Rail from "./Rail";
import CommandBar from "./CommandBar";
import StatusBar from "./StatusBar";
import BottomNav from "./BottomNav";
import { navItemForPath } from "./nav";
import { GlobeOverlayProvider } from "@/components/GlobeOverlayContext";
import HoloOverlay from "@/components/HoloOverlay";

export default function TerminalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [railOpen, setRailOpen] = useState(false);
  const item = navItemForPath(pathname);
  const title = item?.label ?? "Terminal";

  return (
    <GlobeOverlayProvider>
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <Rail open={railOpen} onNavigate={() => setRailOpen(false)} />

      {/* Coluna direita — empurrada pelo rail fixo a partir de 1100px.
          paddingTop = safe-area: derruba o topo abaixo do notch no mobile. */}
      <div
        className="flex flex-1 flex-col min-w-0 min-[1100px]:ml-[206px]"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <CommandBar title={title} onMenu={() => setRailOpen((o) => !o)} />
        <main
          key={pathname}
          className="flex-1 min-h-0 overflow-auto animate-fade-in px-4 py-4 md:px-[22px] md:py-[18px]"
          style={{ overscrollBehavior: "none" }}
        >
          {children}
          {/* respiro p/ a barra inferior no mobile (some no desktop) */}
          <div className="min-[1100px]:hidden" style={{ height: "calc(60px + env(safe-area-inset-bottom))" }} aria-hidden />
        </main>
        <StatusBar />
        <BottomNav />
      </div>
      <HoloOverlay />
    </div>
    </GlobeOverlayProvider>
  );
}
