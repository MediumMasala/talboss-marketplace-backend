import { supabase } from "../src/supabase.js";

const date = "2026-05-13";

console.log("=== Ground truth ===\n");

const { count: cdCount } = await supabase
  .from("candidates_daily")
  .select("*", { count: "exact", head: true })
  .eq("joined_at", date);
console.log(`candidates_daily rows for ${date}: ${cdCount}`);

const { data: aggRow } = await supabase
  .from("daily_aggregates")
  .select("*")
  .eq("joined_at", date)
  .single();
console.log("daily_aggregates row:", aggRow);

const { data: rpcData, error: rpcErr } = await supabase.rpc("daily_breakdown", {
  start_date: date,
  end_date: date,
});
console.log("RPC result:", rpcData, "err:", rpcErr?.message ?? "none");
