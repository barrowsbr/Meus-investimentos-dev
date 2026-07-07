"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { bumpDataVersion } from "@/lib/data-version";
import Rail from "./Rail";
import CommandBar from "./CommandBar";
import WalkerSprite from "./WalkerSprite";
import BottomNav from "./BottomNav";
import { navItemForPath } from "./nav";
import { GlobeOverlayProvider } from "@/components/GlobeOverlayContext";
import HoloOverlay from "@/components/HoloOverlay";
import MatrixRain from "./MatrixRain";
import MiamiBackground from "./MiamiBackground";
import BladeRunnerRain from "./BladeRunnerRain";
import AmbarBackground from "./AmbarBackground";
import CremeBackground from "./CremeBackground";
import StarwarsBackground from "./StarwarsBackground";

const COLLAPSED_KEY = "rail-collapsed";

// Hard refresh: além de bustar o cache de DADOS (bumpDataVersion via ?v=),
// limpa o Cache Storage e desregistra service workers (PWA) para que o
// app-shell / JS / CSS venham novos do servidor — evita ficar vendo versão
// antiga após um deploy. Best-effort: qualquer falha não bloqueia o reload.
async function hardReload(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* best-effort — segue pro reload de qualquer jeito */ }
  window.location.reload();
}

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

  // ── Pull-to-refresh (mobile): puxar pra baixo no topo → recarrega limpando
  // o cache do CDN (bumpDataVersion) + reload, como num app nativo. ──────────
  const mainRef = useRef<HTMLElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const THRESHOLD = 72;
  const MAX_PULL = 110;

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      // Não ativa sobre o mapa do Radar ou áreas que pediram opt-out.
      const t = e.target as Element | null;
      if (t?.closest("[data-no-pull]")) { pulling.current = false; return; }
      if (el.scrollTop <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      } else {
        pulling.current = false;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || el.scrollTop > 0) { pulling.current = false; setDragging(false); setPull(0); return; }
      e.preventDefault(); // segura o bounce nativo e controla o gesto
      setDragging(true);
      setPull(Math.min(MAX_PULL, dy * 0.5));
    };
    const onEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;
      setDragging(false);
      setPull((p) => {
        if (p >= THRESHOLD && !refreshing) {
          setRefreshing(true);
          bumpDataVersion(); // busta o cache de DADOS do CDN (?v=)
          // Hard refresh: limpa Cache Storage + service workers e recarrega.
          setTimeout(() => { void hardReload(); }, 450);
          return THRESHOLD; // segura o spinner no lugar enquanto recarrega
        }
        return 0;
      });
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [refreshing, pathname]);

  return (
    <GlobeOverlayProvider>
    <AmbarBackground />
    <CremeBackground />
    <MatrixRain />
    <MiamiBackground />
    <BladeRunnerRain />
    <StarwarsBackground />
    <div className="terminal-root relative z-[1] flex h-screen overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <Rail open={railOpen} collapsed={collapsed} onToggleCollapse={toggleCollapsed} onNavigate={() => setRailOpen(false)} />

      <div
        className={`flex flex-1 flex-col min-w-0 ${collapsed ? "min-[1100px]:ml-[60px]" : "min-[1100px]:ml-[206px]"}`}
        style={{ paddingTop: "env(safe-area-inset-top)", transition: "margin-left 200ms ease" }}
      >
        {/* Barra superior + mascote que a atravessa a cada 1 min (WalkerSprite) */}
        <div className="relative">
          <CommandBar title={title} onMenu={() => setRailOpen((o) => !o)} />
          <WalkerSprite />
        </div>
        <main
          ref={mainRef}
          key={pathname}
          className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden animate-fade-in px-4 py-4 md:px-[22px] md:py-[18px]"
          style={{ overscrollBehavior: "none" }}
        >
          {/* Indicador de pull-to-refresh */}
          {(pull > 0 || refreshing) && (
            <div
              className="pointer-events-none absolute left-1/2 top-1 z-[5] flex items-center justify-center"
              style={{
                transform: `translateX(-50%) translateY(${Math.max(0, pull - 28)}px)`,
                opacity: refreshing ? 1 : Math.min(1, pull / 40),
                transition: dragging ? "none" : "transform .25s ease, opacity .2s",
              }}
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full shadow-lg"
                style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                  style={{
                    color: pull >= THRESHOLD || refreshing ? "var(--accent)" : "var(--muted)",
                    transform: refreshing ? undefined : `rotate(${pull * 2.6}deg)`,
                  }}
                />
              </div>
            </div>
          )}
          <div style={{ transform: `translateY(${pull}px)`, transition: dragging ? "none" : "transform .25s ease" }}>
            {children}
            <div className="min-[1100px]:hidden" style={{ height: "calc(76px + env(safe-area-inset-bottom))" }} aria-hidden />
          </div>
        </main>
        <BottomNav />
      </div>
      <HoloOverlay />
    </div>
    </GlobeOverlayProvider>
  );
}
