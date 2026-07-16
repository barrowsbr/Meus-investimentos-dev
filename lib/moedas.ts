// ─────────────────────────────────────────────────────────────────────────────
// Coleção de moedas (numismática) — modelo + parser do CSV exportado pelo
// CoinSnap. Módulo PURO (sem deps server-only): a página client importa tipos
// e helpers daqui; a escrita/leitura da aba `moedas_colecao` fica nas rotas.
// ─────────────────────────────────────────────────────────────────────────────

export const MOEDAS_TAB = "moedas_colecao";

export const MOEDAS_HEADERS = [
  "pais", "emissor", "denominacao", "assunto", "krause", "ano", "marca",
  "graduacao", "valor_brl", "composicao", "peso_metal_g", "derretimento_brl",
  "foto_anverso", "foto_reverso", "nota", "serie",
];

export interface Moeda {
  pais: string;
  emissor: string;
  denominacao: string;
  assunto: string;
  krause: string;
  ano: string;          // pode ser faixa ("1995-2003") — anoNum para ordenar
  anoNum: number | null;
  marca: string;
  graduacao: string;
  valorBrl: number;     // valor de catálogo (CoinSnap) por exemplar
  composicao: string;
  metal: string;        // categoria derivada da composição (filtro)
  pesoMetalG: number | null;      // gramas de metal FINO (prata) por exemplar
  derretimentoBrl: number | null; // melt do CSV (preço da prata na exportação)
  fotoAnverso: string;  // fotos do 1º exemplar (capa do card)
  fotoReverso: string;
  nota: string;
  serie: string;
  qtd: number;          // exemplares idênticos agrupados
  // CADA exemplar físico tem a própria foto (retrata o estado DAQUELA moeda —
  // nunca reaproveitar entre gêmeas; decisão do dono). fotos[0] = capa.
  fotos: Array<{ anverso: string; reverso: string }>;
}

// ── Graduação (escala numismática) ───────────────────────────────────────────

export const GRADUACOES = ["P", "AG", "G", "VG", "F", "VF", "XF", "AU", "MS", "UNC"] as const;

export const GRAD_LABEL: Record<string, string> = {
  P: "Poor (pobre)", AG: "About Good", G: "Good", VG: "Very Good", F: "Fine",
  VF: "Very Fine", XF: "Extremely Fine", AU: "About Uncirculated",
  MS: "Mint State", UNC: "Uncirculated (não circulada)",
};

