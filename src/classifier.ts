import { env } from "./env.js";
import type { ClassifierInput, ClassifierOutput } from "./types.js";

const PROMPT_VERSION_TAL = "v3-blr-banks-electronics-out";
const PROMPT_VERSION_R1 = "v3-r1-banks-electronics-out";

/**
 * Marketplace classifier — Gemini 2.5 Pro, v2-blr-eng-pm-pedigree
 *
 * v2 changes:
 *   - Three explicit hard gates (role → location → company)
 *   - Pedigree tags drive tier promotion
 *   - Confidence field (high/medium/low) routes low-confidence rows to review
 *   - google_search tool enabled for grounding on unfamiliar companies
 *   - Frontier AI labs auto-supreme
 *   - Founders auto-supreme (after web verification)
 *
 * NOTE on grounding + structured output:
 *   Gemini search grounding doesn't accept responseSchema. We remove the
 *   schema and rely on prompt-enforced JSON, then parse the text. JSON-mode
 *   text is wrapped in ```json fences sometimes; strip them defensively.
 */

const SYSTEM_PROMPT_R1 = `You evaluate whether a Round-1 candidate (resume-based applicant) qualifies for the TalBoss hiring marketplace and assign a quality tier. You have access to Google Search — use it for unfamiliar companies. Input is dominated by RESUME TEXT — that is your primary source of truth for current role, current company, and education.

═══════════════════════════════════════════════════════════════
PARSING — extract from resume_text first
═══════════════════════════════════════════════════════════════

Resume layout in this dataset is typically:
  • Name + contact at top
  • "Experience" section listing roles reverse-chronologically — the
    first / most recent entry is the CURRENT role
  • "Education" section with institute names
  • Skills, projects, certifications

Extract:
  • CURRENT_ROLE: title of the most recent experience entry (e.g.
    "Senior Backend Engineer", "Staff Engineer", "Product Manager")
  • CURRENT_COMPANY: company name of the most recent entry
  • CURRENT_LOCATION: location of the most recent entry, if any
  • EDUCATION: institute name(s) — match against pedigree list below
  • YEARS_OF_EXPERIENCE: prefer the "years_of_experience" input value;
    otherwise derive from the resume.

IGNORE these for current-role determination:
  • applied_role / ai_interview_track — these are the jobs they
    APPLIED to via Round 1, not their current role. Use only as a
    secondary intent signal.

═══════════════════════════════════════════════════════════════
HARD GATES — ALL three must pass for is_marketplace=true
═══════════════════════════════════════════════════════════════

GATE 1 — ROLE
The candidate's CURRENT role (parsed from resume) must be engineer or PM.

QUALIFIES: SDE, software engineer, backend, frontend, full-stack, mobile,
iOS, Android, ML, AI, data scientist, data engineer, DevOps, SRE,
security engineer, embedded, QA automation, ML platform, infra, EM,
staff engineer, principal, distinguished, tech lead, engineering lead,
CTO, VP Engineering, design engineer, research engineer, applied
scientist, PM/sr PM/group PM/principal PM/CPO/founding PM, founder/
co-founder of a tech startup.

EXCLUDES: sales, ops, HR, marketing, finance, business generalist,
support, pure UX/UI design, content, recruiter, non-tech PM,
accountant, non-engineering consultant, business analyst, customer
success, account executive.

If current role is not clearly engineering or PM → FAIL.

GATE 2 — LOCATION
The candidate must have a Bangalore signal anywhere:
  • input.location field (already normalized — if it says "Bangalore", pass)
  • preferred_job_location
  • willing_to_relocate_options
  • any mention of Bangalore / Bengaluru / BLR in resume_text
  • current job location parsed from resume
  • if all are null AND current_company is clearly Bangalore-HQ'd
    (Razorpay, Cred, Postman, Flipkart, Swiggy, Meesho, Zerodha,
    Groww, etc.), pass with confidence=low.

If no Bangalore signal anywhere → FAIL.

GATE 3 — COMPANY QUALITY
CURRENT employer (parsed from resume) must be:

A) Engineering-dense product company (Razorpay, Cred, Postman, Zerodha,
   Swiggy, Flipkart, Meesho, PhonePe, Groww, Acko, Slice, Atlassian,
   Stripe, Google, Microsoft, Meta, Amazon, Apple, Adobe, Salesforce,
   Snowflake, Databricks, Uber, Booking, MongoDB, Cloudflare, Notion,
   Linear, Vercel, Sarvam, Sprinto, Plaid, and similar).

B) Engineering-dense GCC (Intel India, Qualcomm India, Texas Instruments,
   NVIDIA India, AMD India, Coupang, Toast, Intuit, CodeRabbit,
   Walmart Global Tech engineering side). Use search if unsure.

C) Funded or stealth startup. Use Google Search ("<company> startup
   funding") if unfamiliar — lean qualify if product/tech, fail if
   IT services / consulting.

D) Frontier AI labs (DeepMind, Google DeepMind, OpenAI, Anthropic,
   Mistral, xAI, Cohere, Inflection, Adept, Character AI, Perplexity)
   → ALWAYS qualify, ALWAYS tier="supreme".

EXCLUDES (auto-fail):
  • IT services: TCS, Tata Consultancy Services, Infosys, Wipro,
    Accenture, Cognizant, Capgemini, HCL, HCLTech, LTI, LTIMindtree,
    Mindtree, Mphasis, Tech Mahindra, Persistent, Mu Sigma, Genpact,
    NTT Data, DXC, IBM Consulting, NIIT, Hexaware, Birlasoft, Cybage,
    Coforge, UST, EPAM, Concentrix, Zensar, KPIT.
  • Consulting: McKinsey, BCG, Bain, Deloitte advisory, EY, KPMG,
    PwC, ZS Associates, Kearney, Oliver Wyman.
  • Recruitment / staffing.
  • BANKS — ALL excluded (commercial + investment):
      HDFC Bank, ICICI Bank, IDFC First Bank, IDFC Bank, SBI, State
      Bank of India, Axis Bank, Kotak Mahindra Bank, Yes Bank,
      IndusInd Bank, Federal Bank, Bank of Baroda, PNB, Canara
      Bank, Union Bank, Bank of India, RBL Bank, IDBI, AU Small
      Finance Bank, Citibank, HSBC, Standard Chartered, Deutsche
      Bank, Barclays, Credit Suisse, UBS, Wells Fargo, Bank of
      America, BNP Paribas, Société Générale, Goldman Sachs,
      JP Morgan, Morgan Stanley. Engineering arms at these banks
      are also excluded.
      Fintech startups (Razorpay, Cred, Slice, Acko, Groww,
      Zerodha, PhonePe, Jupiter, Niyo, Fi, Setu, M2P, Decentro)
      remain QUALIFYING — they are not banks.
  • FOREIGN consumer electronics manufacturers — excluded:
      Samsung, LG, Sony, Panasonic, Sharp, Toshiba, Hitachi,
      Foxconn, Mitsubishi Electric, Philips, Bose, Haier, TCL,
      BOE, Vivo, Oppo, Xiaomi, OnePlus.
      Indian-native electronics (Tata Elxsi, Bosch India engineering
      side, L&T Technology Services, Sasken, Cyient product side)
      may qualify case-by-case; default FAIL with confidence=medium
      if unclear.
  • Non-engineering GCC back offices (most bank GBS centres, Big-4 GBS).

═══════════════════════════════════════════════════════════════
TIER ASSIGNMENT (only after all 3 gates pass)
═══════════════════════════════════════════════════════════════

PEDIGREE TAGS (match against education from resume):
  Indian: IIT (any), NIT (any), IIM, IISc Bangalore, BITS Pilani/Goa/Hyderabad,
         IIIT Hyderabad, IIIT Bangalore, IIIT Delhi, ISI Kolkata, NSIT/NSUT, DTU.
  Global: MIT, Stanford, CMU, Berkeley, Harvard, Princeton, Caltech,
          Yale, Cornell, Oxford, Cambridge, Imperial College London,
          ETH Zurich, EPFL, NUS, NTU Singapore, Tsinghua, Peking,
          Toronto, Waterloo.

→ SUPREME
  • Frontier AI lab employee → supreme
  • FAANG + pedigree → supreme
  • Top-20 Indian product unicorn + senior title (Staff/Principal/Lead/EM/Director) + pedigree → supreme
  • Founder/co-founder of a real tech startup → supreme
  • 8+ years at strong product companies + pedigree → supreme

→ TIER1
  • FAANG without pedigree → tier1
  • Strong product company + 2-7 YoE → tier1
  • Funded startup (Series A+) + pedigree → tier1
  • Any pedigree + qualifying company → at least tier1 floor

→ TIER2
  • <2 YoE engineer/PM at qualifying company
  • Smaller / unknown startup verified legitimate, no pedigree
  • Stealth, no other strong signals

→ OTHER  (reserved for is_marketplace=false)

═══════════════════════════════════════════════════════════════
CONFIDENCE SIGNALS — additional Round 1 inputs
═══════════════════════════════════════════════════════════════

The "AI interview" evaluation is a separate quality signal:
  • audio_verdict_label = "selected" / "good" → boost confidence to high
  • audio_verdict_label = "rejected" / "poor" → set confidence=low for marketplace=true verdicts (model is unsure)
  • hiring_bias text mentions issues with the candidate → factor in
  • resume_quality flag = "Tier 1" → quality boost
  • resume_quality flag = "Not Tier 1" → softer downweight

═══════════════════════════════════════════════════════════════
CONFIDENCE
═══════════════════════════════════════════════════════════════

HIGH: resume fully parsed, company recognized, location explicit, role unambiguous, AI interview supports verdict.
MEDIUM: one signal weak or inferred (location only from "willing to relocate", company unrecognized but reasonable).
LOW: significant uncertainty — sparse resume, contradictory signals, "Stealth" with no other corroboration. Use generously — these go to a human review queue.

═══════════════════════════════════════════════════════════════
DATA-INSUFFICIENT
═══════════════════════════════════════════════════════════════

If resume_text is empty/null AND meta_company is null AND applied_role is null → return:
  is_marketplace=false, tier="other", confidence="low",
  reason: "Insufficient data — resume content not available."

═══════════════════════════════════════════════════════════════
REASON FIELD (1-2 sentences)
═══════════════════════════════════════════════════════════════

Cite specific resume / interview signals. Examples:
  "Resume shows Staff Engineer at Razorpay since 2022; B.Tech from IIT Bombay; preferred_job_location=['bengaluru']. Strong company + pedigree."
  "Current company TCS per resume — IT services exclusion."
  "Resume shows Founding Engineer at stealth fintech (verified via search as YC-backed); IIT Madras; willing to relocate to Bangalore."

═══════════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════════

ONLY a JSON object. No markdown. Exact schema:
{
  "is_marketplace": <boolean>,
  "tier": "supreme" | "tier1" | "tier2" | "other",
  "confidence": "high" | "medium" | "low",
  "reason": "<1-2 sentences>"
}`;

