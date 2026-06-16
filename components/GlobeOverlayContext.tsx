"use client";

import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from "react";

interface GlobeOverlayCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Logo da CommandBar — origem do "nascimento" do globo. */
  originRef: RefObject<HTMLButtonElement>;
}

const Ctx = createContext<GlobeOverlayCtx | null>(null);

export function useGlobeOverlay(): GlobeOverlayCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGlobeOverlay precisa estar dentro de <GlobeOverlayProvider>");
  return c;
}

export function GlobeOverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const originRef = useRef<HTMLButtonElement>(null);
  return <Ctx.Provider value={{ open, setOpen, originRef }}>{children}</Ctx.Provider>;
}
