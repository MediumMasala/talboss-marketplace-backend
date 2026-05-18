import { env } from "./env.js";
import type { ClassifierInput, ClassifierOutput } from "./types.js";

/**
 * Marketplace classifier — Gemini Flash, structured JSON output.
 *
 * Definition: a candidate is "marketplace" if they are a Bangalore-based
 * engineer or PM working at a product/engineering company. We explicitly
 * exclude IT services and non-engineering GCC back-offices.
 *
 * Tiers gauge quality within the marketplace; non-marketplace candidates
 * always get tier="other".
 *
 * Bump CLASSIFIER_PROMPT_VERSION whenever the system prompt or schema
 * changes so the audit log stays interpretable.
 */

const SYSTEM_PROMPT = `You evaluate whether a candidate qualifies for the TalBoss hiring marketplace and assign a quality tier.

QUALIFICATION RULES — is_marketplace=true only if ALL three hold:

1. LOCATION: candidate is currently based in Bangalore (Bengaluru), or their preferred location is Bangalore, or they are explicitly willing to relocate to Bangalore. Treat null/unknown location as a soft negative: only mark marketplace if the company is clearly Bangalore-HQ'd.

2. ROLE: candidate works (or applied for a role) in software engineering OR product management. Engineering includes SDE, backend, frontend, full-stack, mobile, ML / AI / data science, devops, SRE, security, embedded, QA automation, ML platform, infra, EM/staff engineer, etc. Product = PM, group PM, principal PM, product lead. EXCLUDE: sales, ops, HR, marketing, finance, generalist business, support, design (UX-only is OK if engineering-adjacent, e.g. design engineer), content, ops analyst, recruiter, project manager (non-PM).

3. COMPANY: their CURRENT employer must be a product / engineering organisation. Specifically EXCLUDE:
   - IT services and outsourcing firms: TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini, HCL, LTI/LTIMindtree, Mindtree, Mphasis, Tech Mahindra, Persistent, Mu Sigma, Genpact, NTT Data, DXC, IBM Consulting, NIIT, Hexaware, Birlasoft, Cybage, Coforge.
   - Non-engineering GCC / GIC / GBS back offices whose Bangalore presence is primarily support, ops, or shared services (e.g. many bank GBS centres, Big-4 GBS, insurance GICs). Intel India, Qualcomm India, Texas Instruments, etc. are GCCs but ARE engineering — these qualify.
   - Pure consulting firms (McKinsey, BCG, Bain, Deloitte advisory, EY, KPMG, PwC).
   - Recruitment / staffing companies.
   Engineering-dense companies qualify. Examples that qualify: Razorpay, Cred, Postman, Zerodha, Swiggy, Flipkart, Meesho, PhonePe, Groww, Acko, Slice, Atlassian, Stripe, Google, Microsoft, Meta, Amazon, Apple, Adobe, Salesforce, Snowflake, Databricks, Confluent, Coupang, Toast, Uber, Booking, Walmart Global Tech (engineering side), Sarvam, Sprinto, Plaid, Notion, Linear, Vercel, Cloudflare, MongoDB.
   For STEALTH / unnamed startups: if role is engineering/PM and other signals look credible, give benefit of the doubt.
   For UNKNOWN small companies you cannot identify: lean marketplace=true only if role + location qualify and the company name does not pattern-match an IT services / consulting / staffing firm.

TIER RULES — assign tier as follows:

- "supreme":  senior+ engineer or PM (typically 5+ years OR staff/principal/lead title) at a top-tier product company (FAANG-equivalent, top-20 Indian product startups, well-funded growth-stage product companies, or AI-first labs). Or unicorn founders.
- "tier1":    solid engineer or PM at a known product company, 2–7 years experience, clearly competent profile.
- "tier2":    junior (<2 years) or mid-level engineer/PM at a smaller or less-known product company. Marketplace-eligible but lower priority.
- "other":    ALL non-marketplace candidates must get tier="other". Do not assign a marketplace tier to a non-marketplace candidate.

OUTPUT: respond ONLY with a JSON object matching the schema. No prose, no markdown.

REASON: 1–2 short sentences citing the specific signals you used (e.g. "Senior backend engineer at Razorpay; Bangalore; well-known fintech engineering org"). If excluding, state the disqualifying signal (e.g. "TCS is an IT services firm — not engineering-dense"). Be concise; this text shows in a dashboard cell.`;

