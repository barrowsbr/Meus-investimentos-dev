import { describe, expect, it } from "vitest";
import { toDailySeries, ultimosResultados, escalaBarras } from "../historico-daily";

// Casos ancorados na série REAL de produção (lida em 03/09/2026), onde o
// gráfico de pregões da Home estava mentindo.

const linha = (data: string, total: number, variacao_dia_pct: unknown, hora = 19) =>
  ({ data, hora, patrimonio_total: total, variacao_dia_pct });

describe("toDailySeries — último snapshot do dia", () => {
  it("guarda a variação canônica do ÚLTIMO snapshot (não do primeiro)", () => {
    const s = toDailySeries([
      linha("2026-09-03", 100, 0.4, 10),
      linha("2026-09-03", 102, 1.75, 19),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].varDiaPct).toBe(1.75);
  });

  it("variação ausente/vazia/não-numérica vira null (não vira 0)", () => {
    for (const v of [null, undefined, "", "n/d"]) {
      expect(toDailySeries([linha("2026-09-03", 100, v)])[0].varDiaPct).toBeNull();
    }
  });
});

describe("ultimosResultados — o retorno é do MOTOR, não do patrimônio", () => {
  it("APORTE não vira lucro (caso real 04/08: +18,45% derivado vs +1,66% real)", () => {
    // patrimônio salta 18,45% porque entrou dinheiro; o motor diz +1,66%.
    const r = ultimosResultados(toDailySeries([
      linha("2026-08-03", 218000, 0.2),
      linha("2026-08-04", 258230, 1.66),
    ]), 10);
    expect(r.at(-1)!.pct).toBe(1.66);
    expect(r.some((d) => d.pct > 10)).toBe(false);
  });

  it("BURACO na série não vira 'um pregão' de 17 dias", () => {
    // 23/06 → 10/07 (17 dias). O valor mostrado é o do DIA, não do intervalo.
    const r = ultimosResultados(toDailySeries([
      linha("2026-06-23", 200000, -0.3),
      linha("2026-07-10", 214000, 0.55),
    ]), 10);
    expect(r.map((d) => d.pct)).toEqual([-0.3, 0.55]);
  });

  it("sábado e domingo NÃO são pregão", () => {
    const r = ultimosResultados(toDailySeries([
      linha("2026-08-28", 100, 0.5),  // sexta
      linha("2026-08-29", 100, 0.0),  // sábado
      linha("2026-08-30", 100, 0.0),  // domingo
      linha("2026-08-31", 100, -1.2), // segunda
    ]), 10);
    expect(r.map((d) => d.date)).toEqual(["2026-08-28", "2026-08-31"]);
  });

  it("dia sem o campo é PULADO — melhor faltar barra que mostrar barra errada", () => {
    const r = ultimosResultados(toDailySeries([
      linha("2026-09-01", 100, -1.29),
      linha("2026-09-02", 101, null),
      linha("2026-09-03", 103, 1.75),
    ]), 10);
    expect(r.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-03"]);
  });
});

describe("escalaBarras — um dia atípico não pode achatar o resto", () => {
  it("usa o p90, então o outlier NÃO vira a referência", () => {
    const dias = [...Array(19).fill(0.5), 18.45];
    expect(escalaBarras(dias)).toBeLessThan(2);
  });

  it("com a referência antiga (máximo) quase tudo ficava no piso; com p90, não", () => {
    const pcts = [...Array(19).fill(0.5), 18.45];
    const alturas = (ref: number) =>
      pcts.map((p) => 6 + Math.round((Math.min(Math.abs(p), ref) / ref) * 14));
    const noPiso = (hs: number[]) => hs.filter((h) => h <= 7).length;
    expect(noPiso(alturas(Math.max(...pcts)))).toBe(19);      // antigo: 19/20 iguais
    expect(noPiso(alturas(escalaBarras(pcts)))).toBe(0);      // novo: nenhuma esmagada
  });

  it("piso de segurança impede divisão por zero num dia parado", () => {
    expect(escalaBarras([0, 0, 0])).toBe(0.4);
    expect(escalaBarras([])).toBe(0.4);
  });
});
