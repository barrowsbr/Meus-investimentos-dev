// Eventos macro FIXOS da página Agenda — só os que movem o mercado mundial
// (pedido do dono 12/08/2026): decisão de juros do Copom (Selic), do FOMC
// (Fed funds) e o Payroll americano. Client-safe, sem deps.
//
// Datas OFICIAIS, verificadas em 12/08/2026:
//  • FOMC 2026/2027: federalreserve.gov/monetarypolicy/fomccalendars.htm
//    (lido direto da página via runner; decisão no 2º dia, ~15h BRT)
//  • Copom 2026/2027: comunicados do BC (via imprensa — o site do BCB é SPA
//    sem endpoint público estável); decisão no 2º dia, a partir das 18h30
//  • Payroll 2026: BLS Employment Situation, sextas 8h30 ET (9h30/10h30 BRT);
//    releases de jan–abr/2026 saíram em datas irregulares (lapse) e ficaram
//    de fora — só entram datas confirmadas
// Quando os calendários dos anos seguintes saírem: acrescentar aqui.

export type TipoMacro = "copom" | "fomc" | "payroll";
export interface EventoMacro {
  date: string; // YYYY-MM-DD
  tipo: TipoMacro;
  rotulo: string;  // curto, vira o "ticker" na lista
  detalhe: string; // linha de apoio
}

const COPOM = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-08-05", "2026-09-16", "2026-11-04", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-16", "2027-08-04", "2027-09-22", "2027-10-27", "2027-12-08",
];

const FOMC = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
];

const PAYROLL = [
  "2026-05-08", "2026-06-05", "2026-07-02", "2026-08-07", "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04",
];

export const EVENTOS_MACRO: EventoMacro[] = [
  ...COPOM.map((date) => ({ date, tipo: "copom" as const, rotulo: "Copom", detalhe: "Decisão da Selic — a partir das 18h30" })),
  ...FOMC.map((date) => ({ date, tipo: "fomc" as const, rotulo: "FOMC", detalhe: "Decisão de juros do Fed — ~15h (BRT)" })),
  ...PAYROLL.map((date) => ({ date, tipo: "payroll" as const, rotulo: "Payroll", detalhe: "Emprego EUA (BLS) — 9h30/10h30 (BRT)" })),
].sort((a, b) => a.date.localeCompare(b.date));
