// Rota própria (fora do catch-all) — mesmo motivo do flex: a reconciliação
// também baixa o extrato Flex (~10-40s) e precisa do maxDuration 60 REAL.
export { GET, POST } from "./handler";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
