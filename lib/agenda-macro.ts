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

// Detalhe de cada evento para o popup da Agenda: o que é, como ler o
// resultado e ONDE ver o número oficial assim que sai.
export interface FonteMacro { rotulo: string; href: string }
export interface InfoMacro { titulo: string; oQueE: string; comoLer: string; fontes: FonteMacro[] }

export const MACRO_INFO: Record<TipoMacro, InfoMacro> = {
  copom: {
    titulo: "Copom — decisão da Selic",
    oQueE: "O Comitê de Política Monetária do Banco Central se reúne por 2 dias e anuncia a nova taxa Selic no 2º dia, a partir das 18h30 (após o fechamento do mercado). O comunicado sai junto com a decisão; a ata, na terça-feira seguinte.",
    comoLer: "O que move o mercado é a decisão vs. o esperado (consenso do Focus) e o tom do comunicado — a sinalização dos próximos passos.",
    fontes: [
      { rotulo: "Comunicado oficial do Copom (BCB)", href: "https://www.bcb.gov.br/controleinflacao/comunicadoscopom" },
      { rotulo: "Taxa Selic vigente (BCB)", href: "https://www.bcb.gov.br/controleinflacao/taxaselic" },
      { rotulo: "Realizado × esperado (calendário do Investing)", href: "https://br.investing.com/economic-calendar/" },
    ],
  },
  fomc: {
    titulo: "FOMC — decisão de juros do Fed",
    oQueE: "O Federal Open Market Committee define a taxa dos fed funds. O statement sai às 14h de Washington (~15h em Brasília) e a coletiva do presidente do Fed começa meia hora depois. Nas reuniões de março, junho, setembro e dezembro saem também as projeções (dot plot).",
    comoLer: "Mercado reage à decisão vs. consenso, a mudanças no texto do statement e ao dot plot/coletiva.",
    fontes: [
      { rotulo: "Statement e projeções (calendário oficial do Fed)", href: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" },
      { rotulo: "Press releases do Fed", href: "https://www.federalreserve.gov/newsevents/pressreleases.htm" },
      { rotulo: "Realizado × esperado (calendário do Investing)", href: "https://br.investing.com/economic-calendar/" },
    ],
  },
  payroll: {
    titulo: "Payroll — emprego nos EUA",
    oQueE: "O relatório Employment Situation do BLS sai às 8h30 de Washington (9h30/10h30 em Brasília, conforme o horário de verão) com a criação de vagas fora do setor agrícola (nonfarm payrolls), a taxa de desemprego e o salário médio por hora.",
    comoLer: "O número que move o mercado é o de vagas criadas vs. consenso — junto com as revisões dos 2 meses anteriores e a variação dos salários (pressão inflacionária).",
    fontes: [
      { rotulo: "Release oficial (BLS — Employment Situation)", href: "https://www.bls.gov/news.release/empsit.nr0.htm" },
      { rotulo: "Arquivo de releases (BLS)", href: "https://www.bls.gov/bls/news-release/empsit.htm" },
      { rotulo: "Realizado × esperado (calendário do Investing)", href: "https://br.investing.com/economic-calendar/" },
    ],
  },
};

export const EVENTOS_MACRO: EventoMacro[] = [
  ...COPOM.map((date) => ({ date, tipo: "copom" as const, rotulo: "Copom", detalhe: "Decisão da Selic — a partir das 18h30" })),
  ...FOMC.map((date) => ({ date, tipo: "fomc" as const, rotulo: "FOMC", detalhe: "Decisão de juros do Fed — ~15h (BRT)" })),
  ...PAYROLL.map((date) => ({ date, tipo: "payroll" as const, rotulo: "Payroll", detalhe: "Emprego EUA (BLS) — 9h30/10h30 (BRT)" })),
].sort((a, b) => a.date.localeCompare(b.date));
