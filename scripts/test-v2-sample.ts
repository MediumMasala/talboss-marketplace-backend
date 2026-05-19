/**
 * Dry-run sample: classify 10 real rows with v2 and SHOW the v1→v2 diff.
 * Does NOT write to DB. Use this to spot-check the new prompt before
 * committing to a full backfill.
 *   npx tsx --env-file=.env.local scripts/test-v2-sample.ts
 */
import { supabase } from "../src/supabase.js";
import { classify } from "../src/classifier.js";

// Mix: 5 tal_users + 5 round1 from yesterday
async function pick(src: string, n: number) {
  const { data } = await supabase
    .from("candidates_daily")
    .select("id, joined_at, name, company, role, location, tier, reason, confidence, raw, source_table")
    .eq("source_table", src)
    .gte("joined_at", "2026-05-17")
    .limit(n);
  return data ?? [];
}

const rows = [...(await pick("tal_users", 5)), ...(await pick("round1_god_table", 5))];
console.log(`Testing v2 on ${rows.length} real rows (5 tal_users + 5 round1)\n`);

let okCount = 0;
let failCount = 0;

for (const r of rows) {
  const v1Verdict = `v1: market=${(r.raw as { is_marketplace?: boolean })?.is_marketplace ?? "?"} tier=${r.tier} conf=${r.confidence ?? "-"}`;
  try {
    const { output, meta } = await classify({
      name: r.name as string | null,
      company: r.company as string | null,
      role: r.role as string | null,
      location: r.location as string | null,
      raw: r.raw as Record<string, unknown>,
    });
    okCount++;
    console.log(`[${r.source_table}] ${(r.name as string ?? "?").padEnd(28)} | ${(r.company as string ?? "—").slice(0, 24).padEnd(24)} | ${(r.role as string ?? "—").slice(0, 28).padEnd(28)}`);
    console.log(`  v2: market=${output.is_marketplace}  tier=${output.tier}  conf=${output.confidence}  (${meta.latency_ms}ms)`);
    console.log(`  v2 reason: ${output.reason}\n`);
  } catch (e) {
    failCount++;
    console.log(`[${r.source_table}] ${r.name}: ERROR — ${(e as Error).message.slice(0, 200)}\n`);
  }
}

console.log(`\nSample summary: ok=${okCount} fail=${failCount}`);
