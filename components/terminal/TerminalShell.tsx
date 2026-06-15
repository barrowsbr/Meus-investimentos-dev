"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Rail from "./Rail";
import CommandBar from "./CommandBar";
import StatusBar from "./StatusBar";
import { navItemForPath } from "./nav";

export default function TerminalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [railOpen, setRailOpen] = useState(false);
  const item = navItemForPath(pathname);
  const title = item?.label ?? "Terminal";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <Rail open={railOpen} onNavigate={() => setRailOpen(false)} />

      {/* Coluna direita — empurrada pelo rail fixo a partir de 1100px */}
      <div className="flex flex-1 flex-col min-w-0 min-[1100px]:ml-[206px]">
        <CommandBar title={title} onMenu={() => setRailOpen((o) => !o)} />
        <main
          key={pathname}
          className="flex-1 min-h-0 overflow-auto animate-fade-in px-4 py-4 md:px-[22px] md:py-[18px] pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {children}
        </main>
        <StatusBar />
      </div>
    </div>
  );
}
