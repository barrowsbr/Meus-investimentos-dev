// ─────────────────────────────────────────────────────────────────────────────
// Numista (api.numista.com v3) — módulo SERVER-ONLY compartilhado:
//  • casamento moeda da coleção → tipo do catálogo (N#), com validação por
//    KM# exato ou país+ano (mesma lógica do dossiê — dado certo ou nada);
//  • OAuth client_credentials (acessa a conta do DONO da NUMISTA_API_KEY,
//    sem fluxo de navegador) para ler/escrever a coleção;
//  • collected_items: adicionar (com "para troca") e remover.
// Regra do dono (18/07): repetidas vão marcadas PARA TROCA — 1 exemplar
// guardado + (qtd−1) disponíveis para troca. Nada é enviado sem o dry-run
// aprovado no card de Configurações.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://api.numista.com/api/v3";

function key(): string | null {
  return process.env.NUMISTA_API_KEY || null;
}

async function chamada(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const k = key();
  if (!k) return { ok: false, status: 0, data: null };
  // 429 (rate-limit): 1 retry CURTO. Backoff longo aqui já derrubou o dry-run
  // inteiro por timeout do serverless — quando a cota do dia acaba, o certo é
  // falhar rápido e AVISAR (rateLimitAtingido), não esperar.
  for (let tentativa = 0; ; tentativa++) {
    try {
      const r = await fetch(`${BASE}${path}`, {
        method: opts.method ?? "GET",
        headers: {
          "Numista-API-Key": k,
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      if (r.status === 429 && tentativa < 1) {
        await new Promise((res) => setTimeout(res, 1200));
        continue;
      }
      if (r.status === 429) flag429 = true;
      const data = r.status === 204 ? {} : ((await r.json().catch(() => null)) as Record<string, unknown> | null);
      return { ok: r.ok, status: r.status, data };
    } catch {
      if (tentativa < 1) { await new Promise((res) => setTimeout(res, 800)); continue; }
      return { ok: false, status: 0, data: null };
    }
  }
}

// Sinaliza cota estourada no ciclo corrente (lido/zerado por casarMoeda).
let flag429 = false;

const norm = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// Nome PT (coleção) → inglês (a busca do Numista rende mais em EN).
const PAIS_EN: Record<string, string> = {
  "Brasil": "Brazil", "Alemanha": "Germany", "Hungria": "Hungary", "Rússia": "Russia",
  "Cuba": "Cuba", "Japão": "Japan", "Suíça": "Switzerland", "Canadá": "Canada",
  "Colômbia": "Colombia", "França": "France", "Islândia": "Iceland", "EUA": "United States",
  "Estados Unidos da América": "United States", "Reino Unido": "United Kingdom",
  "Portugal": "Portugal", "Espanha": "Spain", "Itália": "Italy", "Argentina": "Argentina",
  "México": "Mexico", "China": "China", "Polônia": "Poland", "Tchéquia": "Czech Republic",
  "República Tcheca": "Czech Republic", "Bulgária": "Bulgaria", "Romênia": "Romania",
  "Ucrânia": "Ukraine", "Áustria": "Austria", "Bélgica": "Belgium", "Paraguai": "Paraguay",
  "Uruguai": "Uruguay", "Chile": "Chile", "Peru": "Peru", "Bolívia": "Bolivia",
  "Panamá": "Panama", "Guiana": "Guyana", "Aruba": "Aruba", "Trinidad e Tobago": "Trinidad and Tobago",
  "África do Sul": "South Africa", "Nova Zelândia": "New Zealand", "Austrália": "Australia",
  "Indonésia": "Indonesia", "Malásia": "Malaysia", "Tailândia": "Thailand", "Singapura": "Singapore",
  "Hong Kong": "Hong Kong", "Turquia": "Turkey", "Sérvia": "Serbia", "Albânia": "Albania",
  "Macedônia do Norte": "North Macedonia", "Bósnia e Herzegovina": "Bosnia and Herzegovina",
  "Egito": "Egypt",
};

export interface MoedaParaCasar {
  idx: number;          // índice em MOEDAS_COLECAO (identidade estável do run)
  denominacao: string;
  pais: string;
  ano: string;
  krause: string;
  graduacao: string;
  qtd: number;
}

export interface Casamento {
  idx: number;
  denominacao: string;
  pais: string;
  ano: string;
  krause: string;
  graduacao: string;
  qtd: number;
  typeId: number | null;
  issueId: number | null;   // issue do ANO exato (null = tipo sem o ano listado)
  titulo: string | null;
  url: string | null;
  confianca: "km" | "pais-ano" | "nenhuma";
  // Detector de data errada (o CoinSnap às vezes lê o ano errado na foto):
  // casou pelo KM# mas o ano da ficha está FORA da faixa de emissão do tipo.
  anoSuspeito?: boolean;
  faixaAnos?: string | null;
  // Cota da API estourada durante ESTA moeda — "nenhuma" não é veredito.
  rateLimit?: boolean;
}

/** Casa UMA moeda com o catálogo. Sequencial e best-effort — quem chama controla o lote.
 *  A issue do ano NÃO é resolvida aqui (economia de chamadas no dry-run em
 *  massa) — o envio resolve com resolverIssue() só para as aprovadas. */
export async function casarMoeda(m: MoedaParaCasar): Promise<Casamento> {
  flag429 = false;
  const nulo: Casamento = { ...m, typeId: null, issueId: null, titulo: null, url: null, confianca: "nenhuma" };
  const paisEn = PAIS_EN[m.pais] ?? m.pais;
  const kmNum = m.krause ? norm(m.krause.replace(/km#?/i, "")) : "";
  const anoNum = Number(m.ano.slice(0, 4)) || null;

  // Denominação com símbolo (¼ dólar) rende pouco na busca — versão por extenso ajuda.
  const denomBusca = m.denominacao.replace("¼", "quarter").replace("½", "half");
  const consultas = [
    m.krause ? `${m.krause} ${paisEn}` : "",
    kmNum ? `${kmNum} ${paisEn} ${denomBusca}` : "", // sem o prefixo "KM#" — o índice do Numista prefere
    `${denomBusca} ${paisEn} ${m.ano.slice(0, 4)}`.trim(),
  ].filter(Boolean);

  const vistos = new Set<number>();
  const candidatos: number[] = [];
  for (const q of consultas) {
    const busca = await chamada(`/types?q=${encodeURIComponent(q)}&count=6&lang=pt&category=coin`);
    for (const t of (busca.data?.["types"] ?? []) as Array<{ id?: number }>) {
      if (t.id && !vistos.has(t.id)) { vistos.add(t.id); candidatos.push(t.id); }
    }
    if (candidatos.length >= 6) break;
  }
  if (candidatos.length === 0) return { ...nulo, rateLimit: flag429 };

  let det: Record<string, unknown> | null = null;
  let id: number | null = null;
  let confianca: Casamento["confianca"] = "nenhuma";
  let fallback: { det: Record<string, unknown>; id: number } | null = null;
  for (const cand of candidatos.slice(0, 4)) {
    const d = (await chamada(`/types/${cand}?lang=pt`)).data;
    if (!d) continue;
    const refs = (d["references"] ?? []) as Array<{ catalogue?: { code?: string }; number?: string }>;
    const kmOk = !!kmNum && refs.some(
      (r) => (r.catalogue?.code ?? "").toUpperCase() === "KM" && norm(String(r.number ?? "")) === kmNum,
    );
    const minY = Number(d["min_year"]) || null;
    const maxY = Number(d["max_year"]) || minY;
    const anoOk = anoNum != null && minY != null && anoNum >= minY && anoNum <= (maxY ?? minY);
    const emissor = norm(String((d["issuer"] as Record<string, unknown>)?.["name"] ?? ""));
    const paisOk = !!emissor && (emissor.includes(norm(m.pais)) || emissor.includes(norm(paisEn)));
    if (kmOk && (paisOk || anoOk)) { det = d; id = cand; confianca = "km"; break; }
    if (!kmNum && paisOk && anoOk && !fallback) fallback = { det: d, id: cand };
  }
  if (!det && fallback) { det = fallback.det; id = fallback.id; confianca = "pais-ano"; }
  if (!det || id == null) return { ...nulo, rateLimit: flag429 };

  const minY = Number(det["min_year"]) || null;
  const maxY = Number(det["max_year"]) || minY;
  const anoSuspeito = confianca === "km" && anoNum != null && minY != null &&
    (anoNum < minY || anoNum > (maxY ?? minY));

  return {
    ...m,
    typeId: id,
    issueId: null, // resolvida no envio (resolverIssue) — dry-run mais leve
    titulo: typeof det["title"] === "string" ? (det["title"] as string) : null,
    url: typeof det["url"] === "string" ? (det["url"] as string) : `https://pt.numista.com/catalogue/pieces${id}.html`,
    confianca,
    anoSuspeito,
    faixaAnos: minY != null ? `${minY}${maxY && maxY !== minY ? `–${maxY}` : ""}` : null,
  };
}

/** Issue (emissão) do ANO exato de um tipo — amarra o item ao ano certo no envio. */
export async function resolverIssue(typeId: number, ano: string): Promise<number | null> {
  const issues = (await chamada(`/types/${typeId}/issues?lang=pt`)).data;
  if (!Array.isArray(issues)) return null;
  const doAno = (issues as Array<{ id?: number; year?: number }>).filter(
    (i) => String(i.year ?? "") === ano.slice(0, 4),
  );
  return doAno[0]?.id ?? null;
}

// ── OAuth (client_credentials — conta do dono da chave) ──────────────────────

export async function tokenColecao(): Promise<{ token: string; userId: number } | { erro: string }> {
  const r = await chamada(`/oauth_token?grant_type=client_credentials&scope=view_collection,edit_collection`);
  if (!r.ok || !r.data) {
    return { erro: `OAuth falhou (HTTP ${r.status}) — confira se a chave Numista permite o escopo de edição de coleção nas configurações de API do site.` };
  }
  const token = String(r.data["access_token"] ?? "");
  const userId = Number(r.data["user_id"]);
  if (!token || !Number.isFinite(userId)) return { erro: "OAuth sem access_token/user_id na resposta" };
  return { token, userId };
}

// ── Itens da coleção ─────────────────────────────────────────────────────────

// Nossa graduação → escala do Numista (g/vg/f/vf/xf/au/unc).
const GRADE_NUMISTA: Record<string, string> = {
  G: "g", VG: "vg", F: "f", VF: "vf", XF: "xf", AU: "au", MS: "unc", UNC: "unc",
};

export interface NovoItem {
  typeId: number;
  issueId: number | null;
  quantidade: number;
  graduacao: string;    // nossa escala; convertida aqui
  paraTroca: boolean;
  comentario: string;
}

export async function adicionarItem(
  token: string, userId: number, item: NovoItem,
): Promise<{ itemId: number } | { erro: string }> {
  const body: Record<string, unknown> = {
    type: item.typeId,
    quantity: item.quantidade,
    for_swap: item.paraTroca,
    private_comment: item.comentario,
  };
  if (item.issueId != null) body["issue"] = item.issueId;
  const grade = GRADE_NUMISTA[item.graduacao.toUpperCase()];
  if (grade) body["grade"] = grade;

  const r = await chamada(`/users/${userId}/collected_items`, { method: "POST", token, body });
  if (!r.ok || !r.data) return { erro: `POST collected_items HTTP ${r.status}: ${JSON.stringify(r.data ?? {}).slice(0, 160)}` };
  const itemId = Number(r.data["id"]);
  if (!Number.isFinite(itemId)) return { erro: "resposta sem id do item" };
  return { itemId };
}

export async function removerItem(token: string, userId: number, itemId: number): Promise<boolean> {
  const r = await chamada(`/users/${userId}/collected_items/${itemId}`, { method: "DELETE", token });
  return r.ok || r.status === 404; // 404 = já não existe, missão cumprida
}

export function numistaAtivo(): boolean {
  return !!key();
}
