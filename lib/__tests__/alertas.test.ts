import { describe, it, expect } from "vitest";
import { computeDarfAlertas, computeDirpfAlerta, computeAlavancagemAlerta, computeAlertas, shouldSend } from "@/lib/alertas";

describe("computeDarfAlertas", () => {
  const mesesBase = [
    { mes: "2026-04", irTotal: 500, vencimento: "2026-05-29", darfCodigo: "6015" },
  ];

  it("avisa quando faltam ≤3 dias para o vencimento", () => {
    const out = computeDarfAlertas(mesesBase, "2026-06", "2026-05-27");
    expect(out).toHaveLength(1);
    expect(out[0].chave).toBe("darf_aviso_2026-04");
    expect(out[0].throttleDias).toBe(1);
  });

  it("alerta vencido quando já passou do prazo", () => {
    const out = computeDarfAlertas(mesesBase, "2026-06", "2026-06-05");
    expect(out).toHaveLength(1);
    expect(out[0].chave).toBe("darf_vencido_2026-04");
    expect(out[0].texto).toContain("venceu há");
    expect(out[0].throttleDias).toBe(7);
  });

  it("não alerta fora da janela de 3 dias e antes do vencimento", () => {
    const out = computeDarfAlertas(mesesBase, "2026-06", "2026-05-01");
    expect(out).toHaveLength(0);
  });

  it("ignora o mês corrente (ainda não fechou apuração)", () => {
    const out = computeDarfAlertas(
      [{ mes: "2026-06", irTotal: 500, vencimento: "2026-07-31", darfCodigo: "6015" }],
      "2026-06",
      "2026-07-30",
    );
    expect(out).toHaveLength(0);
  });

  it("ignora meses sem imposto devido", () => {
    const out = computeDarfAlertas(
      [{ mes: "2026-04", irTotal: 0, vencimento: "2026-05-29", darfCodigo: "6015" }],
      "2026-06",
      "2026-06-05",
    );
    expect(out).toHaveLength(0);
  });
});

describe("computeDirpfAlerta", () => {
  it("null fora da janela (antes de abril ou depois de junho)", () => {
    expect(computeDirpfAlerta("2026-03-15")).toBeNull();
    expect(computeDirpfAlerta("2026-07-01")).toBeNull();
  });

  it("lembrete semanal entre início de abril e 7 dias antes do prazo", () => {
    const t = computeDirpfAlerta("2026-04-10");
    expect(t?.chave).toBe("dirpf_2026_lembrete");
    expect(t?.throttleDias).toBe(7);
  });

  it("urgente nos últimos 7 dias antes do prazo (31/05)", () => {
    const t = computeDirpfAlerta("2026-05-28");
    expect(t?.chave).toBe("dirpf_2026_urgente");
    expect(t?.throttleDias).toBe(1);
  });

  it("atrasado depois do prazo, dentro da janela de junho", () => {
    const t = computeDirpfAlerta("2026-06-10");
    expect(t?.chave).toBe("dirpf_2026_atrasado");
    expect(t?.texto).toContain("em atraso");
    expect(t?.throttleDias).toBe(3);
  });
});

describe("computeAlavancagemAlerta", () => {
  it("null quando abaixo do limite", () => {
    expect(computeAlavancagemAlerta(20, 30)).toBeNull();
  });

  it("dispara quando acima do limite", () => {
    const t = computeAlavancagemAlerta(35, 30);
    expect(t?.chave).toBe("alavancagem_acima_limite");
    expect(t?.texto).toContain("35.0%");
    expect(t?.texto).toContain("30.0%");
  });

  it("null quando limite é zero/negativo (desligado)", () => {
    expect(computeAlavancagemAlerta(50, 0)).toBeNull();
  });
});

describe("computeAlertas — consolidado", () => {
  it("agrega DARF + DIRPF + alavancagem quando todos disparam", () => {
    const out = computeAlertas({
      meses: [{ mes: "2026-04", irTotal: 500, vencimento: "2026-05-29", darfCodigo: "6015" }],
      mesAtual: "2026-06",
      hoje: "2026-06-05",
      alavancagemPct: 40,
      limiteAlavancagemPct: 30,
    });
    const chaves = out.map(t => t.chave);
    expect(chaves).toContain("darf_vencido_2026-04");
    expect(chaves).toContain("dirpf_2026_atrasado");
    expect(chaves).toContain("alavancagem_acima_limite");
  });
});

describe("shouldSend — throttle", () => {
  it("envia se nunca foi enviado", () => {
    expect(shouldSend({ chave: "x", texto: "", throttleDias: 7 }, {}, "2026-06-01")).toBe(true);
  });

  it("bloqueia dentro da janela de throttle", () => {
    const estado = { x: "2026-06-01" };
    expect(shouldSend({ chave: "x", texto: "", throttleDias: 7 }, estado, "2026-06-03")).toBe(false);
  });

  it("libera após a janela de throttle", () => {
    const estado = { x: "2026-06-01" };
    expect(shouldSend({ chave: "x", texto: "", throttleDias: 7 }, estado, "2026-06-09")).toBe(true);
  });
});
