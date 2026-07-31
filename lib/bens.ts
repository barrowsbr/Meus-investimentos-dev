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
  // Foto (Wikimedia Commons, via /api/bens/foto):
  fotoBusca: string[];          // termos de busca, em ordem de preferência
  fotoRequer: string[];         // o TÍTULO do arquivo precisa conter TODOS (sem isso, ignora o resultado)
  fotoBonus: string[];          // pontos extras no ranking (ano, facelift, cor…)
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
    fotoBusca: ["Volkswagen T-Cross facelift", "Volkswagen T-Cross 2024", "Volkswagen T-Cross"],
    fotoRequer: ["t-cross"],
    fotoBonus: ["facelift", "2024", "2025", "grey", "gray", "grau", "silver"],
  },
  {
    id: "onix",
    nome: "Chevrolet Onix Joy 1.0",
    detalhe: "2020 · Branco",
    cor: "branco",
    marcaBusca: "chevrolet",
    modeloBusca: ["onix", "hatch", "joy"],
    anoModelo: 2020,
    fotoBusca: ["Chevrolet Onix Joy", "Chevrolet Onix 2019", "Chevrolet Onix hatch"],
    fotoRequer: ["onix"],
    fotoBonus: ["joy", "white", "branco", "2019", "2020", "hatch"],
  },
];

export const bemPorId = (id: string): BemVeiculo | undefined => VEICULOS.find((v) => v.id === id);
