# TalBoss Marketplace — Candidate Qualification & Tier Criteria

**Prompt versions:** `v3-blr-banks-electronics-out` (tal.users) · `v3-r1-banks-electronics-out` (Round 1)
**Model:** `gemini-2.5-pro` (temperature 0, dynamic thinking, Google Search grounding ON)
**Source:** `src/classifier.ts` · `src/metabase.ts`
**Audit log:** Supabase table `classification_log` (input + output + model + version + latency per call)

Every candidate is run through one of two prompts depending on where they came from:

- **Round 1 prompt (`*-r1-*`)** — for resume-based applicants pulled from Card 348. Primary source of truth is **resume_text**.
- **tal.users prompt (`*-blr-*`)** — for Tal app signups. Primary source of truth is **LinkedIn / experience data**.

Both share the same three hard gates and the same tier rubric. They differ in which raw fields the prompt parses from.

---

## 1. Inputs — what we pull, where it comes from

### A. Round 1 — Card 348 "Round 1 God Table" (Metabase database 2)

Pulled once per cron tick via `POST /api/card/348/query` with `created_at_start` + `created_at_end` both set to the ingest IST date.

Fields consumed by the classifier:

| Field | Purpose |
|-------|---------|
| `name`, `phone` / `phone_number` | Identity + dedupe key |
| `linkedin_url` | Identity / enrichment pointer |
| `meta_company`, `meta_role` | User-typed company / role at signup |
| `job_title` | The role they **applied to** (intent signal only — *not* used as current role) |
| `ai_interview_title` | Track of the AI interview they took |
| `hiring_bias` | Free-text recruiter notes |
| `experience` | Years of experience |
| `resume_quality` | Flag: `Tier 1` / `Not Tier 1` / … |
| `resume_text` | **Primary input.** First 3,000 chars passed to the model — parsed for current role, current company, education, pedigree |
| `audio_verdict_label` | AI interview verdict — `selected` / `good` boosts confidence, `rejected` / `poor` lowers it |

### B. tal.users — native SQL on Metabase database 12

Multi-table join run once per cron tick. Filters on `(u.created_at at time zone IST)::date = <ingest_date>`.

Joined tables: `tal.users` ⟕ `tal.user_profile` ⟕ `tal.user_linkedin_data` ⟕ `tal.user_experience` (current only) ⟕ `tal.company` ⟕ `tal.user_institutes` (latest).

Fields consumed by the classifier:

| Field | Source | Purpose |
|-------|--------|---------|
| `name`, `phone`, `email`, `linkedin_url` | `tal.users` | Identity + dedupe |
| `user_location` | `tal.users.location` | Self-reported location |
| `meta_company`, `meta_role` | `tal.users.metadata` JSON | Self-reported company / role |
| `li_headline`, `li_about` (first 500 chars), `li_location_city`, `li_location_country`, `li_public_url` | `tal.user_profile` | LinkedIn enrichment — used to parse role / location when current-experience is null |
| `ld_position`, `ld_location`, `ld_current_company` | `tal.user_linkedin_data` | Secondary LinkedIn scrape — fallback signals |
| `exp_title`, `exp_company`, `exp_company_url`, `exp_location`, `exp_start_date`, `exp_duration` | `tal.user_experience` (where `is_current=true`, lowest ordinal) ⟕ `tal.company` | **Primary** current-role signals |
| `institute_name`, `institute_degree`, `institute_field`, `institute_start_year`, `institute_end_year` | `tal.user_institutes` (lowest ordinal) | Education / pedigree |

When tal.users LinkedIn isn't scraped yet, the classifier falls back to user-typed `meta_company` / `meta_role`.

### C. Cross-source merge

Same person appearing in both sources gets `source_table = "both"` and non-null fields are merged (richest signal wins). Dedupe key precedence: `grapevine_id` → `phone` → `email`.

---

## 2. What we are **NOT** doing

- **No re-classification.** Skip-existing logic filters rows whose `(joined_at, dedupe_key)` already exists in `candidates_daily`. Cron re-runs do not re-bill Gemini.
- **No pre-rules / regex shortlisting.** Every new row goes through the LLM. We do not pre-filter on company-name string match before calling Gemini.
- **No human-in-the-loop gating.** The dashboard surfaces low-confidence rows for review, but they are still written to `candidates_daily` with the model's best-guess verdict.
- **Applied role ≠ current role.** For Round 1, `job_title` (the role they applied to) is a secondary intent signal. Current role is parsed from `resume_text`.
- **No status / outcome tracking.** Once a candidate is classified, the marketplace pipeline does not track whether they later got interviewed, hired, or rejected.
- **No deletes from `candidates_daily` for re-runs.** Backfill (`INGEST_DATE=YYYY-MM-DD`) idempotently upserts; it does not wipe and replay.

---

