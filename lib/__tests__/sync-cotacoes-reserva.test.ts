// Qualidade de dados do regime híbrido — o CRON DE COTAÇÕES de verdade
// (runCotacoesSync), com mocks só nos I/Os: prova que (1) ativos IBKR têm
// T/T−1 reservados para o mark oficial, (2) o Yahoo segue preenchendo T−2
// (fallback — sem buraco permanente), (3) ativos não-IBKR não mudam EM NADA,
// e (4) nada do que já existia na golden é alterado (guard real no caminho).

import { describe, expect, it, vi } from "vitest";
import type { GoldenSourceData } from "../db-cotacoes";

// ── Datas dinâmicas (o cron usa new Date() real) ─────────────────────────────
const iso = (d: Date) => d.toISOString().split("T")[0];
const hoje = new Date();
const dia = (offset: number) => {
  const d = new Date(hoje);
  d.setUTCDate(d.getUTCDate() + offset);
  return iso(d);
};
const ehFimDeSemana = (ymd: string) => [0, 6].includes(new Date(ymd + "T12:00:00Z").getUTCDay());
// A mesma linha de corte do código (calendário): T e T−1 reservados.
const reservaCorte = dia(-1);

const DATAS = [dia(-4), dia(-3), dia(-2), dia(-1), dia(0)];

let escrito: GoldenSourceData | null = null;

vi.mock("@/lib/data-store", () => ({
  getDataStore: () => ({
    fetchTab: async (tab: string) => {
      if (tab !== "meus_ativos") return [];
      return [
        { "símbolo": "VOO", "moeda": "USD", "corretora": "IBKR", "data": "2025-01-10" },
        { "símbolo": "CMIG4.SA", "moeda": "BRL", "corretora": "B3", "data": "2025-01-10" },
      ];
    },
  }),
  getMarketDataStore: () => ({
    read: async (): Promise<GoldenSourceData> => ({
      tickers: ["VOO", "CMIG4.SA"],
      dates: [dia(-6)],
      prices: { [dia(-6)]: { "VOO": 500, "CMIG4.SA": 10 } },
    }),
    write: async (data: GoldenSourceData) => {
      escrito = data;
      return {
        mode: "append" as const,
        before: { dates: 1, points: 2, tickers: 2 },
        after: { dates: data.dates.length, points: 0, tickers: data.tickers.length },
      };
    },
  }),
}));

vi.mock("@/lib/market-history", () => ({
  fetchTicker: async (yt: string) => {
    // Yahoo devolve TODAS as datas para os dois ativos; FX/índices ficam vazios.
    if (yt !== "VOO" && yt !== "CMIG4.SA") return [];
    return DATAS.map((date, i) => ({ date, price: yt === "VOO" ? 510 + i : 11 + i }));
  },
}));

describe("runCotacoesSync — reserva IBKR sem perder qualidade", () => {
  it("reserva T/T−1 do ativo IBKR, mantém fallback em T−2 e não toca no resto", async () => {
    const { runCotacoesSync } = await import("@/lib/sync-cotacoes");
    const report = await runCotacoesSync("update");

    expect(escrito).not.toBeNull();
    const g = escrito!;

    for (const date of DATAS) {
      if (ehFimDeSemana(date)) {
        // guarda de fim de semana vale para os DOIS (nenhum é cripto)
        expect(g.prices[date]?.["CMIG4.SA"]).toBeUndefined();
        expect(g.prices[date]?.["VOO"]).toBeUndefined();
        continue;
      }
      // Ativo B3: comportamento IDÊNTICO ao de antes — toda data útil entra.
      expect(g.prices[date]?.["CMIG4.SA"]).toBeDefined();
      // Ativo IBKR: T/T−1 reservados p/ o mark oficial; ≤T−2 = fallback Yahoo.
      if (date >= reservaCorte) expect(g.prices[date]?.["VOO"]).toBeUndefined();
      else expect(g.prices[date]?.["VOO"]).toBeDefined();
    }

    // O que já existia segue bit a bit igual (nada apagado/mutado).
    expect(g.prices[dia(-6)]).toEqual({ "VOO": 500, "CMIG4.SA": 10 });
    // Relatório declara a reserva (auditoria no card Automações).
    const reservadas = DATAS.filter((d) => d >= reservaCorte && !ehFimDeSemana(d)).length;
    if (reservadas > 0) expect(report.ibkrReservados).toBeGreaterThanOrEqual(reservadas);
  });
});
