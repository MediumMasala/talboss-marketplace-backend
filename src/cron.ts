import { env } from "./env.js";
import { supabase } from "./supabase.js";
import { fetchRound1Candidates, fetchTalUsers } from "./metabase.js";
import { mergeUnique, normalizeRound1, normalizeTalUser } from "./dedupe.js";
import { classify } from "./classifier.js";
import type { ClassifiedCandidate, Tier } from "./types.js";

/**
 * Ingestion job. Runs every 30 min; defaults to today's IST date so the
 * dashboard reflects intake as it flows in.
 * Override with `INGEST_DATE=YYYY-MM-DD npm run cron` for backfill.
 */

function istDateMinusDays(days: number): string {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: env.INGEST_TZ }));
  ist.setDate(ist.getDate() - days);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function run() {
  const dateISO = process.env.INGEST_DATE ?? istDateMinusDays(0);
  console.log(`[ingest] date=${dateISO} tz=${env.INGEST_TZ}`);

  const [round1Raw, talRaw] = await Promise.all([
    fetchRound1Candidates(dateISO),
    fetchTalUsers(dateISO),
  ]);
  console.log(`[ingest] round1=${round1Raw.length} tal_users=${talRaw.length}`);

  const round1 = round1Raw.map((r) => normalizeRound1(r, dateISO));
  const tal = talRaw.map((r) => normalizeTalUser(r, dateISO));
  const allMerged = mergeUnique(round1, tal);
  console.log(`[ingest] unique_candidates=${allMerged.length}`);

  // Skip-existing: only classify (joined_at, dedupe_key) pairs not yet in DB.
  const { data: existingRows, error: existingErr } = await supabase
    .from("candidates_daily")
    .select("dedupe_key")
    .eq("joined_at", dateISO);
  if (existingErr) throw new Error(`fetch existing: ${existingErr.message}`);
  const existingKeys = new Set((existingRows ?? []).map((r) => r.dedupe_key as string));
  const merged = allMerged.filter((c) => !existingKeys.has(c.dedupe_key));
  const skipped = allMerged.length - merged.length;
  console.log(`[ingest] skipped_existing=${skipped} to_classify=${merged.length}`);

  const CONCURRENCY = 8;
  const classified: ClassifiedCandidate[] = new Array(merged.length);
  const logRows: {
    joined_at: string;
    dedupe_key: string;
    prompt_version: string;
    model: string;
    input: unknown;
    output: unknown;
    latency_ms: number;
  }[] = new Array(merged.length);

  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= merged.length) return;
      const c = merged[i];
      try {
        const { output, meta } = await classify({
          name: c.name,
          company: c.company,
          role: c.role,
          location: c.location,
          raw: c.raw,
        });
        classified[i] = {
          ...c,
          is_marketplace: output.is_marketplace,
          tier: output.tier,
          confidence: output.confidence,
          reason: output.reason,
          classifier_version: meta.prompt_version,
        };
        logRows[i] = {
          joined_at: dateISO,
          dedupe_key: c.dedupe_key,
          prompt_version: meta.prompt_version,
          model: meta.model,
          input: { name: c.name, company: c.company, role: c.role, location: c.location },
          output,
          latency_ms: meta.latency_ms,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[ingest] classify failed for ${c.dedupe_key}: ${msg}`);
        classified[i] = {
          ...c,
          is_marketplace: false,
          tier: "other",
          confidence: "low",
          reason: `classifier error: ${msg.slice(0, 200)}`,
          classifier_version: `${env.CLASSIFIER_PROMPT_VERSION}-error`,
        };
        logRows[i] = {
          joined_at: dateISO,
          dedupe_key: c.dedupe_key,
          prompt_version: `${env.CLASSIFIER_PROMPT_VERSION}-error`,
          model: env.CLASSIFIER_MODEL,
          input: { name: c.name, company: c.company, role: c.role, location: c.location },
          output: { error: msg },
          latency_ms: 0,
        };
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (classified.length) {
    const { error } = await supabase
      .from("candidates_daily")
      .upsert(
        classified.map((c) => ({
          joined_at: c.joined_at,
          source_table: c.source_table,
          dedupe_key: c.dedupe_key,
          grapevine_id: c.grapevine_id,
          phone: c.phone,
          email: c.email,
          name: c.name,
          company: c.company,
          role: c.role,
          location: c.location,
          raw: c.raw,
          is_marketplace: c.is_marketplace,
          tier: c.tier,
          confidence: c.confidence,
          reason: c.reason,
          classifier_version: c.classifier_version,
        })),
        { onConflict: "joined_at,dedupe_key" },
      );
    if (error) throw new Error(`candidates_daily upsert failed: ${error.message}`);
  }

  if (logRows.length) {
    const { error } = await supabase.from("classification_log").insert(logRows);
    if (error) console.warn(`[ingest] classification_log insert: ${error.message}`);
  }

  // Recount aggregates from DB so skipped-existing rows still count.
  const { data: allForDate, error: aggCountErr } = await supabase
    .from("candidates_daily")
    .select("is_marketplace, tier")
    .eq("joined_at", dateISO);
  if (aggCountErr) throw new Error(`daily aggregates fetch: ${aggCountErr.message}`);
  const total = allForDate?.length ?? 0;
  const marketplace = (allForDate ?? []).filter((r) => r.is_marketplace).length;
  const tier1Supreme = (allForDate ?? []).filter(
    (r) => r.is_marketplace && (r.tier === "tier1" || r.tier === "supreme"),
  ).length;

  const { error: aggError } = await supabase.from("daily_aggregates").upsert(
    {
      joined_at: dateISO,
      total_count: total,
      marketplace_count: marketplace,
      tier1_supreme_count: tier1Supreme,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "joined_at" },
  );
  if (aggError) throw new Error(`daily_aggregates upsert failed: ${aggError.message}`);

  console.log(`[ingest] done date=${dateISO} new=${classified.length} total=${total} marketplace=${marketplace} t1s=${tier1Supreme}`);
}

run().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exit(1);
});

export { run };
