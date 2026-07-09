"use client";

// EmbedHost — montado uma vez no shell. Escuta o evento global openEmbed e
// renderiza o EmbedModal, permitindo que qualquer link do app abra embutido
// (sem estado próprio em cada componente).

import { useEffect, useState } from "react";
import EmbedModal from "./EmbedModal";
import { EMBED_EVENT, type EmbedTarget } from "@/lib/embed-link";

export default function EmbedHost() {
  const [item, setItem] = useState<EmbedTarget | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<EmbedTarget>).detail;
      if (detail?.url) setItem(detail);
    };
    window.addEventListener(EMBED_EVENT, onOpen);
    return () => window.removeEventListener(EMBED_EVENT, onOpen);
  }, []);

  return <EmbedModal item={item} onClose={() => setItem(null)} />;
}
