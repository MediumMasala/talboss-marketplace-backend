import { supabase } from "../src/supabase.js";
const { count } = await supabase
  .from("candidates_daily")
  .select("*", { count: "exact", head: true })
  .eq("joined_at", "2026-05-20");
console.log("May 20 rows in DB:", count);

const { data } = await supabase
  .from("candidates_daily")
  .select("classified_at")
  .eq("joined_at", "2026-05-20")
  .order("classified_at", { ascending: false })
  .limit(1)
  .single();
console.log("Latest May 20 classified_at:", data?.classified_at);
