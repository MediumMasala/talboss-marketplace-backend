import { supabase } from "../src/supabase.js";

const { count: total } = await supabase
  .from("candidates_daily")
  .select("*", { count: "exact", head: true });

const { count: v2 } = await supabase
  .from("candidates_daily")
  .select("*", { count: "exact", head: true })
  .eq("classifier_version", "v2-blr-eng-pm-pedigree");

console.log(`Total rows:        ${total}`);
console.log(`Already v2:        ${v2}`);
console.log(`To backfill:       ${(total ?? 0) - (v2 ?? 0)}`);
