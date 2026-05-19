/**
 * Classify a sample of real rows with v2 and dump to a CSV on ~/Desktop
 * (NOT in the repo). Use this to spot-check v2 behavior before full backfill.
 *
 *   npx tsx --env-file=.env.local scripts/v2-sample-csv.ts [SIZE]
 *
 * Default SIZE=50, split 25 tal_users + 25 round1.
 */
import { writeFileSync } from "node:fs";
import { supabase } from "../src/supabase.js";
import { classify } from "../src/classifier.js";

const size = parseInt(process.argv[2] ?? "50", 10);
const half = Math.ceil(size / 2);

async function pick(src: string, n: number) {
  const { data } = await supabase
    .from("candidates_daily")
    .select("id, joined_at, name, company, role, location, raw, source_table")
    .eq("source_table", src)
    .gte("joined_at", "2026-05-15")
    .order("id", { ascending: false })
    .limit(n);
  return data ?? [];
}

const rows = [...(await pick("tal_users", half)), ...(await pick("round1_god_table", size - half))];
console.log(`Classifying ${rows.length} sample rows with v2…`);

const CONCURRENCY = 5;
const out: Record<string, string>[] = new Array(rows.length);
let cursor = 0;
let done = 0;
async function worker() {
  while (true) {
    const i = cursor++;
    if (i >= rows.length) return;
    const r = rows[i];
    const raw = r.raw as Record<string, unknown>;
    const base = {
      joined_at: String(r.joined_at),
      source_table: String(r.source_table),
      name: String(r.name ?? ""),
      phone: String(raw.phone ?? raw.phone_number ?? ""),
      current_company: String(r.company ?? ""),
      current_role: String(r.role ?? ""),
      location: String(r.location ?? ""),
      linkedin_url: String(raw.linkedin_url ?? raw.li_public_url ?? ""),
      resume_url: String(raw.resume_url ?? ""),
      li_headline: String(raw.li_headline ?? ""),
      institute_name: String(raw.institute_name ?? ""),
      institute_degree: String(raw.institute_degree ?? ""),
      institute_end_year: String(raw.institute_end_year ?? ""),
      applied_job_round1: String(raw.job_title ?? ""),
      experience_yrs: String(raw.experience ?? ""),
    };
    try {
      const { output, meta } = await classify({
        name: r.name as string | null,
        company: r.company as string | null,
        role: r.role as string | null,
        location: r.location as string | null,
        raw,
      });
      out[i] = {
        ...base,
        v2_is_marketplace: String(output.is_marketplace),
        v2_tier: String(output.tier),
        v2_confidence: String(output.confidence),
        v2_reason: String(output.reason),
        v2_latency_ms: String(meta.latency_ms),
      };
    } catch (e) {
      out[i] = {
        ...base,
        v2_is_marketplace: "ERROR",
        v2_tier: "",
        v2_confidence: "",
        v2_reason: (e as Error).message.slice(0, 300),
        v2_latency_ms: "0",
      };
    }
    done++;
    process.stdout.write(`\r  ${done}/${rows.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log();

const cols = Object.keys(out[0]);
const esc = (s: string) =>
  /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
const csv = [cols.join(","), ...out.map((r) => cols.map((c) => esc(r[c] ?? "")).join(","))].join("\n");

const path = `/Users/yashshah/Desktop/v2-classifier-sample-${new Date().toISOString().slice(0,10)}.csv`;
writeFileSync(path, csv);
console.log(`\nWrote ${out.length} rows to ${path}`);

const mp = out.filter((r) => r.v2_is_marketplace === "true").length;
const hi = out.filter((r) => r.v2_confidence === "high").length;
const md = out.filter((r) => r.v2_confidence === "medium").length;
const lo = out.filter((r) => r.v2_confidence === "low").length;
const er = out.filter((r) => r.v2_is_marketplace === "ERROR").length;
console.log(`\n  marketplace=true:  ${mp}/${out.length}`);
console.log(`  confidence high:   ${hi}`);
console.log(`  confidence medium: ${md}`);
console.log(`  confidence low:    ${lo}`);
console.log(`  errors:            ${er}`);
