// Lucro por VENDA (FIFO) — exibição por transação no detalhe do ativo.
//
// Módulo PURO de propósito: sem imports de cotacoes/yahoo/sectors. Isso é
// deliberado — o AssetDetailModal (client component) consome esta função, e
// importá-la de lib/portfolio.ts arrastaria o motor inteiro (→ cotacoes.ts →
// yahoo-finance2 → @deno/shim-deno → 'net') para o bundle do browser e QUEBRA
// o build de produção. Mantenha este arquivo sem dependências server-only.
//
// Recebe as transações de UM ticker (qualquer ordem) e calcula, para cada
// venda, o lucro realizado FIFO na MOEDA DO ATIVO (taxas deduzidas: da compra
// no custo do lote, da venda no lucro) — mesma semântica de tipos, ordenação
// e consumo de lotes de calcularCarteiraFIFO. Retorna Map índice→resultado
// (índices do array de entrada; só vendas aparecem no Map).

export interface LucroVenda {
  lucro: number;      // (preço de venda − custo FIFO) × qtd − taxas da venda
  custoFifo: number;  // custo FIFO consumido pela venda
  lucroPct: number | null; // lucro / custoFifo, em PONTOS percentuais
}

export function calcularLucroPorVenda(
  txs: { data: string; tipo: string; quantidade: number; preco: number; taxas?: number }[],
): Map<number, LucroVenda> {
  const parseDate = (s: string): number => {
    const br = (s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return new Date(`${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`).getTime();
    return new Date(s).getTime() || 0;
  };
  const ordem = txs.map((_, i) => i).sort((a, b) => parseDate(txs[a].data) - parseDate(txs[b].data));
  const lotes: { qty: number; pm: number }[] = [];
  const out = new Map<number, LucroVenda>();
  for (const i of ordem) {
    const t = txs[i];
    const raw = String(t.tipo ?? "").toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const isCompra = raw.includes("compra") || raw.includes("buy") || raw.includes("aporte") || raw.includes("entrada") || raw.includes("subscri") || raw.includes("bonif");
    const isVenda = !isCompra && (raw.includes("venda") || raw.includes("sell") || raw.includes("resgate") || raw.includes("saida"));
    const qtd = Math.abs(t.quantidade || 0);
    const preco = Math.abs(t.preco || 0);
    const taxas = Math.abs(t.taxas ?? 0);
    if (qtd === 0) continue;
    if (isCompra) {
      lotes.push({ qty: qtd, pm: (qtd * preco + taxas) / qtd });
    } else if (isVenda) {
      let rest = qtd;
      let lucro = 0;
      let custo = 0;
      while (rest > 0.000001 && lotes.length > 0) {
        const lote = lotes[0];
        const c = Math.min(lote.qty, rest);
        lucro += (preco - lote.pm) * c;
        custo += lote.pm * c;
        lote.qty -= c;
        rest -= c;
        if (lote.qty < 0.000001) lotes.shift();
      }
      lucro -= taxas;
      out.set(i, { lucro, custoFifo: custo, lucroPct: custo > 0 ? (lucro / custo) * 100 : null });
    }
  }
  return out;
}
