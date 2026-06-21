"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Rail from "./Rail";
import CommandBar from "./CommandBar";
import BottomNav from "./BottomNav";
import { navItemForPath } from "./nav";
import { GlobeOverlayProvider } from "@/components/GlobeOverlayContext";
import HoloOverlay from "@/components/HoloOverlay";

const COLLAPSED_KEY = "rail-collapsed";

export default function TerminalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [railOpen, setRailOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const item = navItemForPath(pathname);
  const title = item?.label ?? "Terminal";

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      return !c;
    });
  };

  return (
    <GlobeOverlayProvider>
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <Rail open={railOpen} collapsed={collapsed} onNavigate={() => setRailOpen(false)} />

      <div
        className={`flex flex-1 flex-col min-w-0 ${collapsed ? "min-[1100px]:ml-[60px]" : "min-[1100px]:ml-[206px]"}`}
        style={{ paddingTop: "env(safe-area-inset-top)", transition: "margin-left 200ms ease" }}
      >
        <CommandBar title={title} onMenu={() => setRailOpen((o) => !o)} onToggleCollapse={toggleCollapsed} />
        <main
          key={pathname}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden animate-fade-in px-4 py-4 md:px-[22px] md:py-[18px]"
          style={{ overscrollBehavior: "none" }}
        >
          {children}
          <div className="min-[1100px]:hidden" style={{ height: "calc(60px + env(safe-area-inset-bottom))" }} aria-hidden />
        </main>
        <BottomNav />
      </div>
      <HoloOverlay />
    </div>
    </GlobeOverlayProvider>
  );
}
