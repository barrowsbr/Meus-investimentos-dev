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
  // FIPE (resolução por BUSCA de nome — robusta a mudanças de código):
  marcaBusca: string;           // substring do nome da marca na FIPE
  modeloBusca: string[];        // TODOS os tokens precisam aparecer no modelo
  anoModelo: number;
  // Foto (Wikimedia Commons, via /api/bens/foto): termos em ordem de preferência
  fotoBusca: string[];
}

export const VEICULOS: BemVeiculo[] = [
  {
    id: "tcross",
    nome: "VW T-Cross Highline 250 TSI",
    detalhe: "2025 · Cinza",
    cor: "cinza",
    marcaBusca: "volkswagen",
    modeloBusca: ["t-cross", "highline"],
    anoModelo: 2025,
    fotoBusca: ["Volkswagen T-Cross facelift grey", "Volkswagen T-Cross 2024", "Volkswagen T-Cross facelift"],
  },
  {
    id: "onix",
    nome: "Chevrolet Onix Joy 1.0",
    detalhe: "2020 · Branco",
    cor: "branco",
    marcaBusca: "chevrolet",
    modeloBusca: ["onix", "hatch", "joy"],
    anoModelo: 2020,
    fotoBusca: ["Chevrolet Onix Joy white", "Chevrolet Onix Joy", "Chevrolet Onix hatch 2019"],
  },
];

export const bemPorId = (id: string): BemVeiculo | undefined => VEICULOS.find((v) => v.id === id);
