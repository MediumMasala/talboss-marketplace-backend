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

interface DayRow {
  joined_at: string;
  total: number;
  marketplace: number;
  marketplace_tal: number;
  marketplace_round1: number;
  tier1_supreme: number;
  tal_users: number;
  round1: number;
}

const ZERO: Omit<DayRow, "joined_at"> = {
  total: 0,
  marketplace: 0,
  marketplace_tal: 0,
  marketplace_round1: 0,
  tier1_supreme: 0,
  tal_users: 0,
  round1: 0,
};

route.get("/", async (c) => {
  const dateRaw = c.req.query("date");
  const today = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : istDateMinusDays(0);
  const prev = new Date(today);
  prev.setDate(prev.getDate() - 1);
  const yesterday = prev.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("daily_breakdown", {
    start_date: yesterday,
    end_date: today,
  });

  if (error) return c.json({ error: error.message }, 500);

  const rows = (data ?? []) as DayRow[];
  const t = rows.find((r) => r.joined_at === today) ?? { joined_at: today, ...ZERO };
  const y = rows.find((r) => r.joined_at === yesterday) ?? { joined_at: yesterday, ...ZERO };

  const resp: SummaryResponse = {
    date: today,
    total:              { value: t.total,              delta: t.total - y.total },
    marketplace:        { value: t.marketplace,        delta: t.marketplace - y.marketplace },
    marketplace_tal:    { value: t.marketplace_tal,    delta: t.marketplace_tal - y.marketplace_tal },
    marketplace_round1: { value: t.marketplace_round1, delta: t.marketplace_round1 - y.marketplace_round1 },
    tier1_supreme:      { value: t.tier1_supreme,      delta: t.tier1_supreme - y.tier1_supreme },
    tal_users:          { value: t.tal_users,          delta: t.tal_users - y.tal_users },
    round1:             { value: t.round1,             delta: t.round1 - y.round1 },
  };
  return c.json(resp);
});

export default route;
