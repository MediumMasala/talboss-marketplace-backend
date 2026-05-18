import { supabase } from "../src/supabase.js";

const { data, error } = await supabase
  .from("candidates_daily")
  .select("joined_at, source_table");

if (error) throw error;

const stats: Record<string, { round1: number; tal: number; both: number }> = {};
for (const r of data ?? []) {
  const d = r.joined_at as string;
  stats[d] ??= { round1: 0, tal: 0, both: 0 };
  if (r.source_table === "round1_god_table") stats[d].round1++;
  else if (r.source_table === "tal_users") stats[d].tal++;
  else stats[d].both++;
}

console.log("date         round1  tal_users  both  total");
console.log("-----------  ------  ---------  ----  -----");
for (const d of Object.keys(stats).sort().reverse()) {
  const s = stats[d];
  const total = s.round1 + s.tal + s.both;
  console.log(
    `${d}    ${String(s.round1).padStart(3)}      ${String(s.tal).padStart(3)}       ${String(s.both).padStart(2)}    ${String(total).padStart(3)}`,
  );
}
