import { classify } from "../src/classifier.js";

const cases = [
  { name: "Aanya Sharma", company: "Razorpay", role: "Senior Backend Engineer", location: "Bangalore" },
  { name: "Rahul Mehta", company: "TCS", role: "Java Developer", location: "Bangalore" },
  { name: "Priya Iyer", company: "Goldman Sachs GBS", role: "Operations Analyst", location: "Bangalore" },
  { name: "Sandeep K", company: "Stealth fintech", role: "Founding Engineer", location: "Bangalore" },
  { name: "Mehul J", company: "Wipro", role: "Senior PM", location: "Bangalore" },
];

for (const c of cases) {
  const { output, meta } = await classify({ ...c, raw: {} });
  console.log(
    `${c.name.padEnd(15)} | ${c.company.padEnd(22)} | ${c.role.padEnd(22)} | marketplace=${output.is_marketplace} tier=${output.tier} (${meta.latency_ms}ms)`,
  );
  console.log(`  reason: ${output.reason}`);
}
