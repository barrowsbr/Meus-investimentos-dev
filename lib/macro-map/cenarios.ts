// Aba "E se?" da Transmissão Macro — agrupa as avaliações POR EVENTO
// (driver + direção) para responder "estourou a notícia X → o que segue?".
// Módulo PURO (client-safe, sem deps): recebe o relatório pronto e devolve os
// cenários. Regra de honestidade: cenário NATIVO usa só regras medidas naquela
// direção; a direção sem regra própria vira cenário ESPELHADO (efeitos com o
// sinal invertido) e carrega a marca `espelhado` — leitura assumida por
// simetria, nunca apresentada como histórico medido.

import type { RuleEvaluation, Direcao, Confianca } from "./types";

export interface CenarioEfeito {
  ativo: string;
  sinal: 1 | -1; // já na direção do CENÁRIO (invertido quando espelhado)
  defasagem_dias: [number, number];
  confianca: Confianca;
  regraId: string;
  taxaAcerto: number | null; // da regra de origem (medida na direção nativa)
  nEventos: number;
  espelhado: boolean;
}

export interface Cenario {
  key: string; // `${driver}|${direcao}`
  driver: string;
  direcao: Direcao;
  titulo: string;
  exemplos: string; // gatilhos do mundo real ("guerra no Golfo · OPEP corta")
  espelhado: boolean; // true = TODO o cenário vem de espelho
  // Distância do gatilho HOJE: max( z_na_direção / limiar ) entre as regras
  // do driver. ≥1 = já disparou; null quando nenhum z atual disponível.
  proximidade: number | null;
  zRef: { z60: number; limiar: number } | null; // o par que definiu a proximidade
  efeitos: CenarioEfeito[];
  carteira: string[]; // união de relevancia_portfolio
  ultimoEpisodio: { date: string; veio: boolean | null } | null; // só nativo
}

// ── títulos e gatilhos de manchete, por driver·direção ───────────────────────

const ROTULO: Record<string, { titulo: string; exemplos: string }> = {
  "BRENT|queda": { titulo: "Petróleo despenca", exemplos: "OPEP eleva oferta · demanda global fraca · acordo de paz" },
  "BRENT|alta": { titulo: "Petróleo dispara", exemplos: "guerra no Golfo · OPEP corta · sanções a produtor" },
  "VIX|alta": { titulo: "VIX explode (pânico)", exemplos: "crash · evento sistêmico · escalada militar" },
  "VIX|queda": { titulo: "VIX comprimido (complacência)", exemplos: "calmaria longa com mercado subindo estreito" },
  "DXY|alta": { titulo: "Dólar global sobe forte", exemplos: "Fed hawkish · fuga para o dólar" },
  "DXY|queda": { titulo: "Dólar global cede", exemplos: "Fed dovish · apetite por risco volta" },
  "USDBRL|alta": { titulo: "Real derrete", exemplos: "ruído fiscal/eleitoral · sanções · saída de fluxo" },
  "USDBRL|queda": { titulo: "Real se valoriza", exemplos: "alívio fiscal · entrada de fluxo · carry atrativo" },
  "HY_SPREAD|alta": { titulo: "Spread de crédito abre", exemplos: "calote corporativo · aperto de financiamento" },
  "HY_SPREAD|queda": { titulo: "Crédito acalma", exemplos: "spreads comprimindo · apetite por risco corporativo" },
  "US10Y_REAL|alta": { titulo: "Juro real americano sobe", exemplos: "Fed aperta · term premium abre" },
  "US10Y_REAL|queda": { titulo: "Juro real americano cede", exemplos: "Fed sinaliza corte · flight to quality" },
  "US_CURVE|alta": { titulo: "Curva desinverte rápido", exemplos: "mercado precifica cortes — fim de ciclo" },
  "US_CURVE|queda": { titulo: "Curva achata/inverte", exemplos: "aperto na ponta curta · medo de recessão à frente" },
  "US02Y|queda": { titulo: "Ponta curta cede", exemplos: "Fed sinaliza alívio · payroll fraco" },
  "US02Y|alta": { titulo: "Ponta curta sobe", exemplos: "inflação surpreende · Fed hawkish" },
  "GOLD|alta": { titulo: "Ouro dispara", exemplos: "medo geopolítico · busca por proteção" },
  "GOLD|queda": { titulo: "Ouro cede", exemplos: "juro real sobe · apetite por risco" },
  "SELIC_EXP|queda": { titulo: "Focus corta Selic", exemplos: "expectativa de ciclo de corte no Copom" },
  "SELIC_EXP|alta": { titulo: "Focus sobe Selic", exemplos: "inflação/fiscal piora · Copom hawkish" },
  "SPX|queda": { titulo: "S&P despenca", exemplos: "risk-off global · resultado ruim das big techs" },
  "SPX|alta": { titulo: "S&P dispara", exemplos: "risk-on global · dados fortes" },
  "BR_RISK_PREMIUM|alta": { titulo: "Choque de risco Brasil", exemplos: "fiscal · eleição · sanções — real e juro longo juntos" },
  "BR_RISK_PREMIUM|queda": { titulo: "Alívio de risco Brasil", exemplos: "âncora fiscal · fluxo comprador de Brasil" },
};

