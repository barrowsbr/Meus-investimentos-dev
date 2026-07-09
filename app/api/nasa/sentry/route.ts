import { NextResponse } from "next/server";

// Sentry — sistema de monitoramento de risco de impacto do JPL/NASA. Lista os
// objetos com probabilidade NÃO-ZERO de colidir com a Terra nos próximos ~100
// anos. API pública do JPL (ssd-api.jpl.nasa.gov), sem key.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export interface SentryObj {
  des: string;
  nome: string;
  probImpacto: number;   // probabilidade cumulativa (0–1)
  palermo: number;       // escala de Palermo cumulativa (log)
  torino: number | null; // escala de Torino (0–10)
  diametroKm: number;
  velocidadeKms: number;
  anos: string;          // janela de anos ex.: "2032-2100"
  nImpactos: number;
  energiaMt: number;     // energia estimada de impacto (megatons)
  ultimaObs: string;
}

export async function GET() {
  try {
    const res = await fetch("https://ssd-api.jpl.nasa.gov/sentry.api", { headers: { Accept: "application/json" } });
    if (!res.ok) return NextResponse.json({ error: `Sentry HTTP ${res.status}` }, { status: 502 });
    const d = await res.json();
    const objetos: SentryObj[] = ((d.data ?? []) as Record<string, unknown>[])
      .map((o) => ({
        des: String(o.des ?? ""),
        nome: String(o.fullname ?? o.des ?? "").trim(),
        probImpacto: Number(o.ip ?? 0),
        palermo: Number(o.ps_cum ?? o.ps_max ?? 0),
        torino: o.ts_max != null && o.ts_max !== "" ? Number(o.ts_max) : null,
        diametroKm: Number(o.diameter ?? 0),
        velocidadeKms: Number(o.v_inf ?? 0),
        anos: String(o.range ?? ""),
        nImpactos: Number(o.n_imp ?? 0),
        energiaMt: Number(o.energy ?? 0),
        ultimaObs: String(o.last_obs ?? ""),
      }))
      .sort((a, b) => b.probImpacto - a.probImpacto);

    const maiorProb = objetos[0] ?? null;
    const maiorDiam = objetos.reduce((m, o) => (o.diametroKm > m.diametroKm ? o : m), objetos[0] ?? ({ diametroKm: 0 } as SentryObj));

    return NextResponse.json(
      { total: objetos.length, maiorProb, maiorDiametro: maiorDiam, objetos: objetos.slice(0, 100) },
      { headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
