// ─────────────────────────────────────────────────────────────────────────────
// Evolução patrimonial — parser da aba lb_historic (formato LARGO/pivot):
//   linhas = contas (ex.: "Nu Lucas", "Xp Maria"); colunas = anos; + linha "Total".
// Produz séries por ano, por conta, e agregações por tipo / pessoa / instituição.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

export interface ContaPatrimonio {
  nome: string;
  instituicao: string;
  pessoa: string;
  tipo: "Banco/Caixa" | "Investimentos BR" | "Exterior" | "Cripto" | "Outros";
  valores: Record<string, number>; // ano → valor BRL
}

export interface EvolucaoPatrimonio {
  anos: string[];
  totalPorAno: { ano: string; valor: number }[];
  contas: ContaPatrimonio[];
  porTipo: Record<string, Record<string, number>>;        // ano → tipo → valor
  porPessoa: Record<string, Record<string, number>>;      // ano → pessoa → valor
  porInstituicao: Record<string, Record<string, number>>; // ano → instituição → valor
}

function parseBRL(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim();
  if (!s) return 0;
  s = s.replace(/R\$/gi, "").replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // formato BR
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function classificar(nome: string): Pick<ContaPatrimonio, "instituicao" | "pessoa" | "tipo"> {
  const n = nome.toLowerCase();
  const pessoa = n.includes("maria") ? "Maria" : n.includes("lucas") ? "Lucas" : "—";
  if (n.includes("pic")) return { instituicao: "PicPay", pessoa, tipo: "Banco/Caixa" };
  if (/\bnu\b/.test(n) || n.includes("nubank")) return { instituicao: "Nubank", pessoa, tipo: "Banco/Caixa" };
  if (n.includes("xp")) return { instituicao: "XP", pessoa, tipo: "Investimentos BR" };
  if (n.includes("ibk") || n.includes("ibkr") || n.includes("interactive")) return { instituicao: "IBKR", pessoa, tipo: "Exterior" };
  if (n.includes("bitcoin") || n.includes("btc") || n.includes("cripto")) return { instituicao: "Bitcoin", pessoa, tipo: "Cripto" };
  return { instituicao: "Outros", pessoa, tipo: "Outros" };
}

export function parseEvolucaoPatrimonio(rows: Row[]): EvolucaoPatrimonio {
  if (rows.length === 0) return { anos: [], totalPorAno: [], contas: [], porTipo: {}, porPessoa: {}, porInstituicao: {} };

  // anos = chaves de 4 dígitos
  const anos = Object.keys(rows[0]).filter(k => /^\d{4}$/.test(k)).sort();
  // coluna do nome = chave vazia ou primeira não-ano
  const nomeKey = Object.keys(rows[0]).find(k => k === "" || (!/^\d{4}$/.test(k) && !/^(total|patrim)/i.test(k))) ?? "";

  const contas: ContaPatrimonio[] = [];
  for (const row of rows) {
    const nome = String(row[nomeKey] ?? "").trim();
    if (!nome || /^total/i.test(nome)) continue; // pula a linha "Total"
    const meta = classificar(nome);
    const valores: Record<string, number> = {};
    let temValor = false;
    for (const ano of anos) {
      const v = parseBRL(row[ano]);
      valores[ano] = v;
      if (v !== 0) temValor = true;
    }
    if (temValor) contas.push({ nome, ...meta, valores });
  }

  // agregações
  const totalPorAno = anos.map(ano => ({ ano, valor: contas.reduce((s, c) => s + (c.valores[ano] || 0), 0) }));
  const agregar = (chave: (c: ContaPatrimonio) => string): Record<string, Record<string, number>> => {
    const out: Record<string, Record<string, number>> = {};
    for (const ano of anos) {
      out[ano] = {};
      for (const c of contas) {
        const k = chave(c);
        out[ano][k] = (out[ano][k] || 0) + (c.valores[ano] || 0);
      }
    }
    return out;
  };

  return {
    anos,
    totalPorAno,
    contas: contas.sort((a, b) => (b.valores[anos[anos.length - 1]] || 0) - (a.valores[anos[anos.length - 1]] || 0)),
    porTipo: agregar(c => c.tipo),
    porPessoa: agregar(c => c.pessoa),
    porInstituicao: agregar(c => c.instituicao),
  };
}
