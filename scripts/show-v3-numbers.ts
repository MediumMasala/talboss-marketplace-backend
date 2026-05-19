import { supabase } from "../src/supabase.js";

const { data, error } = await supabase.rpc("daily_breakdown", {
  start_date: "2026-05-17",
  end_date: "2026-05-19",
});
if (error) throw error;

console.log("date        total  marketplace*  tier1+supreme  tal   round1");
console.log("----------  -----  ------------  -------------  ----  ------");
for (const r of (data ?? []) as Array<{ joined_at: string; total: number; marketplace: number; tier1_supreme: number; tal_users: number; round1: number }>) {
  console.log(
    `${r.joined_at}  ${String(r.total).padStart(5)}  ${String(r.marketplace).padStart(12)}  ${String(r.tier1_supreme).padStart(13)}  ${String(r.tal_users).padStart(4)}  ${String(r.round1).padStart(6)}`,
  );
}
console.log("\n* marketplace includes maybes (is_marketplace=true OR confidence in low/medium)\n");

// Confidence breakdown per day
for (const d of ["2026-05-17", "2026-05-18", "2026-05-19"]) {
  const { count: hi } = await supabase
    .from("candidates_daily")
    .select("*", { count: "exact", head: true })
    .eq("joined_at", d)
    .eq("confidence", "high");
  const { count: md } = await supabase
    .from("candidates_daily")
    .select("*", { count: "exact", head: true })
    .eq("joined_at", d)
    .eq("confidence", "medium");
  const { count: lo } = await supabase
    .from("candidates_daily")
    .select("*", { count: "exact", head: true })
    .eq("joined_at", d)
    .eq("confidence", "low");
  console.log(`${d}  confidence:  high=${hi}  medium=${md}  low=${lo}`);
}

// R1 vs Tal prompt usage
for (const d of ["2026-05-17", "2026-05-18", "2026-05-19"]) {
  const { count: r1 } = await supabase
    .from("candidates_daily")
    .select("*", { count: "exact", head: true })
    .eq("joined_at", d)
    .eq("classifier_version", "v3-r1-banks-electronics-out");
  const { count: tal } = await supabase
    .from("candidates_daily")
    .select("*", { count: "exact", head: true })
    .eq("joined_at", d)
    .eq("classifier_version", "v3-blr-banks-electronics-out");
  console.log(`${d}  prompt:  r1=${r1}  tal=${tal}`);
}