// Tom do badge: quanto melhor o estado, mais "vivo".
export function gradTone(g: string): { bg: string; border: string; color: string } {
  const idx = GRADUACOES.indexOf(g as (typeof GRADUACOES)[number]);
  if (idx >= 7) return { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", color: "#34d399" }; // AU/MS/UNC
  if (idx >= 5) return { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", color: "#fbbf24" };  // VF/XF
  if (idx >= 0) return { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.15)", color: "#a1a1aa" };
  return { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", color: "#71717a" };
}

// ── Metal (categoria de filtro derivada da composição) ───────────────────────

export function metalDaComposicao(comp: string): string {
  const c = comp.toLowerCase();
  if (!c) return "Outros";
  if (c.startsWith("prata")) return "Prata";
  if (c.includes("banhado a prata") || c.includes("banhada a prata")) return "Banhada a prata";
  if (c.startsWith("bimet")) return "Bimetálica";
  if (c.includes("cupro-níquel") || c.includes("cupro-niquel")) return "Cupro-Níquel";
  if (c.includes("alumínio-bronze") || c.includes("aluminio-bronze")) return "Alumínio-Bronze";
  if (c.includes("aço")) return "Aço";
  if (c.includes("alumínio") || c.includes("aluminio")) return "Alumínio";
  if (c.includes("latão") || c.includes("latao")) return "Latão";
  if (c.includes("níquel") || c.includes("niquel")) return "Níquel";
  return "Outros";
}

// ── Conjunto monetário (padrão/sistema da moeda) ─────────────────────────────
// Agrupa a coleção por SISTEMA monetário. No Brasil, as nove eras oficiais
// (Réis → Cruzeiro 1942 → Cruzeiro Novo → Cruzeiro 1970 → Cruzado → Cruzado
// Novo → Cruzeiro 1990 → Cruzeiro Real → Real) — centavos são desambiguados
// pelo ANO, já que existiram em quase todas as eras. Fora do Brasil, a unidade
// monetária do país (Dólar canadense, Franco suíço, …).

export interface ConjuntoDef {
  nome: string;
  periodo?: string; // faixa de vigência (só eras BR)
  ordem: number;    // cronológica p/ BR; 50 = estrangeiras (ordenar por nome)
}

const F_ESTRANGEIRO: Record<string, (d: string, ano: number) => string> = {
  "Canadá": () => "Dólar canadense",
  "EUA": () => "Dólar americano",
  "Suíça": () => "Franco suíço",
  "França": (d, ano) => (d.includes("euro") || ano >= 2002 ? "Euro" : "Franco francês"),
  "Alemanha": (d, ano) =>
    d.includes("euro") || ano >= 2002 ? "Euro"
      : d.includes("reichsmark") || (ano > 0 && ano < 1949) ? "Reichsmark"
      : "Marco alemão",
  "Japão": () => "Iene japonês",
  "Hungria": () => "Florim húngaro",
  "Islândia": () => "Coroa islandesa",
  "Colômbia": () => "Peso colombiano",
  "Cuba": () => "Peso cubano",
  "Rússia": () => "Rublo russo",
  "Reino Unido": () => "Libra esterlina",
  "Argentina": () => "Peso argentino",
  "México": () => "Peso mexicano",
  "Portugal": (d, ano) => (d.includes("euro") || ano >= 2002 ? "Euro" : "Escudo português"),
  "Espanha": (d, ano) => (d.includes("euro") || ano >= 2002 ? "Euro" : "Peseta espanhola"),
  "Itália": (d, ano) => (d.includes("euro") || ano >= 2002 ? "Euro" : "Lira italiana"),
};

export function conjuntoMonetario(m: Pick<Moeda, "pais" | "denominacao" | "anoNum">): ConjuntoDef {
  const d = m.denominacao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const ano = m.anoNum ?? 0;

  if (m.pais === "Brasil") {
    if (/\breis\b/.test(d)) return { nome: "Réis", periodo: "até 1942", ordem: 1 };
    if (d.includes("cruzeiro real") || d.includes("cruzeiros reais")) return { nome: "Cruzeiro Real", periodo: "1993–1994", ordem: 8 };
    if (d.includes("cruzado novo") || d.includes("cruzados novos")) return { nome: "Cruzado Novo", periodo: "1989–1990", ordem: 6 };
    if (d.includes("cruzado")) return { nome: "Cruzado", periodo: "1986–1989", ordem: 5 };
    if (d.includes("cruzeiro")) {
      if (ano > 0 && ano <= 1967) return { nome: "Cruzeiro (1942–1967)", periodo: "1942–1967", ordem: 2 };
      if (ano > 0 && ano <= 1986) return { nome: "Cruzeiro (1970–1986)", periodo: "1970–1986", ordem: 4 };
      return { nome: "Cruzeiro (1990–1993)", periodo: "1990–1993", ordem: 7 };
    }
    if (/\bre(al|ais)\b/.test(d)) return { nome: "Real", periodo: "1994–", ordem: 9 };
    if (d.includes("centavo")) {
      // Centavo existiu em quase toda era — o ANO decide o padrão.
      if (ano >= 1994 || ano === 0) return { nome: "Real", periodo: "1994–", ordem: 9 };
      if (ano >= 1989) return { nome: "Cruzado Novo", periodo: "1989–1990", ordem: 6 };
      if (ano >= 1986) return { nome: "Cruzado", periodo: "1986–1989", ordem: 5 };
      if (ano >= 1971) return { nome: "Cruzeiro (1970–1986)", periodo: "1970–1986", ordem: 4 };
      if (ano >= 1967) return { nome: "Cruzeiro Novo", periodo: "1967–1970", ordem: 3 };
      return { nome: "Cruzeiro (1942–1967)", periodo: "1942–1967", ordem: 2 };
    }
    return { nome: "Brasil — outras", ordem: 20 };
  }

  const f = F_ESTRANGEIRO[m.pais];
  return { nome: f ? f(d, ano) : m.pais, ordem: 50 };
}

// ── Diâmetro físico (mm) — para o Pote com física em escala real ─────────────
// Medidas de catálogo das séries mais comuns; o que não estiver mapeado cai em
// heurística por valor de face e num default de 23 mm. Precisão de catálogo
// importa menos que a PROPORÇÃO entre as moedas (efeito visual do pote).

const DIAMETRO_REAL: Record<string, number> = {
  "1 centavo": 17.0, "5 centavos": 22.0, "10 centavos": 20.0,
  "25 centavos": 25.0, "50 centavos": 23.0, "1 real": 27.0,
};
const DIAMETRO_POR_ERA: Record<string, Record<string, number>> = {
  "Réis": { "100 reis": 21, "200 reis": 25, "300 reis": 22, "400 reis": 28, "500 reis": 22, "1000 reis": 26, "2000 reis": 26, "5000 reis": 25 },
  "Cruzeiro (1942–1967)": { "1 cruzeiro": 23, "5 cruzeiros": 24, "10 cruzeiros": 26, "20 cruzeiros": 27, "50 cruzeiros": 28, "1 centavo": 17, "10 centavos": 17, "20 centavos": 19, "50 centavos": 21 },
  "Cruzeiro Novo": { "1 centavo": 17, "2 centavos": 19, "5 centavos": 21, "10 centavos": 23, "20 centavos": 25, "50 centavos": 27 },
  "Cruzeiro (1970–1986)": { "1 centavo": 15.5, "2 centavos": 17.5, "5 centavos": 20, "10 centavos": 21, "20 centavos": 23, "50 centavos": 25, "1 cruzeiro": 21, "5 cruzeiros": 23, "10 cruzeiros": 24.5, "20 cruzeiros": 26, "50 cruzeiros": 28 },
  "Cruzado": { "1 centavo": 16.5, "5 centavos": 18.5, "10 centavos": 20.5, "20 centavos": 22, "50 centavos": 23.5, "1 cruzado": 20.5, "5 cruzados": 22, "10 cruzados": 23.5 },
  "Cruzado Novo": { "1 centavo": 15, "5 centavos": 16.5, "10 centavos": 18, "50 centavos": 21.5, "1 cruzado novo": 22.5 },
  "Cruzeiro (1990–1993)": { "1 cruzeiro": 13.5, "5 cruzeiros": 15.5, "10 cruzeiros": 17.5, "50 cruzeiros": 19.5, "100 cruzeiros": 21, "500 cruzeiros": 22.5, "1000 cruzeiros": 24 },
  "Cruzeiro Real": { "5 cruzeiros reais": 17.5, "10 cruzeiros reais": 19, "50 cruzeiros reais": 21.5, "100 cruzeiros reais": 23 },
  "Dólar canadense": { "1 cêntimo": 19.05, "5 cêntimos": 21.2, "10 cêntimos": 18.03, "25 cêntimos": 23.88, "50 cêntimos": 27.13, "1 dólar": 26.5, "2 dólares": 28 },
};

export function diametroMmDe(m: Pick<Moeda, "pais" | "denominacao" | "anoNum">): number {
  const den = m.denominacao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const era = conjuntoMonetario(m).nome;
  const daEra = DIAMETRO_POR_ERA[era]?.[den];
  if (daEra) return daEra;
  if (era === "Real" && DIAMETRO_REAL[den]) return DIAMETRO_REAL[den];
  // Heurística: valor de face maior → moeda maior (dentro de limites plausíveis)
  const valor = parseFloat(den.replace(",", ".")) || 1;
  if (valor >= 1000) return 26;
  if (valor >= 100) return 24;
  if (valor >= 20) return 24;
  if (valor >= 5) return 22;
  return 20;
}

// ── País → mapa/bandeira ─────────────────────────────────────────────────────
// COUNTRY_TO_ISO_NUM (lib/world-map) usa nomes curtos PT; o CoinSnap às vezes
// exporta o nome longo.
export const PAIS_ALIAS: Record<string, string> = {
  "Estados Unidos da América": "EUA",
  "Estados Unidos": "EUA",
  "Reino Unido da Grã-Bretanha": "Reino Unido",
  "República Tcheca": "Tchéquia",
  "Países Baixos": "Holanda",
};

export function paisCanonico(pais: string): string {
  return PAIS_ALIAS[pais] ?? pais;
}

// ── Parser do CSV do CoinSnap ────────────────────────────────────────────────

function parseCsvGrid(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) out.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) out.push(row);
  return out;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// header normalizado do CoinSnap → campo da aba
const COINSNAP_MAP: Record<string, string> = {
  "pais": "pais",
  "emissor": "emissor",
  "denominacao": "denominacao",
  "assunto": "assunto",
  "numero krause": "krause",
  "ano": "ano",
  "marca da casa da moeda": "marca",
  "graduacao": "graduacao",
  "valor, brl (coinsnap)": "valor_brl",
  "composicao": "composicao",
  "peso do metal precioso": "peso_metal_g",
  "valor de derretimento, brl": "derretimento_brl",
  "foto do anverso": "foto_anverso",
  "foto do reverso": "foto_reverso",
  "nota": "nota",
  "serie personalizada": "serie",
};

const numBrl = (v: string): string => {
  const n = parseFloat(v.replace(/brl/i, "").replace(",", ".").trim());
  return Number.isFinite(n) ? String(n) : "";
};

/** CSV do CoinSnap → linhas na ordem de MOEDAS_HEADERS. Lança em formato inválido. */
export function parseCoinSnapCsv(text: string): string[][] {
  const grid = parseCsvGrid(text);
  if (grid.length < 2) throw new Error("CSV vazio ou sem linhas de dados");
  const idx: Record<string, number> = {};
  grid[0].forEach((h, i) => {
    const campo = COINSNAP_MAP[norm(h)];
    if (campo && !(campo in idx)) idx[campo] = i;
  });
  if (idx["pais"] == null || idx["denominacao"] == null) {
    throw new Error("Não parece um export do CoinSnap (faltam colunas País/Denominação)");
  }
  const get = (r: string[], campo: string) => (idx[campo] != null ? (r[idx[campo]] ?? "").trim() : "");
  return grid.slice(1).map((r) => MOEDAS_HEADERS.map((campo) => {
    const raw = get(r, campo);
    if (campo === "valor_brl" || campo === "derretimento_brl") return numBrl(raw);
    if (campo === "peso_metal_g") return numBrl(raw);
    return raw;
  }));
}

// ── Linha da aba → Moeda (com agregação de exemplares idênticos) ─────────────

export function rowToMoeda(r: Record<string, unknown>): Omit<Moeda, "qtd" | "fotos"> | null {
  const s = (k: string) => String(r[k] ?? "").trim();
  const n = (k: string) => {
    const v = Number(String(r[k] ?? "").replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const denominacao = s("denominacao");
  if (!denominacao) return null;
  const ano = s("ano");
  const m = ano.match(/\d{4}/);
  const composicao = s("composicao");
  return {
    pais: paisCanonico(s("pais")),
    emissor: s("emissor"),
    denominacao,
    assunto: s("assunto"),
    krause: s("krause"),
    ano,
    anoNum: m ? Number(m[0]) : null,
    marca: s("marca"),
    graduacao: s("graduacao").toUpperCase(),
    valorBrl: n("valor_brl") ?? 0,
    composicao,
    metal: metalDaComposicao(composicao),
    pesoMetalG: n("peso_metal_g"),
    derretimentoBrl: n("derretimento_brl"),
    fotoAnverso: s("foto_anverso"),
    fotoReverso: s("foto_reverso"),
    nota: s("nota"),
    serie: s("serie"),
  };
}

/** Agrupa exemplares idênticos (mesma moeda comprada 2×) em 1 card com qtd —
 *  preservando as fotos de CADA exemplar (fotos[i] = i-ésimo exemplar). */
export function agruparMoedas(items: Array<Omit<Moeda, "qtd" | "fotos">>): Moeda[] {
  const map = new Map<string, Moeda>();
  for (const m of items) {
    const key = [m.krause || m.assunto, m.denominacao, m.ano, m.graduacao, m.pais].join("|");
    const foto = { anverso: m.fotoAnverso, reverso: m.fotoReverso };
    const ex = map.get(key);
    if (ex) {
      ex.qtd += 1;
      if (foto.anverso || foto.reverso) ex.fotos.push(foto);
    } else {
      map.set(key, { ...m, qtd: 1, fotos: [foto] });
    }
  }
  return [...map.values()];
}
