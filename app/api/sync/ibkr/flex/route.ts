// Rota PRÓPRIA (não passa pelo catch-all [...path]): o maxDuration de um
// handler importado pelo catch-all é IGNORADO — valia o 45s do catch-all.
// O Flex (até ~38s de geração) + validação Yahoo dos tickers estourava o
// limite e a Vercel devolvia erro em TEXTO ("An error occurred…"), que o
// cliente tentava parsear como JSON.
export { GET, POST } from "./handler";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
