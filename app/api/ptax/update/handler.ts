import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { getServiceAccountAuth } from "@/lib/gsheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface BcbCotacao {
  cotacaoVenda: number;
  dataHoraCotacao: string;
}

function parseDate(raw: string): string {
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return "";
}

function toISODate(dateStr: string): string {
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const bcb = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (bcb) return `${bcb[3]}-${bcb[2]}-${bcb[1]}`;
  return "";
}

function formatBrDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function fetchBcbPtax(startDate: string, endDate: string): Promise<Map<string, number>> {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${m}-${d}-${y}`;
  };

  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@di,dataFinalCotacao=@df)?@di='${fmt(startDate)}'&@df='${fmt(endDate)}'&$top=10000&$format=json&$select=cotacaoVenda,dataHoraCotacao`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`BCB API returned ${res.status}`);

  const json = await res.json();
  const values: BcbCotacao[] = json.value ?? [];

  const map = new Map<string, number>();
  for (const v of values) {
    if (!v.cotacaoVenda || v.cotacaoVenda <= 0) continue;
    const dateMatch = v.dataHoraCotacao.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!dateMatch) continue;
    const iso = dateMatch[0];
    map.set(iso, v.cotacaoVenda);
  }
  return map;
}

export async function POST() {
  if (!getServiceAccountAuth()) {
    return NextResponse.json(
      { error: "Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON" },
      { status: 500 },
    );
  }

  try {
    const store = getDataStore();
    const existing = await store.fetchTab("p_tax").catch(() => []);

    const existingDates = new Set<string>();
    let latestExisting = "";
    for (const row of existing) {
      const raw = String(row["data"] ?? row["date"] ?? row["data cotação"] ?? "");
      const iso = parseDate(raw);
      if (iso) {
        existingDates.add(iso);
        if (iso > latestExisting) latestExisting = iso;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const startDate = latestExisting
      ? (() => {
          const d = new Date(latestExisting);
          d.setDate(d.getDate() + 1);
          return d.toISOString().slice(0, 10);
        })()
      : "2020-01-01";

    if (startDate > today) {
      return NextResponse.json({ ok: true, newRows: 0, message: "PTAX já atualizado" });
    }

    const bcbData = await fetchBcbPtax(startDate, today);

    const newRows: string[][] = [];
    for (const [iso, rate] of [...bcbData.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (existingDates.has(iso)) continue;
      newRows.push([formatBrDate(iso), rate.toFixed(4).replace(".", ",")]);
    }

    if (newRows.length === 0) {
      return NextResponse.json({ ok: true, newRows: 0, message: "Sem novos dados do BCB" });
    }

    await store.appendRows("p_tax", newRows);

    const latestNew = newRows[newRows.length - 1];
    return NextResponse.json({
      ok: true,
      newRows: newRows.length,
      latestDate: latestNew[0],
      latestRate: latestNew[1],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
