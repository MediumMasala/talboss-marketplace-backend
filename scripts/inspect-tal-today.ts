import { supabase } from "../src/supabase.js";

const { data, error } = await supabase
  .from("candidates_daily")
  .select("name, company, role, location, tier, reason, raw, source_table")
  .eq("joined_at", "2026-05-18")
  .in("source_table", ["tal_users", "both"])
  .order("name");

if (error) throw error;

console.log(`=== tal.users-sourced rows for 2026-05-18 (${data?.length ?? 0}) ===\n`);
for (const r of data ?? []) {
  const raw = r.raw as Record<string, unknown>;
  console.log(`• ${r.name}  |  source=${r.source_table}  |  tier=${r.tier}`);
  console.log(`    company: ${r.company ?? "—"}`);
  console.log(`    role:    ${r.role ?? "—"}`);
  console.log(`    location:${r.location ?? "—"}`);
  if (raw.institute_name) {
    console.log(`    edu:     ${raw.institute_name}${raw.institute_degree ? `, ${raw.institute_degree}` : ""}`);
  }
  if (raw.li_headline) console.log(`    li:      ${raw.li_headline}`);
  console.log(`    reason:  ${r.reason}\n`);
}
