import { supabase } from "../src/supabase.js";

for (const d of ["2026-05-18", "2026-05-19", "2026-05-20"]) {
  const versions: Record<string, number> = {};
  const { data, error } = await supabase
    .from("candidates_daily")
    .select("classifier_version")
    .eq("joined_at", d);
  if (error) throw error;
  for (const r of data ?? []) {
    const v = r.classifier_version as string;
    versions[v] = (versions[v] ?? 0) + 1;
  }
  console.log(`\n${d}:`);
  for (const [v, n] of Object.entries(versions).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.padEnd(40)}  ${n}`);
  }
}
