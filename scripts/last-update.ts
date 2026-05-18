import { supabase } from "../src/supabase.js";

const today = "2026-05-18";

const { data: latest } = await supabase
  .from("candidates_daily")
  .select("classified_at")
  .eq("joined_at", today)
  .order("classified_at", { ascending: false })
  .limit(1)
  .single();

const { data: latestLog } = await supabase
  .from("classification_log")
  .select("created_at")
  .eq("joined_at", today)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();

const { count } = await supabase
  .from("candidates_daily")
  .select("*", { count: "exact", head: true })
  .eq("joined_at", today);

const nowIst = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
const lastIst = latest ? new Date(latest.classified_at).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }) : "—";
const logIst = latestLog ? new Date(latestLog.created_at).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }) : "—";

console.log(`Now (IST):                          ${nowIst}`);
console.log(`Latest candidates_daily update:     ${lastIst}`);
console.log(`Latest classification_log entry:    ${logIst}`);
console.log(`Total rows for ${today}:           ${count}`);
