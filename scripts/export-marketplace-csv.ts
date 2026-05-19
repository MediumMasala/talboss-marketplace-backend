/**
 * Dump today's marketplace candidates (or any date) to ~/Desktop.
 *   npx tsx --env-file=.env.local scripts/export-marketplace-csv.ts [YYYY-MM-DD]
 */
import { writeFileSync } from "node:fs";
import { supabase } from "../src/supabase.js";

const date = process.argv[2] ?? new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 10);

// Marketplace = is_marketplace=true OR maybes (confidence in low/medium).
const { data, error } = await supabase
  .from("candidates_daily")
  .select("name, company, role, location, tier, confidence, reason, source_table, is_marketplace, raw")
  .eq("joined_at", date)
  .or("is_marketplace.eq.true,confidence.in.(low,medium)")
  .order("is_marketplace", { ascending: false })
  .order("tier", { ascending: true })
  .order("name", { ascending: true });

if (error) throw error;
const rows = data ?? [];
console.log(`Found ${rows.length} marketplace candidates for ${date}`);

const out = rows.map((r) => {
  const raw = (r.raw ?? {}) as Record<string, unknown>;
  const linkedin = (raw.linkedin_url as string | null) ?? (raw.li_public_url as string | null) ?? "";
  const resume = (raw.resume_url as string | null) ?? "";
  return {
    verdict: r.is_marketplace ? "yes" : "maybe",
    confidence: String(r.confidence ?? ""),
    tier: String(r.tier),
    name: String(r.name ?? ""),
    company: String(r.company ?? ""),
    role: String(r.role ?? ""),
    location: String(r.location ?? ""),
    source: String(r.source_table),
    linkedin,
    resume,
    institute: String(raw.institute_name ?? ""),
    li_headline: String(raw.li_headline ?? ""),
    why_marketplace: String(r.reason ?? ""),
  };
});

const cols = Object.keys(out[0] ?? {});
const esc = (s: string) => (/[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = [cols.join(","), ...out.map((r) => cols.map((c) => esc((r as Record<string, string>)[c] ?? "")).join(","))].join("\n");

const path = `/Users/yashshah/Desktop/marketplace-${date}.csv`;
writeFileSync(path, csv);
console.log(`Wrote ${path}`);

// brief breakdown
const yes = out.filter((r) => r.verdict === "yes").length;
const maybe = out.filter((r) => r.verdict === "maybe").length;
console.log(`Verdict: yes=${yes} maybe=${maybe}`);
const counts = { supreme: 0, tier1: 0, tier2: 0, other: 0 };
for (const r of out) counts[r.tier as keyof typeof counts] = (counts[r.tier as keyof typeof counts] ?? 0) + 1;
console.log(`Tier: supreme=${counts.supreme} tier1=${counts.tier1} tier2=${counts.tier2} other=${counts.other}`);