## 3. Hard gates — all three must pass for `is_marketplace = true`

If any gate fails → `is_marketplace = false`, `tier = "other"`.

### Gate 1 — Role (engineer OR PM)

**Qualifies (engineering):** SDE, software engineer, backend, frontend, full-stack, mobile, iOS, Android, ML, AI, data scientist, data engineer, DevOps, SRE, security, embedded, QA automation, ML platform, infra, EM, staff / principal / distinguished engineer, tech lead, engineering lead, CTO, VP Engineering, design engineer, research engineer, applied scientist.

**Qualifies (product):** PM, senior PM, group PM, principal PM, product lead, head of product, CPO, founding PM.

**Qualifies (founder):** Founder / co-founder of a real tech startup.

**Excludes:** sales, ops, HR, marketing, finance, generalist business, support, pure UX/UI design (no eng scope), content, recruiter, non-technical project manager, accountant, non-engineering consultant, business analyst, customer success, account executive, solutions engineer (borderline → `confidence=low`).

> **Round 1 parsing:** current role = first/most-recent entry in resume Experience section.
> **tal.users parsing:** if `exp_title` is null, parse from `li_headline`.

### Gate 2 — Location (Bangalore signal anywhere)

Pass if **any** of these contain Bangalore / Bengaluru / BLR / Bangaluru / Bangalore Urban / Bangalore Rural:
- `user_location`, `li_location_city`, `li_location_country`, `exp_location`
- `preferred_job_location`, `willing_to_relocate_options` (Round 1)
- Mention in `li_about` or `resume_text` (e.g. "open to Bangalore", "relocating to Bengaluru")
- Current company is clearly Bangalore-HQ'd AND all location fields are null → pass with `confidence=low`

### Gate 3 — Company quality

**Qualifies (A) — Engineering-dense product companies**
Razorpay, Cred, Postman, Zerodha, Swiggy, Flipkart, Meesho, PhonePe, Groww, Acko, Slice, Atlassian, Stripe, Google, Microsoft, Meta, Amazon, Apple, Adobe, Salesforce, Snowflake, Databricks, Confluent, Uber, Booking, MongoDB, Cloudflare, Notion, Linear, Vercel, Sarvam, Sprinto, Plaid (and similar).

**Qualifies (B) — Engineering-dense GCCs**
Intel India, Qualcomm India, Texas Instruments, NVIDIA India, AMD India, Coupang, Toast, Intuit, CodeRabbit, Walmart Global Tech (eng side), Atlassian Bangalore, Stripe Bangalore.
*When unsure → web-search "<company> Bangalore engineering" and decide on real product/eng presence.*

**Qualifies (C) — Startups (any stage)**
Seed, Series A, growth-stage, unicorn, stealth, founder/co-founder roles. Unknown small startup → web-search "<company> startup funding" and lean qualify if product/tech, fail if IT services / consulting.

**Qualifies (D) — Frontier AI labs → always SUPREME**
DeepMind, Google DeepMind, OpenAI, Anthropic, Mistral, xAI, Cohere, Inflection, Adept, Character AI, Perplexity.

**Excludes (auto-fail):**

| Category | Examples |
|----------|----------|
| **IT services / outsourcing** | TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini, HCL / HCLTech, LTI / LTIMindtree, Mindtree, Mphasis, Tech Mahindra, Persistent, Mu Sigma, Genpact, NTT Data, DXC, IBM Consulting, NIIT, Hexaware, Birlasoft, Cybage, Coforge, UST, EPAM, Concentrix, Zensar, KPIT |
| **Consulting** | McKinsey, BCG, Bain, Deloitte Advisory, EY, KPMG, PwC, ZS Associates, Kearney, Oliver Wyman |
| **Staffing / recruitment** | Randstad, ManpowerGroup, Adecco, TeamLease, Quess, Naukri, foundit |
| **Banks — commercial + investment, including their engineering arms** | HDFC, ICICI, IDFC First, IDFC, SBI, Axis, Kotak, Yes Bank, IndusInd, Federal, BoB, PNB, Canara, Union, BoI, Central Bank, RBL, IDBI, AU SFB · Citibank, HSBC, StanChart, Deutsche, Barclays, Credit Suisse, UBS, Wells Fargo, BoA, BNP Paribas, SocGen, Goldman Sachs, JPMorgan, Morgan Stanley |
| **Foreign consumer electronics** | Samsung, LG, Sony, Panasonic, Sharp, Toshiba, Hitachi, Foxconn, Mitsubishi Electric, Philips, Bose, Haier, TCL, BOE, Vivo, Oppo, Xiaomi, OnePlus |
| **Non-engineering GCC back offices** | Most bank GBS centres, Big-4 GBS, insurance GICs whose Bangalore office is primarily support / ops / shared services |