const inversa = (d: Direcao): Direcao => (d === "alta" ? "queda" : "alta");

// Proximidade do gatilho na direção do cenário: z positivo conta para "alta",
// negativo para "queda". Clampa em [0, 1.5] para a barra não explodir.
function proximidadeDe(avs: RuleEvaluation[], direcao: Direcao): { prox: number | null; zRef: Cenario["zRef"] } {
  let melhor: number | null = null;
  let zRef: Cenario["zRef"] = null;
  for (const a of avs) {
    if (!a.zAtual) continue;
    const naDirecao = direcao === "alta" ? a.zAtual.z60 : -a.zAtual.z60;
    const p = Math.max(0, naDirecao) / a.choque.limiar_sigma;
    if (melhor == null || p > melhor) {
      melhor = p;
      zRef = { z60: a.zAtual.z60, limiar: a.choque.limiar_sigma };
    }
  }
  return { prox: melhor == null ? null : Math.min(melhor, 1.5), zRef };
}

function montar(key: string, driver: string, direcao: Direcao, fontes: RuleEvaluation[], espelhado: boolean): Cenario {
  const rotulo = ROTULO[key] ?? { titulo: `${driver} ${direcao}`, exemplos: "" };
  const efeitos: CenarioEfeito[] = [];
  const carteira = new Set<string>();
  let ultimo: Cenario["ultimoEpisodio"] = null;

  for (const a of fontes) {
    for (const e of a.efeitosEsperados ?? []) {
      efeitos.push({
        ativo: e.ativo,
        sinal: (espelhado ? -e.sinal : e.sinal) as 1 | -1,
        defasagem_dias: e.defasagem_dias,
        confianca: e.confianca,
        regraId: a.id,
        taxaAcerto: a.taxaAcertoLive,
        nEventos: a.nEventos,
        espelhado,
      });
    }
    for (const t of a.relevancia_portfolio) carteira.add(t);
    if (!espelhado && a.ultimoChoqueGeral && (!ultimo || a.ultimoChoqueGeral.date > ultimo.date)) {
      ultimo = { date: a.ultimoChoqueGeral.date, veio: a.ultimoChoqueGeral.primarioConfirmado };
    }
  }

  // Dedup por ativo: mantém o efeito da regra com melhor histórico (taxa × n).
  const porAtivo = new Map<string, CenarioEfeito>();
  for (const e of efeitos) {
    const atual = porAtivo.get(e.ativo);
    const score = (x: CenarioEfeito) => (x.taxaAcerto ?? 0) * Math.min(x.nEventos, 30);
    if (!atual || score(e) > score(atual)) porAtivo.set(e.ativo, e);
  }

  // O z da métrica é o mesmo nas duas direções — a proximidade é sempre medida
  // na direção DO CENÁRIO (espelhado incluso).
  const { prox, zRef } = proximidadeDe(fontes, direcao);
  return {
    key, driver, direcao,
    titulo: rotulo.titulo, exemplos: rotulo.exemplos,
    espelhado,
    proximidade: prox, zRef,
    efeitos: [...porAtivo.values()].sort((a, b) => (b.taxaAcerto ?? 0) - (a.taxaAcerto ?? 0)),
    carteira: [...carteira].sort(),
    ultimoEpisodio: ultimo,
  };
}

/** Constrói os cenários: nativos primeiro (por proximidade desc), espelhados depois. */
export function construirCenarios(avaliacoes: RuleEvaluation[]): { nativos: Cenario[]; espelhados: Cenario[] } {
  const disponiveis = avaliacoes.filter((a) => a.disponivel && (a.efeitosEsperados?.length ?? 0) > 0);
  const porChave = new Map<string, RuleEvaluation[]>();
  for (const a of disponiveis) {
    const k = `${a.choque.driver}|${a.choque.direcao}`;
    porChave.set(k, [...(porChave.get(k) ?? []), a]);
  }

  const nativos: Cenario[] = [];
  const espelhados: Cenario[] = [];
  const drivers = new Set(disponiveis.map((a) => a.choque.driver));

  for (const driver of drivers) {
    for (const direcao of ["alta", "queda"] as Direcao[]) {
      const key = `${driver}|${direcao}`;
      const nativas = porChave.get(key);
      if (nativas?.length) {
        nativos.push(montar(key, driver, direcao, nativas, false));
        continue;
      }
      const opostas = porChave.get(`${driver}|${inversa(direcao)}`);
      if (opostas?.length) espelhados.push(montar(key, driver, direcao, opostas, true));
    }
  }

  const ord = (a: Cenario, b: Cenario) => (b.proximidade ?? -1) - (a.proximidade ?? -1);
  return { nativos: nativos.sort(ord), espelhados: espelhados.sort(ord) };
}
