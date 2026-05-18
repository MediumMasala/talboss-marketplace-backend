/**
 * Re-classify every candidates_daily row whose classifier_version is not
 * v2-blr-eng-pm-pedigree. Resumable: re-running picks up where it stopped.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-v2.ts
 *
 * Concurrency 8; web-search-enabled v2 classifier ~5-12s per call.
 * Writes one classification_log row per call for audit.
 */
import { supabase } from "../src/supabase.js";
import { classify } from "../src/classifier.js";
import { env } from "../src/env.js";

const TARGET_VERSION = "v2-blr-eng-pm-pedigree";
const BATCH = 200;
const CONCURRENCY = 8;

interface Row {
  id: number;
  joined_at: string;
  dedupe_key: string;
  name: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  raw: Record<string, unknown>;
}

async function processRow(r: Row): Promise<{ ok: boolean; msg?: string }> {
  try {
    const { output, meta } = await classify({
      name: r.name,
      company: r.company,
      role: r.role,
      location: r.location,
      raw: r.raw,
    });
    const upd = await supabase
      .from("candidates_daily")
      .update({
        is_marketplace: output.is_marketplace,
        tier: output.tier,
        confidence: output.confidence,
        reason: output.reason,
        classifier_version: meta.prompt_version,
        classified_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    if (upd.error) throw upd.error;

    await supabase.from("classification_log").insert({
      joined_at: r.joined_at,
      dedupe_key: r.dedupe_key,
      candidate_id: r.id,
      prompt_version: meta.prompt_version,
      model: meta.model,
      input: { name: r.name, company: r.company, role: r.role, location: r.location },
      output,
      latency_ms: meta.latency_ms,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: (e as Error).message.slice(0, 200) };
  }
}

async function processBatch(rows: Row[]): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= rows.length) return;
      const res = await processRow(rows[i]);
      if (res.ok) {
        ok++;
        process.stdout.write(".");
      } else {
        fail++;
        process.stdout.write("x");
        console.error(`\n  id=${rows[i].id}: ${res.msg}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { ok, fail };
}

async function main() {
  console.log(`Backfill to ${TARGET_VERSION} (model=${env.CLASSIFIER_MODEL})`);
  const startedRun = Date.now();
  let totalOk = 0;
  let totalFail = 0;

  while (true) {
    const { data, error } = await supabase
      .from("candidates_daily")
      .select("id, joined_at, dedupe_key, name, company, role, location, raw")
      .neq("classifier_version", TARGET_VERSION)
      .order("id", { ascending: true })
      .limit(BATCH);

    if (error) throw new Error(`fetch: ${error.message}`);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;

    console.log(`\n[batch] ${rows.length} rows (ids ${rows[0].id}..${rows[rows.length - 1].id})`);
    const { ok, fail } = await processBatch(rows);
    totalOk += ok;
    totalFail += fail;
    const elapsed = Math.round((Date.now() - startedRun) / 1000);
    console.log(`\n[batch] ok=${ok} fail=${fail}; running totals ok=${totalOk} fail=${totalFail} elapsed=${elapsed}s`);
  }

  console.log(`\nDone. Total re-classified=${totalOk}, failed=${totalFail}`);
}

main().catch((err) => {
  console.error("backfill-v2 failed:", err);
  process.exit(1);
});
