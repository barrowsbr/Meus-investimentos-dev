import { NextResponse } from "next/server";
import { readGoldenSource, writeGoldenSource } from "@/lib/db-cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const data = await readGoldenSource();
  const fixes: string[] = [];

  // ── VWRA.L: Yahoo alternates between GBX (pence) and GBP ──────────────
  // Normal range ~90-150 GBP. Values >180 are clearly in GBX → divide by 100.
  // Values that double then halve are the GBX/GBP flip.
  let vwraFixed = 0;
  let prevVwra = 0;
  for (const date of data.dates) {
    const p = data.prices[date]?.["VWRA.L"];
    if (p == null) continue;
    if (prevVwra > 0) {
      const ratio = p / prevVwra;
      if (ratio > 1.5 && ratio < 2.5) {
        // Doubled — likely GBX instead of GBP
        data.prices[date]["VWRA.L"] = p / 100 * (prevVwra / (p / 100) > 1.3 ? 1 : 1);
        // Actually just delete the outlier — next good price will fill naturally
        delete data.prices[date]["VWRA.L"];
        vwraFixed++;
        continue;
      }
      if (ratio < 0.65 && ratio > 0.35 && prevVwra > 180) {
        // Previous was GBX, this one is normal — fix previous day
        // But previous day is already written, skip and just note
      }
    }
    prevVwra = p;
  }
  // Simpler approach: remove all VWRA.L values >180 (clearly GBX not GBP)
  // and any values that spike >50% from neighbor
  let lastGoodVwra = 0;
  for (const date of data.dates) {
    const p = data.prices[date]?.["VWRA.L"];
    if (p == null) continue;
    if (p > 180) {
      delete data.prices[date]["VWRA.L"];
      vwraFixed++;
      continue;
    }
    if (lastGoodVwra > 0 && Math.abs(p - lastGoodVwra) / lastGoodVwra > 0.30) {
      delete data.prices[date]["VWRA.L"];
      vwraFixed++;
      continue;
    }
    lastGoodVwra = p;
  }
  if (vwraFixed > 0) fixes.push(`VWRA.L: removed ${vwraFixed} GBX/outlier prices`);

  // ── DPM.TO: stock split artifact — prices oscillate between ~10 and ~22 ──
  // Check for >40% swings and remove the outliers
  let dpmFixed = 0;
  let lastGoodDpm = 0;
  for (const date of data.dates) {
    const p = data.prices[date]?.["DPM.TO"];
    if (p == null) continue;
    if (lastGoodDpm > 0 && Math.abs(p - lastGoodDpm) / lastGoodDpm > 0.40) {
      delete data.prices[date]["DPM.TO"];
      dpmFixed++;
      continue;
    }
    lastGoodDpm = p;
  }
  if (dpmFixed > 0) fixes.push(`DPM.TO: removed ${dpmFixed} split-artifact prices`);

  // ── XPML11.SA: corrupt data on 2026-01-14 (1.068 instead of ~110) + 2026-06-15 (190) ──
  let xpmlFixed = 0;
  let lastGoodXpml = 0;
  for (const date of data.dates) {
    const p = data.prices[date]?.["XPML11.SA"];
    if (p == null) continue;
    // Normal range for XPML11 is roughly 80-140
    if (p < 50 || p > 160) {
      delete data.prices[date]["XPML11.SA"];
      xpmlFixed++;
      continue;
    }
    if (lastGoodXpml > 0 && Math.abs(p - lastGoodXpml) / lastGoodXpml > 0.30) {
      delete data.prices[date]["XPML11.SA"];
      xpmlFixed++;
      continue;
    }
    lastGoodXpml = p;
  }
  if (xpmlFixed > 0) fixes.push(`XPML11.SA: removed ${xpmlFixed} corrupt prices`);

  const totalFixed = vwraFixed + dpmFixed + xpmlFixed;
  if (totalFixed === 0) {
    return NextResponse.json({ ok: true, message: "Nothing to fix", fixes: [] });
  }

  await writeGoldenSource(data);

  return NextResponse.json({
    ok: true,
    totalFixed,
    fixes,
  });
}
