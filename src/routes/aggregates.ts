import { Hono } from "hono";
import { supabase } from "../supabase.js";
import type { AggregateRow } from "../types.js";

const route = new Hono();

interface DayStats {
  total_count: number;
  marketplace_count: number;
  tier1_supreme_count: number;
  tal_users_count: number;
  round1_count: number;
}

route.get("/", async (c) => {
  const daysRaw = c.req.query("days");
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 1), 365);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("candidates_daily")
    .select("joined_at, source_table, is_marketplace, tier")
    .gte("joined_at", sinceISO);

  if (error) return c.json({ error: error.message }, 500);

  const buckets: Record<string, DayStats> = {};
  for (const r of data ?? []) {
    const d = r.joined_at as string;
    if (!buckets[d]) {
      buckets[d] = {
        total_count: 0,
        marketplace_count: 0,
        tier1_supreme_count: 0,
        tal_users_count: 0,
        round1_count: 0,
      };
    }
    const b = buckets[d];
    b.total_count += 1;
    if (r.is_marketplace) {
      b.marketplace_count += 1;
      if (r.tier === "tier1" || r.tier === "supreme") b.tier1_supreme_count += 1;
    }
    if (r.source_table === "tal_users" || r.source_table === "both") b.tal_users_count += 1;
    if (r.source_table === "round1_god_table" || r.source_table === "both") b.round1_count += 1;
  }

  const rows: AggregateRow[] = Object.keys(buckets)
    .sort()
    .map((d) => ({ joined_at: d, ...buckets[d] }));

  return c.json({ days, rows });
});

export default route;