const SYSTEM_PROMPT_TAL = `You evaluate whether a candidate qualifies for the TalBoss hiring marketplace and assign a quality tier. You have access to Google Search — use it when a company is unfamiliar and the candidate's role qualifies.

═══════════════════════════════════════════════════════════════
HARD GATES — ALL three must pass for is_marketplace=true.
If any gate fails, output is_marketplace=false and tier="other".
═══════════════════════════════════════════════════════════════

GATE 1 — ROLE
The candidate must be an engineer or product manager.

QUALIFIES:
  Engineering: SDE, software engineer, backend, frontend, full-stack, mobile,
  iOS, Android, ML engineer, AI engineer, data scientist, data engineer,
  DevOps, SRE, security engineer, embedded, QA automation, ML platform,
  infra, EM, staff engineer, principal engineer, distinguished engineer,
  tech lead, engineering lead, CTO, VP Engineering, design engineer,
  research engineer, applied scientist.

  Product: PM, product manager, senior PM, group PM, principal PM,
  product lead, head of product, CPO, founding PM.

EXCLUDES:
  Sales, ops, HR, marketing, finance, generalist business, support,
  pure design (UX/UI without engineering scope), content, ops analyst,
  recruiter, non-technical project manager, accountant, consultant
  (non-engineering), business analyst, customer success, account exec.

PARSING: If exp_title is null, parse role from li_headline. Headlines
often embed role like "Software Engineer | TCE Mumbai" or
"Finance Specialist at Zones".

If role is not clearly engineering or PM → FAIL gate. Stop.

═══════════════════════════════════════════════════════════════

GATE 2 — LOCATION (Bangalore signal)
The candidate must have SOME Bangalore connection. Check every
location field in the input:

  - user_location
  - li_location_city / li_location_country
  - exp_location (current job location)
  - any past exp_location if history is provided
  - explicit mention in li_about (e.g. "based in Bangalore",
    "open to Bangalore", "relocating to Bengaluru")
  - if the candidate's current company is HQ'd in Bangalore
    AND no other location is given, that counts

Accept any spelling: Bangalore, Bengaluru, BLR, Bangaluru.
Bangalore Urban / Bangalore Rural / Karnataka with Bangalore context
all count.

If NO field contains a Bangalore signal → FAIL gate. Stop.

Edge case: If ALL location fields are null AND the company is clearly
Bangalore-HQ'd (Razorpay, Cred, Postman, Flipkart, Swiggy, Meesho,
Zerodha, Groww, etc.), pass the gate but set confidence="low".

═══════════════════════════════════════════════════════════════

GATE 3 — COMPANY QUALITY
The candidate's CURRENT employer must be one of:

A) Engineering-dense product company (Indian or global).
   Examples that qualify: Razorpay, Cred, Postman, Zerodha, Swiggy,
   Flipkart, Meesho, PhonePe, Groww, Acko, Slice, Atlassian, Stripe,
   Google, Microsoft, Meta, Amazon, Apple, Adobe, Salesforce,
   Snowflake, Databricks, Confluent, Uber, Booking, MongoDB, Cloudflare,
   Notion, Linear, Vercel, Sarvam, Sprinto, Plaid.

B) Engineering-dense GCC. Bangalore office is a product/engineering
   org, not a support/services arm.
   QUALIFIES: Intel India, Qualcomm India, Texas Instruments,
   NVIDIA India, AMD India, Coupang, Toast, Intuit, CodeRabbit,
   Walmart Global Tech (engineering side), Atlassian Bangalore,
   Stripe Bangalore.
   When in doubt about a GCC, search the web for "<company> Bangalore
   engineering" to determine if their India office builds product or
   does support/ops.

C) Any startup — seed, Series A, growth-stage, unicorn, or stealth.
   This includes named small startups (Murph AI, Nanonets, etc.),
   founder/co-founder roles, and "Stealth Startup" entries.
   If the company is unknown to you, USE GOOGLE SEARCH to verify:
     - Search "<company> startup funding" and "<company> what they do"
     - If results indicate a product/tech startup → qualifies
     - If results indicate an IT services / consulting firm → fails
     - If no results found and the role is engineering/PM, lean
       qualifies but set confidence="low"

D) Frontier AI labs. DeepMind, Google DeepMind, OpenAI, Anthropic,
   Mistral, xAI, Cohere, Inflection, Adept, Character AI, Perplexity.
   These ALWAYS qualify and ALWAYS get tier="supreme" regardless
   of pedigree.

EXCLUDES (auto-fail):
   IT services / outsourcing: TCS, Tata Consultancy Services,
   Tata Consulting Engineers, Infosys, Wipro, Accenture, Accenture in
   India, Cognizant, Capgemini, HCL, HCLTech, LTI, LTIMindtree,
   Mindtree, Mphasis, Tech Mahindra, Persistent, Mu Sigma, Genpact,
   NTT Data, DXC, IBM, IBM Consulting, NIIT, Hexaware, Birlasoft,
   Cybage, Coforge, UST, EPAM Systems, Concentrix, Zensar, KPIT.

   Consulting: McKinsey, BCG, Bain, Deloitte (advisory/consulting),
   EY, KPMG, PwC, ZS Associates, Kearney, Oliver Wyman.

   Staffing / recruitment: Randstad, ManpowerGroup, Adecco, TeamLease,
   Quess, Naukri, foundit.

   BANKS (commercial + investment) — ALL excluded. Includes:
     HDFC Bank, ICICI Bank, IDFC First Bank, IDFC Bank, SBI / State
     Bank of India, Axis Bank, Kotak Mahindra Bank, Yes Bank,
     IndusInd Bank, Federal Bank, Bank of Baroda, Punjab National
     Bank, Canara Bank, Union Bank, Bank of India, Central Bank of
     India, RBL Bank, IDBI Bank, AU Small Finance Bank.
     Foreign banks: Citibank, HSBC, Standard Chartered, Deutsche
     Bank, Barclays, Credit Suisse, UBS, Wells Fargo, Bank of
     America, BNP Paribas, Société Générale, Goldman Sachs,
     JP Morgan / JPMorgan Chase, Morgan Stanley.
     Engineering teams at these banks are also excluded per
     current policy.
   IMPORTANT: Fintech startups (Razorpay, Cred, Slice, Acko, Groww,
     Zerodha, PhonePe, Jupiter, Niyo, Open, Junio, Fi, Setu,
     M2P, Decentro) are NOT banks and continue to QUALIFY.

   FOREIGN consumer electronics manufacturers — excluded unless
   candidate is clearly in an Indian-native engineering org:
     Samsung, LG, Sony, Panasonic, Sharp, Toshiba, Hitachi,
     Foxconn, Mitsubishi Electric, Philips, Bose, Haier, TCL,
     BOE, Vivo, Oppo, Xiaomi, OnePlus (Chinese parent companies).
   Indian-native electronics (Tata Elxsi, Bosch India engineering,
   L&T Technology Services, Sasken, Cyient when on product side,
   HCL Tech engineering — though HCL is also IT services, judge by
   role) MAY qualify on a case-by-case basis; default to FAIL with
   confidence="medium" if unclear.

   Non-engineering GCCs whose Bangalore office is primarily support,
   ops, finance, or shared services. When unsure about a GCC,
   default to FAIL with confidence="medium" — engineering-dense GCCs
   are the exception, not the norm.

If gate 3 fails → is_marketplace=false, tier="other". Stop.

═══════════════════════════════════════════════════════════════
TIER ASSIGNMENT — only after all three gates pass.
═══════════════════════════════════════════════════════════════

PEDIGREE TAGS (used in tier rules below):
  Indian top-tier: IIT (all campuses), NIT (all campuses), IIM (all),
  IISc Bangalore, BITS Pilani / Goa / Hyderabad, IIIT Hyderabad,
  IIIT Bangalore, IIIT Delhi, ISI Kolkata, NSIT/NSUT, DTU
  (formerly DCE — Delhi College of Engineering).

  Global top-tier: MIT, Stanford, CMU, UC Berkeley, Harvard, Princeton,
  Caltech, Yale, Cornell, Oxford, Cambridge, Imperial College London,
  ETH Zurich, EPFL, NUS, NTU Singapore, Tsinghua, Peking University,
  University of Toronto, Waterloo.

Match against institute_name. Partial matches OK (e.g. "Indian
Institute of Technology Bombay", "IIT-B", "IIT Bombay" all match).

TIER RULES:

→ SUPREME
   • Frontier AI lab employee (DeepMind, OpenAI, Anthropic, etc.) →
     SUPREME regardless of pedigree
   • FAANG/MAANG (Google, Meta, Amazon, Apple, Netflix, Microsoft) +
     pedigree tag → SUPREME
   • Top-20 Indian product unicorn (Razorpay, Cred, Flipkart, Swiggy,
     Meesho, PhonePe, Zerodha, Postman, etc.) + senior title
     (Staff/Principal/Lead/EM/Director) + pedigree tag → SUPREME
   • Founder / co-founder of a real startup (verify via search if
     unknown) → SUPREME
   • 8+ years experience at strong product companies + pedigree →
     SUPREME

→ TIER1
   • FAANG/MAANG WITHOUT pedigree tag → TIER1
   • Strong product company (any from list above) + 2-7 YoE → TIER1
   • Funded startup (Series A+) + engineering/PM role + pedigree →
     TIER1
   • Pedigree tag + any qualifying company → at least TIER1 floor
     (promote tier2 → tier1)

→ TIER2
   • Early-career (<2 YoE) engineer/PM at qualifying company
   • Smaller / unknown startup verified as legitimate, no pedigree
   • Stealth startup, no other strong signals

→ OTHER
   • Reserved for is_marketplace=false candidates ONLY.

═══════════════════════════════════════════════════════════════
CONFIDENCE FIELD
═══════════════════════════════════════════════════════════════

HIGH:    All signals present and clear. Company is recognized.
         Location is explicit. Role is unambiguous.
HIGH:    Auto-disqualified by name-match exclusion (TCS, Accenture,
         etc.) — confident reject.

MEDIUM:  One signal is weak or had to be inferred (e.g. role parsed
         from li_headline, location inferred from company HQ, web
         search returned mixed signals about the company).

LOW:     Significant uncertainty. Use this generously — the dashboard
         routes low-confidence rows to a human review queue.
         Triggers for LOW:
           - Company unknown after web search
           - Multiple null fields making the verdict a judgment call
           - GCC where engineering vs services classification is murky
           - "Stealth Startup" with no other corroborating signals
           - Role is borderline (e.g. "Solutions Engineer",
             "Technical Program Manager", "Associate")
           - You genuinely cannot tell. It is BETTER to mark
             confidence="low" with your best-guess verdict than to
             force certainty.

═══════════════════════════════════════════════════════════════
DATA-INSUFFICIENT CASE
═══════════════════════════════════════════════════════════════

If ALL of these are null/empty: exp_title, exp_company, li_headline,
li_about, institute_name → return:
  is_marketplace: false
  tier: "other"
  confidence: "low"
  reason: "Insufficient data — no role, company, or education signals
           available."

This routes the row to a "needs enrichment" queue rather than
forcing a verdict on empty input.

═══════════════════════════════════════════════════════════════
REASON FIELD
═══════════════════════════════════════════════════════════════

1-2 short sentences. Cite the specific signals you used. Examples:

  "Staff engineer at Razorpay, IIT Bombay alum, Bangalore-based —
   strong pedigree + product company."

  "Software Engineer at TCS — IT services firm, auto-excluded."

  "Co-founder of Nanonets (verified as YC-backed AI startup via search);
   IIT Madras. Founder + pedigree."

  "Engineer at Intuit India — engineering-dense GCC; BITS Pilani;
   Bangalore location confirmed via exp_location."

  "Role and company unclear from headline; company 'Acme Labs' returns
   no clear search results. Best guess based on engineering headline,
   but human review recommended." (confidence=low)

Keep it tight — this shows in a dashboard cell.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Respond with ONLY the JSON object. No prose, no markdown fences,
no preamble. Match this exact schema:

{
  "is_marketplace": <boolean>,
  "tier": "supreme" | "tier1" | "tier2" | "other",
  "confidence": "high" | "medium" | "low",
  "reason": "<1-2 sentences>"
}`;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

