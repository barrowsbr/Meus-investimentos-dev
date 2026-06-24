import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { getServiceAccountAuth } from "@/lib/gsheets";
import { fetchPtaxUpdates, SUPPORTED_CURRENCIES } from "@/lib/ptax";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

function parseDate(raw: string): string {
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return "";
}

function formatBrDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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

    const existingKeys = new Set<string>();
    let latestExisting = "";
    for (const row of existing) {
      const raw = String(row["data"] ?? row["date"] ?? row["data cotação"] ?? "");
      const iso = parseDate(raw);
      const moeda = String(row["moeda"] ?? row["currency"] ?? "USD").toUpperCase().trim();
      const key = moeda.includes("EUR") ? "EUR" : moeda.includes("CAD") ? "CAD" : moeda.includes("GBP") ? "GBP" : "USD";
      if (iso) {
        existingKeys.add(`${key}:${iso}`);
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

    const allNewRows: string[][] = [];
    const summary: Record<string, number> = {};

    for (const moeda of SUPPORTED_CURRENCIES) {
      try {
        const bcbData = await fetchPtaxUpdates(moeda, startDate, today);

        for (const [iso, rate] of [...bcbData.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          if (existingKeys.has(`${moeda}:${iso}`)) continue;
          allNewRows.push([
            formatBrDate(iso),
            moeda,
            rate.toFixed(4).replace(".", ","),
          ]);
          summary[moeda] = (summary[moeda] ?? 0) + 1;
        }
      } catch {
        summary[moeda] = -1;
      }
    }

    if (allNewRows.length === 0) {
      return NextResponse.json({ ok: true, newRows: 0, message: "Sem novos dados do BCB", summary });
    }

    await store.ensureTab("p_tax", ["data", "moeda", "taxa"]);
    await store.appendRows("p_tax", allNewRows);

    const latest = allNewRows[allNewRows.length - 1];
    return NextResponse.json({
      ok: true,
      newRows: allNewRows.length,
      latestDate: latest[0],
      latestCurrency: latest[1],
      latestRate: latest[2],
      summary,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
