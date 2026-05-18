import { supabase } from "../src/supabase.js";

const dates = ["2026-05-11","2026-05-12","2026-05-13","2026-05-14","2026-05-15","2026-05-16","2026-05-17","2026-05-18"];

console.log("date         total  marketplace  t1s   tal  round1  via-rpc");
console.log("-----------  -----  -----------  ---   ---  ------  -------");

for (const d of dates) {
  const { count } = await supabase
    .from("candidates_daily")
    .select("*", { count: "exact", head: true })
    .eq("joined_at", d);

  const { data: rpc } = await supabase.rpc("daily_breakdown", {
    start_date: d,
    end_date: d,
  });
  const r = (rpc as any[])?.[0];

  console.log(
    `${d}   ${String(count ?? 0).padStart(5)}  ${r ? String(r.marketplace).padStart(11) : "       n/a"}  ${r ? String(r.tier1_supreme).padStart(3) : "n/a"}  ${r ? String(r.tal_users).padStart(3) : "n/a"}  ${r ? String(r.round1).padStart(6) : "   n/a"}  ${r ? "yes" : "no"}`,
  );
}
