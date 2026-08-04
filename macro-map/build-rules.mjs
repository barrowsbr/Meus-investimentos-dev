// Compila a fonte única (macro-map/rules/**.yaml + drivers.yaml) para um módulo
// TS importável: lib/macro-map/rules.generated.ts. Assim o runtime/Next bundla as
// regras normalmente (sem ler YAML nem tocar o disco em produção). O YAML segue
// sendo a fonte de verdade; este arquivo é ARTEFATO (regenerado no prebuild).
//
//   node macro-map/build-rules.mjs

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";

const ROOT = join(process.cwd(), "macro-map");
const RULES_DIR = join(ROOT, "rules");
const OUT = join(process.cwd(), "lib", "macro-map", "rules.generated.ts");

function collectYaml(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...collectYaml(full));
    else if (e.name.endsWith(".yaml") || e.name.endsWith(".yml")) out.push(full);
  }
  return out;
}

const drivers = parse(readFileSync(join(ROOT, "drivers.yaml"), "utf8")).drivers;
const rules = collectYaml(RULES_DIR)
  .sort()
  .map((f) => ({ __src: relative(process.cwd(), f), ...parse(readFileSync(f, "utf8")) }));

// remove a chave auxiliar __src antes de serializar
const clean = rules.map(({ __src, ...r }) => r);

const banner = `// ⚠️ ARQUIVO GERADO por macro-map/build-rules.mjs — NÃO EDITAR À MÃO.
// Fonte única de verdade: macro-map/rules/**/*.yaml + macro-map/drivers.yaml
// Regenere com:  node macro-map/build-rules.mjs   (roda também no prebuild)
`;

// Embutimos os dados como STRING JSON e fazemos JSON.parse no import: evita a
// perda de literais do TS (number não casa com 1|-1, [0,3] não vira tupla,
// "alta" não vira o enum) sem recorrer a `as unknown`. A validação de forma vive
// no teste do schema (CI); aqui só carregamos dado já validado.
const body = `${banner}
import type { Rule, Driver } from "./types";

export const RULES: Rule[] = JSON.parse(
  ${JSON.stringify(JSON.stringify(clean))}
);

export const DRIVERS: Driver[] = JSON.parse(
  ${JSON.stringify(JSON.stringify(drivers))}
);
`;

writeFileSync(OUT, body, "utf8");
console.log(`✓ rules.generated.ts: ${clean.length} regras, ${drivers.length} drivers → lib/macro-map/rules.generated.ts`);
