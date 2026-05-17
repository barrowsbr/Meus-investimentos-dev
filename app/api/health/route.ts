import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {
    env_api_key: !!process.env.GOOGLE_API_KEY,
    env_spreadsheet_id: !!process.env.SPREADSHEET_ID,
  };

  try {
    const sample = await fetchTab("meus_ativos");
    checks.sheets_connection = "ok";
    checks.meus_ativos_rows = sample.length;
    checks.meus_ativos_columns = sample.length > 0 ? Object.keys(sample[0]) : [];
  } catch (e: unknown) {
    checks.sheets_connection = "error";
    checks.sheets_error = e instanceof Error ? e.message : String(e);
  }

  const healthy = checks.sheets_connection === "ok";
  return NextResponse.json(checks, { status: healthy ? 200 : 500 });
}
