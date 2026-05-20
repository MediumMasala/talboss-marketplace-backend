import { Hono } from "hono";
import { supabase } from "../supabase.js";
import type { AggregateRow } from "../types.js";

const route = new Hono();

interface RpcRow {
  joined_at: string;
  total: number;
  marketplace: number;
  marketplace_tal: number;
  marketplace_round1: number;
  tier1_supreme: number;
  tal_users: number;
  round1: number;
}

route.get("/", async (c) => {
  const daysRaw = c.req.query("days");
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 1), 365);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString().slice(0, 10);
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("daily_breakdown", {
    start_date: sinceISO,
    end_date: todayISO,
  });

  if (error) return c.json({ error: error.message }, 500);

  const rows: AggregateRow[] = ((data ?? []) as RpcRow[]).map((r) => ({
    joined_at: r.joined_at,
    total_count: r.total,
    marketplace_count: r.marketplace,
    marketplace_tal_count: r.marketplace_tal,
    marketplace_round1_count: r.marketplace_round1,
    tier1_supreme_count: r.tier1_supreme,
    tal_users_count: r.tal_users,
    round1_count: r.round1,
  }));

  return c.json({ days, rows });
});

export default route;
