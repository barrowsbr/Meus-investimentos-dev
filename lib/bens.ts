// ─────────────────────────────────────────────────────────────────────────────
// Bens físicos (fora do mercado) — carros, imóveis e itens de alto valor.
// Config ESTÁTICA (decisão do dono, como moedas-data): os veículos ficam aqui;
// o valor vem da tabela FIPE ao dia (API parallelum, livre) e a foto de um
// proxy server-side que busca no Wikimedia Commons (rede aberta só em prod).
// ─────────────────────────────────────────────────────────────────────────────

export interface BemVeiculo {
  id: string;
  nome: string;
  detalhe: string;              // ano · cor (como o dono descreve)
  cor: string;
  // FIPE — caminho 1 (preferido): código FIPE PINADO (consulta direta, sem
  // casamento de nome); caminho 2 (fallback): busca por nome.
  codigoFipe?: string;          // ex.: "005508-5"
  marcaBusca: string;           // substring do nome da marca na FIPE
  modeloBusca: string[];        // TODOS os tokens precisam aparecer no modelo
  anoModelo: number;
  // Foto: arquivo LOCAL (public/bens — fotos reais enviadas pelo dono, fundo
  // padronizado) tem prioridade; sem ele, o proxy /api/bens/foto busca no
  // Wikimedia Commons pelos termos abaixo.
  fotoLocal?: string;
  fotoBusca: string[];          // termos de busca, em ordem de preferência
  fotoRequer: string[];         // o TÍTULO do arquivo precisa conter TODOS (sem isso, ignora o resultado)
  fotoBonus: string[];          // pontos extras no ranking (ano, facelift, cor…)
  // Ficha técnica (specs públicas do modelo) — mostrada no popup de detalhes
  specs: Array<[string, string]>;
}

export const VEICULOS: BemVeiculo[] = [
  {
    id: "tcross",
    nome: "VW T-Cross Highline 250 TSI",
    detalhe: "2025 · Cinza",
    cor: "cinza",
    // FIPE grafa ABREVIADO: "T-Cross Hig. 250 TSI 1.4 Flex 16V 5p Aut."
    // ("highline" por extenso NUNCA casa — daí o código pinado + tokens "hig"/"250").
    codigoFipe: "005508-5",
    marcaBusca: "volkswagen",
    modeloBusca: ["t-cross", "hig", "250"],
    anoModelo: 2025,
    fotoLocal: "/bens/tcross.jpg",
    fotoBusca: ["Volkswagen T-Cross facelift", "Volkswagen T-Cross 2024", "Volkswagen T-Cross"],
    fotoRequer: ["t-cross"],
    fotoBonus: ["facelift", "2024", "2025", "grey", "gray", "grau", "silver"],
    specs: [
      ["Motor", "1.4 TSI turbo flex (250 TSI)"],
      ["Potência", "150 cv"],
      ["Torque", "25,5 kgfm (250 Nm)"],
      ["Câmbio", "Automático de 6 marchas"],
      ["Tração", "Dianteira"],
      ["Porta-malas", "373 L"],
      ["Tanque", "52 L"],
      ["Lugares", "5"],
    ],
  },
  {
    id: "onix",
    nome: "Chevrolet Onix Joy 1.0",
    detalhe: "2020 · Branco",
    cor: "branco",
    marcaBusca: "chevrolet",
    modeloBusca: ["onix", "hatch", "joy"],
    anoModelo: 2020,
    fotoLocal: "/bens/onix.jpg",
    fotoBusca: ["Chevrolet Onix Joy", "Chevrolet Onix 2019", "Chevrolet Onix hatch"],
    fotoRequer: ["onix"],
    fotoBonus: ["joy", "white", "branco", "2019", "2020", "hatch"],
    specs: [
      ["Motor", "1.0 8V SPE/4 flex"],
      ["Potência", "80 cv (etanol)"],
      ["Torque", "9,8 kgfm"],
      ["Câmbio", "Manual de 5 marchas"],
      ["Tração", "Dianteira"],
      ["Porta-malas", "280 L"],
      ["Tanque", "54 L"],
      ["Lugares", "5"],
    ],
  },
];

export const bemPorId = (id: string): BemVeiculo | undefined => VEICULOS.find((v) => v.id === id);

// Divisão de bens (decisão do dono, 31/07): tudo é do casal — a visão DESTE app
// é a do dono, então a parte que entra no PATRIMÔNIO é metade do valor de tabela.
export const FRACAO_BENS = 0.5;
