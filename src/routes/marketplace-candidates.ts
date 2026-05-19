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

function pickLinkedIn(raw: Record<string, unknown>): string | null {
  const candidates = [
    raw["linkedin_url"],
    raw["li_public_url"],
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  return null;
}

function pickResume(raw: Record<string, unknown>): string | null {
  const v = raw["resume_url"];
  return typeof v === "string" && v.startsWith("http") ? v : null;
}

route.get("/", async (c) => {
  const dateRaw = c.req.query("date");
  const dateISO = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayIST();

  // Marketplace tab: confident yeses (any tier — supreme/tier1/tier2)
  // + medium "maybes". Drops low-confidence noise.
  //   (is_marketplace=true AND confidence='high')
  //   OR confidence='medium'
  const { data, error } = await supabase
    .from("candidates_daily")
    .select("name, company, role, confidence, tier, reason, joined_at, raw, is_marketplace")
    .eq("joined_at", dateISO)
    .or("and(is_marketplace.eq.true,confidence.eq.high),confidence.eq.medium")
    .order("name", { ascending: true })
    .limit(10000);

  if (error) return c.json({ error: error.message }, 500);

  const rows: MarketplaceCandidateRow[] = (data ?? []).map((r) => ({
    name: r.name as string | null,
    company: r.company as string | null,
    role: r.role as string | null,
    linkedin_url: pickLinkedIn((r.raw ?? {}) as Record<string, unknown>),
    resume_url: pickResume((r.raw ?? {}) as Record<string, unknown>),
    confidence: (r.confidence as "high" | "medium" | "low" | null) ?? null,
    reason: r.reason as string,
    joined_at: r.joined_at as string,
  }));

  return c.json({ date: dateISO, rows });
});

export default route;