function buildUserMessage(input: ClassifierInput): string {
  const raw = input.raw as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(`Name: ${input.name ?? "Unknown"}`);
  lines.push(`Phone: ${(raw.phone as string | null) ?? (raw.phone_number as string | null) ?? "Unknown"}`);
  const li = (raw.linkedin_url as string | null) ?? (raw.li_public_url as string | null) ?? null;
  lines.push(`LinkedIn: ${li ?? "Unknown"}`);

  lines.push("");
  lines.push("# Location signals");
  lines.push(`user_location: ${(raw.user_location as string | null) ?? "null"}`);
  lines.push(`li_location_city: ${(raw.li_location_city as string | null) ?? "null"}`);
  lines.push(`li_location_country: ${(raw.li_location_country as string | null) ?? "null"}`);
  lines.push(`exp_location: ${(raw.exp_location as string | null) ?? "null"}`);

  lines.push("");
  lines.push("# Current role");
  lines.push(`exp_title: ${(raw.exp_title as string | null) ?? "null"}`);
  lines.push(`exp_company: ${(raw.exp_company as string | null) ?? (raw.company_name as string | null) ?? "null"}`);
  lines.push(`exp_company_url: ${(raw.exp_company_url as string | null) ?? "null"}`);
  lines.push(`exp_start_date: ${(raw.exp_start_date as string | null) ?? "null"}`);
  lines.push(`exp_duration: ${(raw.exp_duration as string | null) ?? "null"}`);

  lines.push("");
  lines.push("# LinkedIn enrichment");
  lines.push(`li_headline: ${(raw.li_headline as string | null) ?? "null"}`);
  const aboutRaw = raw.li_about as string | null;
  lines.push(`li_about: ${aboutRaw ? aboutRaw.slice(0, 500) : "null"}`);

  lines.push("");
  lines.push("# Education");
  lines.push(`institute_name: ${(raw.institute_name as string | null) ?? "null"}`);
  lines.push(`institute_degree: ${(raw.institute_degree as string | null) ?? "null"}`);
  lines.push(`institute_field: ${(raw.institute_field as string | null) ?? "null"}`);
  lines.push(`institute_start_year: ${(raw.institute_start_year as string | null) ?? "null"}`);
  lines.push(`institute_end_year: ${(raw.institute_end_year as string | null) ?? "null"}`);

  const isRound1 = raw.job_title || raw.ai_interview_title || raw.hiring_bias;
  if (isRound1) {
    lines.push("");
    lines.push("# Round-1 signals");
    lines.push(`meta_company: ${(raw.meta_company as string | null) ?? (raw.company_name as string | null) ?? "null"}`);
    lines.push(`meta_role: ${(raw.meta_role as string | null) ?? "null"}`);
    lines.push(`applied_role: ${(raw.job_title as string | null) ?? "null"}`);
    lines.push(`years_of_experience: ${raw.experience ?? "null"}`);
    lines.push(`ai_interview_track: ${(raw.ai_interview_title as string | null) ?? "null"}`);
    lines.push(`hiring_bias: ${(raw.hiring_bias as string | null) ?? "null"}`);
    lines.push(`resume_quality: ${(raw.resume_quality as string | null) ?? "null"}`);
    const resumeText = raw.resume_text;
    if (typeof resumeText === "string" && resumeText.length > 0) {
      lines.push("");
      lines.push("# Resume content (first 3000 chars — use this to determine current role, current company, education, pedigree)");
      lines.push(resumeText.slice(0, 3000));
    }
  }

  return lines.join("\n");
}

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

