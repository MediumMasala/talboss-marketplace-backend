import { supabase } from "../src/supabase.js";

const { data, error } = await supabase.rpc("daily_breakdown", {
  start_date: "2026-05-09",
  end_date: "2026-05-18",
});
if (error) throw error;

console.log("=== Per-day candidates_daily (after backfill) ===\n");
console.log("date         total  marketplace  t1s   tal   round1");
console.log("-----------  -----  -----------  ---   ---   ------");
for (const r of (data ?? []) as Array<{ joined_at: string; total: number; marketplace: number; tier1_supreme: number; tal_users: number; round1: number }>) {
  console.log(
    `${r.joined_at}  ${String(r.total).padStart(5)}  ${String(r.marketplace).padStart(11)}  ${String(r.tier1_supreme).padStart(3)}  ${String(r.tal_users).padStart(4)}  ${String(r.round1).padStart(6)}`,
  );
}

// Count failed-classification rows
const { count: failedCount } = await supabase
  .from("candidates_daily")
  .select("*", { count: "exact", head: true })
  .like("classifier_version", "%-error");
console.log(`\nRows with classifier error suffix: ${failedCount}`);

// May 14 — was the day that crashed mid-run
const { count: may14Count } = await supabase
  .from("candidates_daily")
  .select("*", { count: "exact", head: true })
  .eq("joined_at", "2026-05-14");
console.log(`May 14 rows in DB: ${may14Count}`);
