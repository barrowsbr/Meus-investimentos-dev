"use client";

// Fino wrapper sobre EmbedModal para o World Monitor (mantém a assinatura
// open/onClose usada pelo HoloOverlay e RadarTopBar).
import EmbedModal from "./EmbedModal";

export default function WorldMonitorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <EmbedModal
      item={open ? { url: "https://world-monitor.com/", title: "World Monitor", sub: "monitor global ao vivo · dentro do app" } : null}
      onClose={onClose}
    />
  );
}