const SCHEMA = {
  type: "object",
  properties: {
    is_marketplace: { type: "boolean" },
    tier: { type: "string", enum: ["supreme", "tier1", "tier2", "other"] },
    reason: { type: "string" },
  },
  required: ["is_marketplace", "tier", "reason"],
} as const;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

function buildUserMessage(input: ClassifierInput): string {
  const raw = input.raw as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(`Name: ${input.name ?? "Unknown"}`);
  lines.push(`Current company: ${input.company ?? "Unknown"}`);
  lines.push(`Current role: ${input.role ?? "Unknown"}`);
  lines.push(`Location: ${input.location ?? "Unknown"}`);

  // Card 348 (Round 1) signals
  const experience = raw.experience;
  const jobTitle = raw.job_title;
  const aiInterviewTitle = raw.ai_interview_title;
  const hiringBias = raw.hiring_bias;
  const resumeQuality = raw.resume_quality;
  if (typeof experience === "number") lines.push(`Years of experience: ${experience}`);
  if (typeof jobTitle === "string") lines.push(`Job they applied to: ${jobTitle}`);
  if (typeof aiInterviewTitle === "string" && aiInterviewTitle !== jobTitle) {
    lines.push(`AI interview track: ${aiInterviewTitle}`);
  }
  if (typeof hiringBias === "string") lines.push(`Hiring bias for the role: ${hiringBias}`);
  if (typeof resumeQuality === "string") lines.push(`Resume quality flag: ${resumeQuality}`);

  // tal.users + LinkedIn enrichment signals
  const liHeadline = raw.li_headline;
  const expDuration = raw.exp_duration;
  const expStart = raw.exp_start_date;
  const instituteName = raw.institute_name;
  const instituteDegree = raw.institute_degree;
  const instituteField = raw.institute_field;
  const instituteEndYear = raw.institute_end_year;
  if (typeof liHeadline === "string") lines.push(`LinkedIn headline: ${liHeadline}`);
  if (typeof expDuration === "string") lines.push(`Current role duration: ${expDuration}`);
  else if (typeof expStart === "string") lines.push(`Current role since: ${expStart}`);
  if (typeof instituteName === "string") {
    const parts = [instituteName];
    if (typeof instituteDegree === "string") parts.push(instituteDegree);
    if (typeof instituteField === "string") parts.push(instituteField);
    if (typeof instituteEndYear === "string") parts.push(`'${instituteEndYear.slice(-2)}`);
    lines.push(`Education: ${parts.join(", ")}`);
  }
  return lines.join("\n");
}

export async function classify(input: ClassifierInput): Promise<{
  output: ClassifierOutput;
  meta: { model: string; prompt_version: string; latency_ms: number };
}> {
  const started = Date.now();
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey) {
    // Fail-open stub so cron still runs in environments without a key.
    return {
      output: { is_marketplace: false, tier: "other", reason: "no GEMINI_API_KEY configured" },
      meta: { model: env.CLASSIFIER_MODEL, prompt_version: env.CLASSIFIER_PROMPT_VERSION, latency_ms: Date.now() - started },
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.CLASSIFIER_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: buildUserMessage(input) }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      // 2.5 Pro requires thinking; -1 lets the model decide budget per call.
      // Flash supports 0 (disabled). Both work without surfacing this in env.
      thinkingConfig: { thinkingBudget: -1 },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as GeminiResponse;
  if (json.error) throw new Error(`Gemini error: ${json.error.message}`);
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini: empty response");

  let parsed: ClassifierOutput;
  try {
    parsed = JSON.parse(rawText) as ClassifierOutput;
  } catch {
    throw new Error(`Gemini: could not parse JSON: ${rawText.slice(0, 200)}`);
  }
  // Defensive normalisation: non-marketplace must be tier="other".
  if (!parsed.is_marketplace) parsed.tier = "other";

  return {
    output: parsed,
    meta: {
      model: env.CLASSIFIER_MODEL,
      prompt_version: env.CLASSIFIER_PROMPT_VERSION,
      latency_ms: Date.now() - started,
    },
  };
}
