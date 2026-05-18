/**
 * Connectivity smoke test.
 *   npx tsx --env-file=.env.local scripts/smoke.ts
 *
 * Verifies that the Supabase URL + service-role key can:
 *   - read empty tables (schema applied)
 *   - upsert + select a row in daily_aggregates
 *   - clean up after itself
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const TEST_DATE = "1900-01-01";

async function main() {
  const tables = ["candidates_daily", "daily_aggregates", "classification_log"];
  for (const t of tables) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
    if (error) throw new Error(`SELECT ${t}: ${error.message}`);
    console.log(`  ${t}: ${count ?? 0} rows`);
  }

  const upsert = await sb
    .from("daily_aggregates")
    .upsert(
      {
        joined_at: TEST_DATE,
        total_count: 1,
        marketplace_count: 1,
        tier1_supreme_count: 1,
      },
      { onConflict: "joined_at" },
    )
    .select()
    .single();
  if (upsert.error) throw new Error(`UPSERT daily_aggregates: ${upsert.error.message}`);
  console.log(`  upsert ok: ${TEST_DATE} → total=${upsert.data.total_count}`);

  const del = await sb.from("daily_aggregates").delete().eq("joined_at", TEST_DATE);
  if (del.error) throw new Error(`DELETE daily_aggregates: ${del.error.message}`);
  console.log(`  cleanup ok`);

  console.log("smoke OK");
}

main().catch((err) => {
  console.error("smoke FAILED:", err.message);
  process.exit(1);
});
