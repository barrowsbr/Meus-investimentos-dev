// Países do índice mundo (nomes como vêm no arquivo da SSGA) → nome PT +
// bandeira emoji (via código ISO-3166). Módulo PURO — usado por linha, card e
// painel de grupos do ETF Cem.

const PAISES: Record<string, { pt: string; iso: string }> = {
  "United States": { pt: "EUA", iso: "US" },
  "Japan": { pt: "Japão", iso: "JP" },
  "United Kingdom": { pt: "Reino Unido", iso: "GB" },
  "Canada": { pt: "Canadá", iso: "CA" },
  "France": { pt: "França", iso: "FR" },
  "Germany": { pt: "Alemanha", iso: "DE" },
  "Switzerland": { pt: "Suíça", iso: "CH" },
  "Australia": { pt: "Austrália", iso: "AU" },
  "Taiwan": { pt: "Taiwan", iso: "TW" },
  "China": { pt: "China", iso: "CN" },
  "South Korea": { pt: "Coreia do Sul", iso: "KR" },
  "Korea": { pt: "Coreia do Sul", iso: "KR" },
  "India": { pt: "Índia", iso: "IN" },
  "Netherlands": { pt: "Holanda", iso: "NL" },
  "Spain": { pt: "Espanha", iso: "ES" },
  "Italy": { pt: "Itália", iso: "IT" },
  "Sweden": { pt: "Suécia", iso: "SE" },
  "Denmark": { pt: "Dinamarca", iso: "DK" },
  "Brazil": { pt: "Brasil", iso: "BR" },
  "Hong Kong": { pt: "Hong Kong", iso: "HK" },
  "Singapore": { pt: "Singapura", iso: "SG" },
  "Saudi Arabia": { pt: "Arábia Saudita", iso: "SA" },
  "Norway": { pt: "Noruega", iso: "NO" },
  "Finland": { pt: "Finlândia", iso: "FI" },
  "Belgium": { pt: "Bélgica", iso: "BE" },
  "Ireland": { pt: "Irlanda", iso: "IE" },
  "Israel": { pt: "Israel", iso: "IL" },
  "Mexico": { pt: "México", iso: "MX" },
  "Indonesia": { pt: "Indonésia", iso: "ID" },
  "Thailand": { pt: "Tailândia", iso: "TH" },
  "Malaysia": { pt: "Malásia", iso: "MY" },
  "South Africa": { pt: "África do Sul", iso: "ZA" },
  "United Arab Emirates": { pt: "Emirados Árabes", iso: "AE" },
  "Qatar": { pt: "Catar", iso: "QA" },
  "Kuwait": { pt: "Kuwait", iso: "KW" },
  "Poland": { pt: "Polônia", iso: "PL" },
  "Turkey": { pt: "Turquia", iso: "TR" },
  "Chile": { pt: "Chile", iso: "CL" },
  "Peru": { pt: "Peru", iso: "PE" },
  "Colombia": { pt: "Colômbia", iso: "CO" },
  "Philippines": { pt: "Filipinas", iso: "PH" },
  "New Zealand": { pt: "Nova Zelândia", iso: "NZ" },
  "Austria": { pt: "Áustria", iso: "AT" },
  "Portugal": { pt: "Portugal", iso: "PT" },
  "Greece": { pt: "Grécia", iso: "GR" },
  "Hungary": { pt: "Hungria", iso: "HU" },
  "Czech Republic": { pt: "Tchéquia", iso: "CZ" },
  "Egypt": { pt: "Egito", iso: "EG" },
  "Macau": { pt: "Macau", iso: "MO" },
};

export function nomePais(pais: string): string {
  return PAISES[pais]?.pt ?? pais;
}

/** Bandeira emoji a partir do ISO-3166 (regional indicators); "" se desconhecido. */
export function bandeiraPais(pais: string): string {
  const iso = PAISES[pais]?.iso;
  if (!iso) return "";
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
