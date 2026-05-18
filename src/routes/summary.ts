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

route.get("/", async (c) => {
  const today = istDateMinusDays(0);
  const yesterday = istDateMinusDays(1);

  const { data, error } = await supabase
    .from("daily_aggregates")
    .select("joined_at,total_count,marketplace_count,tier1_supreme_count")
    .in("joined_at", [today, yesterday]);

  if (error) return c.json({ error: error.message }, 500);

  const todayRow = data?.find((r) => r.joined_at === today);
  const yRow = data?.find((r) => r.joined_at === yesterday);

  const t = todayRow ?? { total_count: 0, marketplace_count: 0, tier1_supreme_count: 0 };
  const y = yRow ?? { total_count: 0, marketplace_count: 0, tier1_supreme_count: 0 };

  const resp: SummaryResponse = {
    date: today,
    total: { value: t.total_count, delta: t.total_count - y.total_count },
    marketplace: { value: t.marketplace_count, delta: t.marketplace_count - y.marketplace_count },
    tier1_supreme: { value: t.tier1_supreme_count, delta: t.tier1_supreme_count - y.tier1_supreme_count },
  };
  return c.json(resp);
});

export default route;
