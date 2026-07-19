import { Suspense } from "react";
import GameBoyShell from "@/components/gameboy/GameBoyShell";
import LoadingSpinner from "@/components/LoadingSpinner";

export const metadata = {
  title: "Game Boy · Meus Investimentos",
  description: "Pokémon Gold Spaceworld '97 no emulador embutido — toque e teclado, saves no aparelho.",
};

export default function GameBoyPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <GameBoyShell />
    </Suspense>
  );
}
