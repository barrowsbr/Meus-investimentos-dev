// Tipos do painel de Juros Futuros (Radar).

/** Um vértice da curva — um título do Tesouro com vencimento e taxa a.a. */
export interface Vertice {
  titulo: string;          // "Tesouro Prefixado 2029"
  indexador: "PREFIXADO" | "IPCA" | "SELIC";
  vencimento: string;      // ISO yyyy-mm-dd
  anos: number;            // prazo em anos até o vencimento (fração)
  taxa: number;            // taxa anual de COMPRA em % a.a. (ex.: 13.45)
  taxaResgate: number | null;
  precoUnitario: number | null;
  juroSemestral: boolean;  // NTN-F / NTN-B com cupom
}

/** Ponto da trajetória esperada da Selic (Focus, por reunião do Copom). */
export interface PontoSelic {
  reuniao: string;         // "R1/2027"
  data: string;            // data da coleta (ISO)
  mediana: number;         // % a.a.
  minimo: number | null;
  maximo: number | null;
}

/** Inflação implícita (breakeven) entre um par nominal × real de prazo próximo. */
export interface Breakeven {
  anos: number;
  vencimentoNominal: string;
  vencimentoReal: string;
  nominal: number;
  real: number;
  implicita: number;       // % a.a.
}

export interface AnaliseCurva {
  formato: "inclinada" | "plana" | "invertida";
  inclinacaoBps: number;      // (longo − curto) em pontos-base
  curto: Vertice | null;
  longo: Vertice | null;
  juroRealLongo: number | null;
  implicitaMedia: number | null;
  leitura: string;            // frase em português
}

export interface JurosResponse {
  geradoEm: string;
  fechamento: string | null;   // data de referência do Tesouro, se vier
  prefixados: Vertice[];
  reais: Vertice[];
  breakevens: Breakeven[];
  selicHoje: number | null;    // Selic meta (BCB SGS 432)
  trajetoriaSelic: PontoSelic[];
  analise: AnaliseCurva;
  avisos: string[];            // fontes que falharam (degradação honesta)
}
