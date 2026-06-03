// Auto-teste do motor fiscal — exemplos trabalhados que documentam as regras.
// Rodar: npx tsx lib/tax/selftest.ts
import { apurarGanhos, type RawTx, type CorpEvent, type PtaxLookup } from "./engine";
import { apurar } from "./apurador";
import { rfAliquotaRegressiva } from "./rules";
import { apurarRf } from "./rf";

let falhas = 0;
function check(nome: string, got: number, exp: number, tol = 0.01) {
  const ok = Math.abs(got - exp) <= tol;
  if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗ FALHA"}  ${nome}: got=${got.toFixed(2)} exp=${exp.toFixed(2)}`);
}

const ptaxUSD: Record<string, number> = { "2024-03-01": 5.0, "2024-09-01": 5.5 };
const ptax: PtaxLookup = (moeda, date) => {
  if (moeda === "BRL") return 1;
  // forward-fill simples
  const keys = Object.keys(ptaxUSD).sort();
  let v = 5.0;
  for (const k of keys) if (k <= date) v = ptaxUSD[k];
  return v;
};
const tx = (date: string, tipo: string, ticker: string, q: number, p: number, moeda = "BRL", corretora = ""): RawTx =>
  ({ date, tipo, ticker, quantidade: q, preco: p, taxas: 0, moeda, corretora });

// 1) Ações swing isentas (venda ≤ R$20k)
{
  const evs = apurarGanhos([tx("2024-01-10", "compra", "PETR4", 100, 10), tx("2024-02-10", "venda", "PETR4", 100, 15)], [], ptax);
  const ap = apurar(evs);
  check("1. Ações venda 1500 (isenta) → IR", ap.irTotalMensal, 0);
}

// 2) Ações swing tributadas (venda > R$20k)
{
  const evs = apurarGanhos([tx("2024-01-10", "compra", "VALE3", 1000, 50), tx("2024-02-10", "venda", "VALE3", 1000, 60)], [], ptax);
  const ap = apurar(evs);
  check("2. Ações ganho 10k, venda 60k → IR 15%", ap.irTotalMensal, 1500);
}

// 3) Preço médio ponderado (NÃO FIFO)
{
  const evs = apurarGanhos([
    tx("2024-01-05", "compra", "ITUB4", 100, 10),
    tx("2024-01-06", "compra", "ITUB4", 100, 20), // PM = 15
    tx("2024-02-10", "venda", "ITUB4", 100, 25),  // custo 100×15=1500
  ], [], ptax);
  check("3. Ganho por preço médio (1000, não 1500 do FIFO)", evs.find(e => e.gainBRL !== 0)!.gainBRL, 1000);
}

// 4) Day trade (mesmo dia) → 20%
{
  const evs = apurarGanhos([tx("2024-03-10", "compra", "BBAS3", 100, 10), tx("2024-03-10", "venda", "BBAS3", 100, 12)], [], ptax);
  const ap = apurar(evs);
  check("4. Day trade ganho 200 → IR 20%", ap.irTotalMensal, 40);
}

// 5) FII (sem isenção, mesmo venda ≤ 20k) → 20%
{
  const evs = apurarGanhos([tx("2024-01-10", "compra", "HGLG11", 100, 100), tx("2024-02-10", "venda", "HGLG11", 100, 110)], [], ptax);
  const ap = apurar(evs);
  check("5. FII ganho 1000 (sem isenção) → IR 20%", ap.irTotalMensal, 200);
}

// 6) Compensação de prejuízo (swing), mês a mês
{
  const evs = apurarGanhos([
    tx("2024-01-05", "compra", "MGLU3", 1000, 30), tx("2024-01-20", "venda", "MGLU3", 1000, 29), // venda 29k>20k, prej -1000
    tx("2024-02-05", "compra", "WEGE3", 1000, 30), tx("2024-02-20", "venda", "WEGE3", 1000, 33), // venda 33k>20k, ganho 3000
  ], [], ptax);
  const ap = apurar(evs);
  check("6. Prejuízo 1000 compensa ganho 3000 → base 2000 × 15%", ap.irTotalMensal, 300);
}

// 7) Desdobramento (split 2:1) ajusta PM, não gera ganho
{
  const corp: CorpEvent[] = [{ date: "2024-01-15", ticker: "B3SA3", tipo: "desdobramento", fator: 2 }];
  const evs = apurarGanhos([
    tx("2024-01-05", "compra", "B3SA3", 100, 10),     // PM 10
    tx("2024-02-10", "venda", "B3SA3", 200, 6),       // após split: 200 @ PM 5; venda 1200, custo 1000
  ], corp, ptax);
  check("7. Split 2:1 → ganho 200 (custo 1000)", evs.find(e => e.modalidade === "acoes_swing")!.gainBRL, 200);
}

// 8) Exterior (Lei 14.754) com PTAX: compra PTAX 5.0, venda PTAX 5.5
{
  const evs = apurarGanhos([
    tx("2024-03-01", "compra", "AAPL", 10, 100, "USD", "IBKR"), // custo 10×100×5.0 = 5000 BRL
    tx("2024-09-01", "venda", "AAPL", 10, 120, "USD", "IBKR"),  // venda 10×120×5.5 = 6600 BRL
  ], [], ptax);
  const ap = apurar(evs);
  check("8a. Exterior ganho BRL (6600-5000)", evs.find(e => e.modalidade === "exterior")!.gainBRL, 1600);
  check("8b. Exterior IR anual 15%", ap.irTotalExterior, 240);
}

// 9) Tabela regressiva da renda fixa
{
  check("9a. RF ≤180d → 22,5%", rfAliquotaRegressiva(100), 0.225);
  check("9b. RF 181-360d → 20%", rfAliquotaRegressiva(300), 0.20);
  check("9c. RF 361-720d → 17,5%", rfAliquotaRegressiva(500), 0.175);
  check("9d. RF >720d → 15%", rfAliquotaRegressiva(800), 0.15);
}

// 10) RF: rendimento e IRRF retido (compra 10k, resgate 11k após ~2 anos → 17,5%)
{
  const rows = [
    { ticker: "CDB-X", tipo: "compra", valor: "10000", moeda: "BRL", compra: "2023-01-02" },
    { ticker: "CDB-X", tipo: "resgate", valor: "11000", moeda: "BRL", compra: "2024-12-20" }, // ~718d → 17,5%
  ];
  const r = apurarRf(rows)[0];
  check("10a. RF rendimento (11000-10000)", r.rendimento, 1000);
  check("10b. RF IRRF retido (1000 × 17,5%)", r.irRetido, 175);
}

console.log(falhas === 0 ? "\n✅ TODOS OS TESTES PASSARAM" : `\n❌ ${falhas} TESTE(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