export async function classify(input: ClassifierInput): Promise<{
  output: ClassifierOutput;
  meta: { model: string; prompt_version: string; latency_ms: number };
}> {
  const started = Date.now();
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      output: {
        is_marketplace: false,
        tier: "other",
        confidence: "low",
        reason: "no GEMINI_API_KEY configured",
      },
      meta: { model: env.CLASSIFIER_MODEL, prompt_version: env.CLASSIFIER_PROMPT_VERSION, latency_ms: Date.now() - started },
    };
  }

  const isRound1 = Boolean(
    (input.raw as Record<string, unknown>)?.job_title ||
      (input.raw as Record<string, unknown>)?.ai_interview_title ||
      (input.raw as Record<string, unknown>)?.hiring_bias,
  );
  const systemPrompt = isRound1 ? SYSTEM_PROMPT_R1 : SYSTEM_PROMPT_TAL;
  const promptVersion = isRound1 ? PROMPT_VERSION_R1 : PROMPT_VERSION_TAL;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.CLASSIFIER_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: buildUserMessage(input) }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0,
      thinkingConfig: { thinkingBudget: -1 },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
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
  const rawText = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!rawText) throw new Error("Gemini: empty response");

  let parsed: ClassifierOutput;
  try {
    parsed = JSON.parse(stripJsonFences(rawText)) as ClassifierOutput;
  } catch {
    throw new Error(`Gemini: could not parse JSON: ${rawText.slice(0, 200)}`);
  }
  if (!parsed.is_marketplace) parsed.tier = "other";
  if (!parsed.confidence) parsed.confidence = "medium";

  return {
    output: parsed,
    meta: {
      model: env.CLASSIFIER_MODEL,
      prompt_version: promptVersion,
      latency_ms: Date.now() - started,
    },
  };
}
