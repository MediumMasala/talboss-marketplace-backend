import { supabase } from "../src/supabase.js";
import { classify } from "../src/classifier.js";

// Pick a mix of recent rows: 3 from tal_users + 2 from round1
const { data: tal } = await supabase
  .from("candidates_daily")
  .select("name, company, role, location, raw")
  .eq("source_table", "tal_users")
  .eq("joined_at", "2026-05-17")
  .limit(3);

const { data: round1 } = await supabase
  .from("candidates_daily")
  .select("name, company, role, location, raw")
  .eq("source_table", "round1_god_table")
  .eq("joined_at", "2026-05-17")
  .limit(2);

const rows = [...(tal ?? []), ...(round1 ?? [])];
console.log(`Testing v2 classifier on ${rows.length} real rows\n`);

for (const r of rows) {
  const started = Date.now();
  try {
    const { output, meta } = await classify({
      name: r.name as string | null,
      company: r.company as string | null,
      role: r.role as string | null,
      location: r.location as string | null,
      raw: r.raw as Record<string, unknown>,
    });
    console.log(
      `${(r.name as string ?? "?").padEnd(28)} | ${(r.company as string ?? "—").slice(0, 28).padEnd(28)} | market=${output.is_marketplace} tier=${output.tier} conf=${output.confidence} (${meta.latency_ms}ms)`,
    );
    console.log(`  reason: ${output.reason}\n`);
  } catch (e) {
    console.log(`${r.name}: ERROR — ${(e as Error).message.slice(0, 200)}  (${Date.now() - started}ms)\n`);
  }
}
