/**
 * Metabase smoke test.
 *   npx tsx --env-file=.env.local scripts/smoke-metabase.ts [YYYY-MM-DD]
 *
 * Confirms the API key can:
 *   - run Card 348 with date params
 *   - run a native SQL query against db 12
 */
import { fetchRound1Candidates, fetchTalUsers } from "../src/metabase.js";

const dateISO = process.argv[2] ?? "2026-05-17";

async function main() {
  console.log(`[metabase] testing for date=${dateISO}`);

  const r1 = await fetchRound1Candidates(dateISO);
  console.log(`  card 348 (Round 1): ${r1.length} rows`);
  if (r1[0]) {
    const { user_real_name, company_name, job_title, created_at } = r1[0] as Record<string, unknown>;
    console.log(`    sample: ${user_real_name} | ${company_name} | ${job_title} | ${created_at}`);
  }

  const tal = await fetchTalUsers(dateISO);
  console.log(`  tal.users:          ${tal.length} rows`);
  if (tal[0]) {
    const { name, company, role, onboarded_at_ist } = tal[0] as Record<string, unknown>;
    console.log(`    sample: ${name} | ${company} | ${role} | ${onboarded_at_ist}`);
  }

  console.log("metabase smoke OK");
}

main().catch((err) => {
  console.error("metabase smoke FAILED:", err.message);
  process.exit(1);
});
