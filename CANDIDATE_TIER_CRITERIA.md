# TalBoss Marketplace — Candidate Tier Criteria

**Prompt version:** `v1-blr-eng-or-pm`
**Model:** `gemini-2.5-pro` (temperature 0, dynamic thinking, JSON output)
**Source:** `src/classifier.ts` → `SYSTEM_PROMPT`

A candidate is classified in two steps: first we decide whether they qualify for the marketplace at all, then (if yes) we assign one of three quality tiers. Non-qualifying candidates always get `tier = "other"`.

---

## Step 1 — Marketplace qualification

`is_marketplace = true` only if **all three** rules hold.

### 1. Location — Bangalore
- Currently based in Bangalore / Bengaluru, **or**
- Preferred location is Bangalore, **or**
- Explicitly willing to relocate to Bangalore.
- Null / unknown location → soft negative. Only marked marketplace if the company is clearly Bangalore-HQ'd.

### 2. Role — Software Engineering OR Product Management
**Include (engineering):** SDE, backend, frontend, full-stack, mobile, ML / AI / data science, DevOps, SRE, security, embedded, QA automation, ML platform, infra, EM, staff / principal engineer.
**Include (product):** PM, group PM, principal PM, product lead.
**Include (edge):** design engineer (UX-only is OK if engineering-adjacent).

**Exclude:** sales, ops, HR, marketing, finance, generalist business, support, content, recruiter, ops analyst, non-PM project manager, pure UX/visual design.

### 3. Company — Product / Engineering Org

**Excluded categories:**
- **IT services & outsourcing:** TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini, HCL, LTI / LTIMindtree, Mindtree, Mphasis, Tech Mahindra, Persistent, Mu Sigma, Genpact, NTT Data, DXC, IBM Consulting, NIIT, Hexaware, Birlasoft, Cybage, Coforge.
- **Non-engineering GCC / GIC / GBS back offices** whose Bangalore presence is primarily support / ops / shared services (most bank GBS, Big-4 GBS, insurance GICs).
- **Pure consulting firms:** McKinsey, BCG, Bain, Deloitte Advisory, EY, KPMG, PwC.
- **Recruitment / staffing companies.**

**Qualifying examples:**
- **Top product cos / FAANG-equivalent:** Google, Microsoft, Meta, Amazon, Apple, Adobe, Salesforce, Snowflake, Databricks, Confluent, Stripe, Atlassian, MongoDB, Cloudflare, Notion, Linear, Vercel, Plaid.
- **Top Indian product startups:** Razorpay, Cred, Postman, Zerodha, Swiggy, Flipkart, Meesho, PhonePe, Groww, Acko, Slice, Sarvam, Sprinto.
- **Engineering-dense GCCs:** Intel India, Qualcomm India, Texas Instruments, Walmart Global Tech (eng side), Uber, Booking, Coupang, Toast.

**Edge cases:**
- **Stealth / unnamed startups** → benefit of the doubt if role + signals look credible.
- **Unknown small companies** → mark marketplace only if role + location qualify *and* the name does not pattern-match an IT-services / consulting / staffing firm.

---

## Step 2 — Tier assignment

Tiers are only assigned to marketplace-qualifying candidates. Everyone else gets `tier = "other"`.

| Tier | Seniority | Company quality | Typical signal |
|------|-----------|-----------------|----------------|
| **supreme** | Senior+ (5+ yrs, OR Staff / Principal / Lead title) | Top-tier product co (FAANG-equivalent, top-20 Indian product startups, well-funded growth-stage product cos, AI-first labs) **or** unicorn founder | "Staff engineer at Stripe", "Founding eng at AI lab", "Principal PM at Razorpay" |
| **tier1** | 2–7 yrs, clearly competent profile | Known product company | "SDE-2 at Swiggy", "PM at Groww" |
| **tier2** | Junior (< 2 yrs) **or** mid-level | Smaller / less-known product company | "Backend engineer at Series-A startup", "Associate PM at small B2B SaaS" |
| **other** | — | — | All non-marketplace candidates |

---

## Output schema

```json
{
  "is_marketplace": true,
  "tier": "supreme" | "tier1" | "tier2" | "other",
  "reason": "1-2 sentences citing specific signals"
}
```

The `reason` is what shows up in the dashboard cell — e.g. *"Senior backend engineer at Razorpay; Bangalore; well-known fintech engineering org."* If excluding, it cites the disqualifying signal — e.g. *"TCS is an IT services firm — not engineering-dense."*

---

## User-message inputs (per candidate)

**Always present:**
- Name, current company, current role, location.

**From Round 1 (Card 348) when available:**
- Years of experience, applied-job title, AI interview track, hiring bias for the role, resume quality flag.

**From tal.users when LinkedIn is scraped:**
- LinkedIn headline, current role duration, education (institute / degree / field / grad-year).

---

## Audit trail

Every classification call is logged in Supabase table `classification_log`:
`joined_at, dedupe_key, prompt_version, model, input, output, latency_ms`.

Bump `CLASSIFIER_PROMPT_VERSION` whenever the prompt changes so audit history stays interpretable. To compare versions: `SELECT classifier_version, COUNT(*), AVG(...) FROM classification_log GROUP BY 1`.
