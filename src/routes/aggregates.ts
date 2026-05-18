import { Hono } from "hono";
import { supabase } from "../supabase.js";
import type { AggregateRow } from "../types.js";

const route = new Hono();

route.get("/", async (c) => {
  const daysRaw = c.req.query("days");
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 1), 365);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_aggregates")
    .select("joined_at,total_count,marketplace_count,tier1_supreme_count")
    .gte("joined_at", sinceISO)
    .order("joined_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);

  const rows: AggregateRow[] = (data ?? []).map((r) => ({
    joined_at: r.joined_at,
    total_count: r.total_count,
    marketplace_count: r.marketplace_count,
    tier1_supreme_count: r.tier1_supreme_count,
  }));
  return c.json({ days, rows });
});

export default route;
