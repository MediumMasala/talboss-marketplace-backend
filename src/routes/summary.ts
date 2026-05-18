import { Hono } from "hono";
import { supabase } from "../supabase.js";
import { env } from "../env.js";
import type { SummaryResponse } from "../types.js";

const route = new Hono();

function istDateMinusDays(days: number): string {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: env.INGEST_TZ }));
  ist.setDate(ist.getDate() - days);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface DayStats {
  total: number;
  marketplace: number;
  tier1_supreme: number;
  tal_users: number;
  round1: number;
}

function emptyStats(): DayStats {
  return { total: 0, marketplace: 0, tier1_supreme: 0, tal_users: 0, round1: 0 };
}

route.get("/", async (c) => {
  const today = istDateMinusDays(0);
  const yesterday = istDateMinusDays(1);

  const { data, error } = await supabase
    .from("candidates_daily")
    .select("joined_at, source_table, is_marketplace, tier")
    .in("joined_at", [today, yesterday]);

  if (error) return c.json({ error: error.message }, 500);

  const buckets: Record<string, DayStats> = { [today]: emptyStats(), [yesterday]: emptyStats() };
  for (const r of data ?? []) {
    const s = buckets[r.joined_at as string];
    if (!s) continue;
    s.total += 1;
    if (r.is_marketplace) {
      s.marketplace += 1;
      if (r.tier === "tier1" || r.tier === "supreme") s.tier1_supreme += 1;
    }
    if (r.source_table === "tal_users" || r.source_table === "both") s.tal_users += 1;
    if (r.source_table === "round1_god_table" || r.source_table === "both") s.round1 += 1;
  }

  const t = buckets[today];
  const y = buckets[yesterday];

  const resp: SummaryResponse = {
    date: today,
    total:         { value: t.total,         delta: t.total - y.total },
    marketplace:   { value: t.marketplace,   delta: t.marketplace - y.marketplace },
    tier1_supreme: { value: t.tier1_supreme, delta: t.tier1_supreme - y.tier1_supreme },
    tal_users:     { value: t.tal_users,     delta: t.tal_users - y.tal_users },
    round1:        { value: t.round1,        delta: t.round1 - y.round1 },
  };
  return c.json(resp);
});

export default route;
