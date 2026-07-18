// Rota explícita (migrada do catch-all [...path] — Faxina 2, 18/07).
// A lógica vive em handler.ts; este arquivo só liga o path ao Next.
export { GET, POST, DELETE, PATCH } from "./handler";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
