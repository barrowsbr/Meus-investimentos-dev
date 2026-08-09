// Parser de OFX de cartão de crédito (Nubank e afins) — PURO e client-safe.
//
// O OFX do Nubank é SGML (tags sem fechamento obrigatório), então parsear como
// XML quebraria. Extraímos os blocos <STMTTRN> por regex e lemos os campos
// linha a linha — tolerante a variações de banco.
//
// ⚠️ Lição do arquivo real: o Nubank REPETE FITID entre lançamentos diferentes
// (ex.: o IOF e a compra internacional que o gerou compartilham o ID). A chave
// de dedup é fitid+valor, nunca o fitid sozinho.

export interface TransacaoCartao {
  /** Chave de dedup: `${fitid}:${valor}` (FITID sozinho repete no Nubank). */
  chave: string;
  fitid: string;
  data: string;              // yyyy-mm-dd
  valor: number;             // negativo = gasto, positivo = crédito/estorno
  descricao: string;         // MEMO original
  tipo: "DEBIT" | "CREDIT";
  /** "4/12" quando o memo termina em "- Parcela 4/12"; senão null. */
  parcela: { n: number; total: number } | null;
}

export interface OfxParseado {
  transacoes: TransacaoCartao[];
  periodo: { inicio: string; fim: string } | null;
  moeda: string | null;
}

const RE_PARCELA = /\s*-\s*Parcela\s+(\d+)\/(\d+)\s*$/i;

function campo(bloco: string, tag: string): string | null {
  // SGML: valor vai da tag até a próxima "<" (ou fim de linha)
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : null;
}

function dataOfx(s: string | null): string | null {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** true se o texto parece um OFX (usado pelo upload para rotear o arquivo). */
export function pareceOfx(texto: string): boolean {
  const inicio = texto.slice(0, 2000).toUpperCase();
  return inicio.includes("OFXHEADER") || inicio.includes("<OFX>");
}

export function parseOfx(texto: string): OfxParseado {
  const transacoes: TransacaoCartao[] = [];
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  for (const bloco of blocos) {
    const fitid = campo(bloco, "FITID") ?? "";
    const data = dataOfx(campo(bloco, "DTPOSTED"));
    const valor = Number(campo(bloco, "TRNAMT"));
    const memo = campo(bloco, "MEMO") ?? "";
    const tipoRaw = (campo(bloco, "TRNTYPE") ?? "").toUpperCase();
    if (!fitid || !data || !Number.isFinite(valor) || valor === 0) continue;

    const mP = memo.match(RE_PARCELA);
    transacoes.push({
      chave: `${fitid}:${valor}`,
      fitid,
      data,
      valor,
      descricao: memo,
      tipo: tipoRaw === "CREDIT" ? "CREDIT" : "DEBIT",
      parcela: mP ? { n: Number(mP[1]), total: Number(mP[2]) } : null,
    });
  }

  const inicio = dataOfx(texto.match(/<DTSTART>([^<\r\n]*)/i)?.[1] ?? null);
  const fim = dataOfx(texto.match(/<DTEND>([^<\r\n]*)/i)?.[1] ?? null);
  const moeda = texto.match(/<CURDEF>([^<\r\n]*)/i)?.[1]?.trim() ?? null;

  transacoes.sort((a, b) => b.data.localeCompare(a.data));
  return { transacoes, periodo: inicio && fim ? { inicio, fim } : null, moeda };
}
