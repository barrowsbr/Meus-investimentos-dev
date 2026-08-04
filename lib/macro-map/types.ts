// Tipos do motor do Mapa de Transmissão Macro. Espelham o schema das regras
// (macro-map/schema/rule.schema.json) — a fonte única continua sendo o YAML;
// estes tipos descrevem a forma compilada (lib/macro-map/rules.generated.ts).

export type Familia = "energia" | "juros" | "fx" | "credito" | "brasil";
export type Direcao = "queda" | "alta";
export type Confianca = "alta" | "media" | "baixa";
export type Prontidao = "pronto" | "backfill" | "integrado" | "fonte_nova";

export interface Efeito {
  ativo: string;
  sinal: 1 | -1;
  defasagem_dias: [number, number];
  confianca: Confianca;
}

export interface Rule {
  id: string;
  version: number;
  familia: Familia;
  titulo: string;
  choque: { driver: string; metrica: string; direcao: Direcao; limiar_sigma: number };
  canal: string;
  efeitos: Efeito[];
  regime: { vale_quando: string; inverte_quando: string; proxy_de_regime: string };
  evidencia: { janela: string; metodo: string; taxa_acerto: number | null; n_eventos: number | null };
  falsificacao: string;
  relevancia_portfolio: string[];
}

export interface Driver {
  simbolo: string;
  nome: string;
  classe: string;
  fonte: string;
  simbolo_fonte: string;
  persistido: boolean;
  prontidao: Prontidao;
  nota: string;
}

// ── Saída do motor ───────────────────────────────────────────────────────────

// Estado do dia de uma regra. O produto são "anomalo" e "regime_rompido".
export type Estado =
  | "confirmado" // choque veio, efeito veio como esperado — baixa prioridade
  | "anomalo" // choque veio, efeito NÃO veio na janela — ALTA prioridade
  | "regime_rompido" // proxy de regime fora da faixa de validade — ALTA prioridade
  | "observando" // choque recente, mas a janela de defasagem ainda não decorreu
  | "quiescente" // sem choque relevante hoje
  | "sem_dados"; // driver/efeito indisponível (fonte ainda não integrada)

export interface EffectOutcome {
  ativo: string;
  esperado: 1 | -1;
  observado: -1 | 0 | 1;
  confirmado: boolean;
  retorno: number; // retorno realizado do efeito na janela observada
  confianca: Confianca;
}

export interface RuleEvaluation {
  id: string;
  titulo: string;
  familia: Familia;
  estado: Estado;
  disponivel: boolean; // false só quando falta o driver OU todos os efeitos
  driversFaltando: string[];
  efeitosNaoMedidos: string[]; // efeitos sem fonte (regra roda nos demais)
  choque: { driver: string; metrica: string; direcao: Direcao; limiar_sigma: number };
  choqueAtivo: boolean;
  ultimoChoque: { date: string; z60: number; z250: number } | null;
  // Último choque da série INTEIRA (mesmo fora da janela de "hoje") — mantém o
  // card informativo em dia calmo. primarioConfirmado: efeito primário veio?
  // (null = janela ainda não decorreu).
  ultimoChoqueGeral: { date: string; z60: number; z250: number; primarioConfirmado: boolean | null } | null;
  efeitos: EffectOutcome[];
  // taxa de concordância de sinal MEDIDA ao vivo na janela (a "métrica central").
  // Distinta da evidencia.taxa_acerto do YAML (essa é a priori/Fase 2 formal).
  taxaAcertoLive: number | null;
  nEventos: number;
  relevancia_portfolio: string[];
  canal: string;
  falsificacao: string;
}

export interface DivergenceReport {
  geradoEm: string; // ISO
  dataPregao: string | null; // último dia com dados
  avaliacoes: RuleEvaluation[];
  resumo: { anomalo: number; confirmado: number; observando: number; quiescente: number; semDados: number };
}
