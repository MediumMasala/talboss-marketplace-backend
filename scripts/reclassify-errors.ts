import { supabase } from "../src/supabase.js";
import { classify } from "../src/classifier.js";

const { data: errored, error } = await supabase
  .from("candidates_daily")
  .select("id, joined_at, dedupe_key, name, company, role, location, raw")
  .like("classifier_version", "%-error");

if (error) throw error;
const rows = errored ?? [];
console.log(`Found ${rows.length} errored rows to re-classify\n`);

let ok = 0;
let fail = 0;
for (const r of rows) {
  try {
    const { output, meta } = await classify({
      name: r.name as string | null,
      company: r.company as string | null,
      role: r.role as string | null,
      location: r.location as string | null,
      raw: r.raw as Record<string, unknown>,
    });
    const upd = await supabase
      .from("candidates_daily")
      .update({
        is_marketplace: output.is_marketplace,
        tier: output.tier,
        reason: output.reason,
        classifier_version: meta.prompt_version,
        classified_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    if (upd.error) throw upd.error;
    ok++;
    process.stdout.write(".");
  } catch (e) {
    fail++;
    process.stdout.write("x");
    console.error(`\n  ${r.id} ${r.dedupe_key}: ${(e as Error).message}`);
  }
}
console.log(`\n\nDone. re-classified=${ok}, still-failed=${fail}`);
