/**
 * client.ts — Conexão com o banco SQLite hospedado (Turso / LibSQL).
 *
 * IMPORTANTE: Esta camada é OPCIONAL e DORMENTE. Se as variáveis de ambiente
 * TURSO_DATABASE_URL / TURSO_AUTH_TOKEN não estiverem configuradas, nada aqui
 * é executado e o projeto continua funcionando 100% com o Google Sheets.
 * Nenhum caminho de leitura existente usa este módulo ainda.
 */
import { createClient, type Client } from "@libsql/client";

let _client: Client | null = null;

/** Retorna true se o banco Turso está configurado via env vars. */
export function isDbConfigured(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

/** Cliente singleton do Turso. Lança erro se não configurado. */
export function getDb(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL não configurado. O banco SQLite está dormente — " +
      "configure as variáveis de ambiente para ativá-lo."
    );
  }
  _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return _client;
}