> **Important carve-out — fintech startups are NOT banks.** Razorpay, Cred, Slice, Acko, Groww, Zerodha, PhonePe, Jupiter, Niyo, Open, Junio, Fi, Setu, M2P, Decentro continue to **qualify**.

> **Indian-native electronics** (Tata Elxsi, Bosch India engineering, L&T Tech Services, Sasken, Cyient product side) may qualify case-by-case; default fail with `confidence=medium` if unclear.

---

## 4. Tier assignment — only after all three gates pass

### Pedigree tags (matched against `institute_name`)

- **Indian top-tier:** IIT (any campus), NIT (any campus), IIM (any), IISc Bangalore, BITS Pilani / Goa / Hyderabad, IIIT Hyderabad, IIIT Bangalore, IIIT Delhi, ISI Kolkata, NSIT / NSUT, DTU (formerly DCE).
- **Global top-tier:** MIT, Stanford, CMU, UC Berkeley, Harvard, Princeton, Caltech, Yale, Cornell, Oxford, Cambridge, Imperial College London, ETH Zurich, EPFL, NUS, NTU Singapore, Tsinghua, Peking, Toronto, Waterloo.

Partial / abbreviated matches count (e.g. "IIT-B", "IIT Bombay", "Indian Institute of Technology Bombay" all match).

### Tier rules

| Tier | Criteria |
|------|----------|
| **supreme** | Frontier AI lab (any role) · OR FAANG + pedigree · OR top-20 Indian unicorn + senior title (Staff / Principal / Lead / EM / Director) + pedigree · OR founder / co-founder of a real startup · OR 8+ yrs at strong product cos + pedigree |
| **tier1** | FAANG without pedigree · OR strong product company + 2–7 YoE · OR funded startup (Series A+) + engineering/PM role + pedigree · OR any pedigree + qualifying company (pedigree floor promotes `tier2 → tier1`) |
| **tier2** | <2 YoE engineer/PM at qualifying company · OR smaller / unknown startup verified legitimate, no pedigree · OR stealth with no other strong signals |
| **other** | Reserved for `is_marketplace = false` candidates only |

---

## 5. Confidence field

| Level | When |
|-------|------|
| **high** | All signals clear: recognized company, explicit location, unambiguous role; OR auto-disqualified via name-match exclusion |
| **medium** | One signal weak or inferred (role parsed from headline, location inferred from company HQ, web search mixed) |
| **low** | Significant uncertainty — sparse data, contradictory signals, unknown company after web search, borderline role ("Solutions Engineer", "Technical Program Manager", "Associate"), stealth with no corroboration. Routed to human review queue. **Use generously.** |

### Round 1 confidence boosters / dampeners

- `audio_verdict_label = selected/good` → boost to `high`
- `audio_verdict_label = rejected/poor` → drop marketplace=true verdicts to `low`
- `resume_quality = Tier 1` → quality boost
- `resume_quality = Not Tier 1` → softer downweight
- `hiring_bias` text flags issues → factor in

---

## 6. Data-insufficient fallback

**Round 1:** if `resume_text` empty AND `meta_company` null AND `applied_role` null →
`is_marketplace=false, tier="other", confidence="low", reason="Insufficient data — resume content not available."`

**tal.users:** if `exp_title`, `exp_company`, `li_headline`, `li_about`, `institute_name` all null →
`is_marketplace=false, tier="other", confidence="low", reason="Insufficient data — no role, company, or education signals available."`

These rows are routed to a "needs enrichment" queue rather than forcing a verdict.

---

## 7. Output schema

```json
{
  "is_marketplace": true,
  "tier": "supreme" | "tier1" | "tier2" | "other",
  "confidence": "high" | "medium" | "low",
  "reason": "1-2 sentences citing the specific signals used"
}
```

Example reasons:

- *"Staff Engineer at Razorpay since 2022; B.Tech IIT Bombay; preferred_job_location=['bengaluru']. Strong company + pedigree."*
- *"Software Engineer at TCS per resume — IT services exclusion."*
- *"Co-founder of Nanonets (verified YC-backed AI startup via search); IIT Madras. Founder + pedigree."*
- *"Engineer at Intuit India — engineering-dense GCC; BITS Pilani; Bangalore confirmed via exp_location."*
- *"Role and company unclear from headline; 'Acme Labs' returns no clear search results. Best guess based on engineering headline, human review recommended." (confidence=low)*

---

## 8. Audit & cost

- Every call logged to Supabase `classification_log`: `joined_at, dedupe_key, prompt_version, model, input, output, latency_ms`.
- Bump `CLASSIFIER_PROMPT_VERSION` env var whenever the prompt changes so audit history stays interpretable.
- Cost: ~$0.001 / classification × ~1,000–1,800 new candidates / day ≈ **$1–2 / day, $30–60 / month**.
- Skip-existing means cron re-runs are nearly free.
