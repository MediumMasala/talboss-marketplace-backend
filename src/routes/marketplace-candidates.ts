import { Hono } from "hono";
import { supabase } from "../supabase.js";
import { env } from "../env.js";
import type { MarketplaceCandidateRow } from "../types.js";

const route = new Hono();

function todayIST(): string {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: env.INGEST_TZ }));
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

route.get("/", async (c) => {
  const dateRaw = c.req.query("date");
  const dateISO = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayIST();

  const { data, error } = await supabase
    .from("candidates_daily")
    .select("name,company,role,tier,reason,joined_at")
    .eq("joined_at", dateISO)
    .eq("is_marketplace", true)
    .order("name", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);

  const rows: MarketplaceCandidateRow[] = (data ?? []) as MarketplaceCandidateRow[];
  return c.json({ date: dateISO, rows });
});

export default route;
