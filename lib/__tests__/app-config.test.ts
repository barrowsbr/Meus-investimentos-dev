// app_config (fusão das abas de configuração) — testa o contrato da migração
// preguiçosa: fallback de leitura para as abas legadas, marcador de escopo
// migrado (inclusive vazio) e preservação dos demais escopos na escrita.

import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchTab = vi.fn();
const writeTab = vi.fn();
const ensureTab = vi.fn();

vi.mock("@/lib/data-store", () => ({ getDataStore: () => ({ fetchTab }) }));
vi.mock("@/lib/gsheets", () => ({ ensureTab: (...a: unknown[]) => ensureTab(...a), writeTab: (...a: unknown[]) => writeTab(...a) }));

import { lerEscopo, gravarEscopo, APP_CONFIG_TAB } from "@/lib/app-config";

beforeEach(() => {
  fetchTab.mockReset();
  writeTab.mockReset().mockResolvedValue(undefined);
  ensureTab.mockReset().mockResolvedValue(undefined);
});

describe("lerEscopo", () => {
  it("lê da app_config quando o escopo já foi migrado (marcador filtrado)", async () => {
    fetchTab.mockImplementation(async (tab: string) => {
      if (tab === APP_CONFIG_TAB) return [
        { escopo: "historico", chave: "__migrado", valor: "1" },
        { escopo: "historico", chave: "ativo", valor: "false" },
        { escopo: "alertas", chave: "ativo", valor: "true" },
      ];
      throw new Error("não deveria ler a aba legada");
    });
    const map = await lerEscopo("historico");
    expect(map.get("ativo")).toBe("false");
    expect(map.has("__migrado")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("cai para a aba legada quando o escopo não existe na app_config", async () => {
    fetchTab.mockImplementation(async (tab: string) => {
      if (tab === APP_CONFIG_TAB) return [{ escopo: "alertas", chave: "ativo", valor: "true" }];
      if (tab === "historico_config") return [{ chave: "ativo", valor: "false" }];
      throw new Error(`aba inesperada: ${tab}`);
    });
    const map = await lerEscopo("historico");
    expect(map.get("ativo")).toBe("false");
  });

  it("legado de alertas_estado usa a coluna data_envio", async () => {
    fetchTab.mockImplementation(async (tab: string) => {
      if (tab === APP_CONFIG_TAB) return [];
      if (tab === "alertas_estado") return [{ chave: "darf", data_envio: "2026-07-18" }];
      throw new Error(`aba inesperada: ${tab}`);
    });
    const map = await lerEscopo("alertas_estado");
    expect(map.get("darf")).toBe("2026-07-18");
  });

  it("escopo migrado VAZIO (só marcador) NÃO volta ao legado", async () => {
    fetchTab.mockImplementation(async (tab: string) => {
      if (tab === APP_CONFIG_TAB) return [{ escopo: "alertas_estado", chave: "__migrado", valor: "1" }];
      throw new Error("não deveria ler a aba legada");
    });
    const map = await lerEscopo("alertas_estado");
    expect(map.size).toBe(0);
  });

  it("nada em lugar nenhum → Map vazio (defaults 'ligado' ficam nos stores)", async () => {
    fetchTab.mockRejectedValue(new Error("aba não existe"));
    const map = await lerEscopo("automacoes");
    expect(map.size).toBe(0);
  });
});

describe("gravarEscopo", () => {
  it("regrava o escopo com marcador, preservando os demais escopos, em RAW", async () => {
    fetchTab.mockImplementation(async (tab: string) => {
      if (tab === APP_CONFIG_TAB) return [
        { escopo: "alertas", chave: "__migrado", valor: "1" },
        { escopo: "alertas", chave: "ativo", valor: "true" },
        { escopo: "historico", chave: "__migrado", valor: "1" },
        { escopo: "historico", chave: "ativo", valor: "true" },
      ];
      throw new Error(`aba inesperada: ${tab}`);
    });
    await gravarEscopo("historico", [["ativo", "false"]]);

    expect(ensureTab).toHaveBeenCalledWith(APP_CONFIG_TAB, ["escopo", "chave", "valor"]);
    expect(writeTab).toHaveBeenCalledTimes(1);
    const [tab, headers, rows, opts] = writeTab.mock.calls[0];
    expect(tab).toBe(APP_CONFIG_TAB);
    expect(headers).toEqual(["escopo", "chave", "valor"]);
    expect(opts).toEqual({ raw: true });
    // alertas intacto (marcador + chave), historico regravado com marcador + novo valor
    expect(rows).toContainEqual(["alertas", "__migrado", "1"]);
    expect(rows).toContainEqual(["alertas", "ativo", "true"]);
    expect(rows).toContainEqual(["historico", "__migrado", "1"]);
    expect(rows).toContainEqual(["historico", "ativo", "false"]);
    expect(rows.filter((r: string[]) => r[0] === "historico")).toHaveLength(2);
  });

  it("primeira gravação com app_config inexistente cria a aba do zero", async () => {
    fetchTab.mockRejectedValue(new Error("aba não existe"));
    await gravarEscopo("automacoes", [["cron_cotacoes", "false"]]);
    const rows = writeTab.mock.calls[0][2];
    expect(rows).toEqual([
      ["automacoes", "__migrado", "1"],
      ["automacoes", "cron_cotacoes", "false"],
    ]);
  });

  it("escopo gravado vazio mantém só o marcador (round-trip não ressuscita o legado)", async () => {
    fetchTab.mockImplementation(async (tab: string) => {
      if (tab === APP_CONFIG_TAB) return [];
      if (tab === "alertas_estado") return [{ chave: "darf", data_envio: "2026-01-01" }];
      throw new Error(`aba inesperada: ${tab}`);
    });
    await gravarEscopo("alertas_estado", []);
    const rows = writeTab.mock.calls[0][2];
    expect(rows).toEqual([["alertas_estado", "__migrado", "1"]]);
  });
});
