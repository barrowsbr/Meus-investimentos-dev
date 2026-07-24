// Copia o runtime WASM do @mediapipe/tasks-vision (que já vem no node_modules,
// via @react-three/drei) para public/mediapipe/wasm, para o head tracking
// carregar o modelo LOCAL (sem CDN, offline, privado). Roda no prebuild —
// assim o binário de ~19MB NÃO fica versionado no git.

import { mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn("[copy-mediapipe-wasm] node_modules/@mediapipe/tasks-vision/wasm não encontrado — pulando.");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  copyFileSync(join(src, f), join(dest, f));
  n++;
}
console.log(`[copy-mediapipe-wasm] ${n} arquivo(s) → public/mediapipe/wasm`);
