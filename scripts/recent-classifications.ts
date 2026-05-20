import { supabase } from "../src/supabase.js";

const sinceUtc = process.argv[2] ?? "2026-05-20T05:30:00";
const { data } = await supabase
  .from("classification_log")
  .select("created_at, joined_at, prompt_version")
  .gte("created_at", sinceUtc)
  .order("created_at", { ascending: false })
  .limit(10);

console.log(`Classifications since ${sinceUtc} UTC:`);
for (const r of data ?? []) {
  console.log(`  ${r.created_at} | joined_at=${r.joined_at} | version=${r.prompt_version}`);
}
console.log(`  total: ${(data ?? []).length}`);
