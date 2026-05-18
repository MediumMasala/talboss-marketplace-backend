/**
 * Dump today's tal.users (enriched) to a CSV at the project root.
 * Usage:  npx tsx --env-file=.env.local scripts/export-tal-csv.ts [YYYY-MM-DD]
 */
import { fetchTalUsers } from "../src/metabase.js";
import { writeFileSync } from "node:fs";

const dateISO = process.argv[2] ?? new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 10);

const rows = await fetchTalUsers(dateISO);
console.log(`Fetched ${rows.length} tal.users rows for ${dateISO}`);

if (rows.length === 0) {
  console.log("Nothing to write.");
  process.exit(0);
}

const columns = Object.keys(rows[0]);
const escape = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const lines = [columns.join(",")];
for (const r of rows) {
  lines.push(columns.map((c) => escape((r as Record<string, unknown>)[c])).join(","));
}

const path = `/Users/yashshah/Desktop/Claude Project/Marketplace Dashboard/tal-users-${dateISO}.csv`;
writeFileSync(path, lines.join("\n"));
console.log(`Wrote ${path}`);
