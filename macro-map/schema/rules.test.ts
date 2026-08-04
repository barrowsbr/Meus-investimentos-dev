// Validação da fonte única de verdade do Mapa de Transmissão Macro.
//
// Roda em CI (vitest). Garante que TODA regra em macro-map/rules/**/*.yaml:
//   1. valida contra rule.schema.json (via ajv);
//   2. só referencia drivers/ativos que existem em drivers.yaml (vocabulário único);
//   3. respeita invariantes que o JSON Schema não expressa (defasagem min<=max,
//      id casando com a família e com a subpasta, ids únicos);
//   4. mantém taxa_acerto/n_eventos NÃO preenchidos à mão na Fase 1.
//
// Se o PDF e o backend divergirem das regras, é aqui que quebra primeiro.

import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { parse } from "yaml";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "macro-map");
const RULES_DIR = join(ROOT, "rules");

const schema = JSON.parse(readFileSync(join(ROOT, "schema", "rule.schema.json"), "utf8"));
const driversDoc = parse(readFileSync(join(ROOT, "drivers.yaml"), "utf8")) as {
  drivers: { simbolo: string }[];
};
const VOCAB = new Set(driversDoc.drivers.map((d) => d.simbolo));

const FAMILIAS = ["energia", "juros", "fx", "credito", "brasil"] as const;

function collectYaml(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectYaml(full));
    else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) out.push(full);
  }
  return out;
}

interface Rule {
  id: string;
  familia: string;
  choque: { driver: string };
  efeitos: { ativo: string; defasagem_dias: [number, number] }[];
  evidencia: { taxa_acerto: number | null; n_eventos: number | null };
}

const files = collectYaml(RULES_DIR).sort();
const rules: { file: string; rel: string; rule: Rule }[] = files.map((file) => ({
  file,
  rel: relative(ROOT, file),
  rule: parse(readFileSync(file, "utf8")) as Rule,
}));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

describe("macro-map — fonte única de verdade", () => {
  it("existem regras para validar", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("drivers.yaml define um vocabulário não-vazio", () => {
    expect(VOCAB.size).toBeGreaterThan(0);
  });

  describe.each(rules)("$rel", ({ rule, rel }) => {
    it("valida contra rule.schema.json", () => {
      const ok = validate(rule);
      if (!ok) throw new Error(`${rel}: ${ajv.errorsText(validate.errors, { separator: "\n  " })}`);
      expect(ok).toBe(true);
    });

    it("o driver do choque existe em drivers.yaml", () => {
      expect(VOCAB, `driver desconhecido: ${rule.choque?.driver}`).toContain(rule.choque.driver);
    });

    it("todos os ativos dos efeitos existem em drivers.yaml", () => {
      for (const ef of rule.efeitos) {
        expect(VOCAB, `ativo desconhecido: ${ef.ativo}`).toContain(ef.ativo);
      }
    });

    it("defasagem_dias tem min <= max", () => {
      for (const ef of rule.efeitos) {
        const [min, max] = ef.defasagem_dias;
        expect(min, `${ef.ativo}: defasagem invertida`).toBeLessThanOrEqual(max);
      }
    });

    it("o id começa pela família e a família casa com a subpasta", () => {
      expect(FAMILIAS).toContain(rule.familia as (typeof FAMILIAS)[number]);
      expect(rule.id.startsWith(`${rule.familia}.`)).toBe(true);
      expect(rel.startsWith(`rules/${rule.familia}/`)).toBe(true);
    });

    it("taxa_acerto e n_eventos não são preenchidos à mão (Fase 1)", () => {
      // A Fase 2 preenche isso programaticamente; à mão é sempre null.
      expect(rule.evidencia.taxa_acerto).toBeNull();
      expect(rule.evidencia.n_eventos).toBeNull();
    });
  });

  it("todos os ids são únicos", () => {
    const ids = rules.map((r) => r.rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("as 5 famílias estão cobertas", () => {
    const cobertas = new Set(rules.map((r) => r.rule.familia));
    for (const f of FAMILIAS) expect(cobertas, `família sem regra: ${f}`).toContain(f);
  });
});
