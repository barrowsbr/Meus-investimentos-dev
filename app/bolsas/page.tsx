import { redirect } from "next/navigation";

// O Scanner foi reformulado como Radar V2 (mapa-centro + dossiê por país).
// /bolsas agora redireciona para /radar, preservando deep-links (?symbol/?country).
export default function BolsasRedirect({
  searchParams,
}: {
  searchParams: { symbol?: string; country?: string };
}) {
  const p = new URLSearchParams();
  if (searchParams.symbol) p.set("symbol", searchParams.symbol);
  if (searchParams.country) p.set("country", searchParams.country);
  const qs = p.toString();
  redirect(qs ? `/radar?${qs}` : "/radar");
}
