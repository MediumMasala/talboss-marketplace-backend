import type { NormalizedCandidate } from "./types.js";

function pickDedupeKey(c: Pick<NormalizedCandidate, "grapevine_id" | "phone" | "email">): string {
  if (c.grapevine_id) return `gv:${c.grapevine_id}`;
  if (c.phone) return `ph:${c.phone.replace(/\D/g, "")}`;
  if (c.email) return `em:${c.email.toLowerCase()}`;
  return `na:${crypto.randomUUID()}`;
}

export function normalizeRound1(row: Record<string, unknown>, dateISO: string): NormalizedCandidate {
  const grapevine_id = (row["user_id"] as string | null) ?? null;
  const phone = (row["phone_number"] as string | null) ?? null;
  const email = (row["email"] as string | null) ?? null;
  const partial = { grapevine_id, phone, email };
  return {
    source_table: "round1_god_table",
    dedupe_key: pickDedupeKey(partial),
    grapevine_id,
    phone,
    email,
    name: (row["user_real_name"] as string | null) ?? null,
    company: (row["company_name"] as string | null) ?? null,
    role: (row["job_title"] as string | null) ?? null,
    location: (row["preferred_job_location"] as string | null) ?? null,
    joined_at: dateISO,
    raw: row,
  };
}

export function normalizeTalUser(row: Record<string, unknown>, dateISO: string): NormalizedCandidate {
  const grapevine_id = (row["grapevine_id"] as string | null) ?? null;
  const phone = (row["phone"] as string | null) ?? null;
  const email = (row["email"] as string | null) ?? null;
  const partial = { grapevine_id, phone, email };
  return {
    source_table: "tal_users",
    dedupe_key: pickDedupeKey(partial),
    grapevine_id,
    phone,
    email,
    name: (row["name"] as string | null) ?? null,
    company: (row["company"] as string | null) ?? null,
    role: (row["role"] as string | null) ?? null,
    location: (row["location"] as string | null) ?? null,
    joined_at: dateISO,
    raw: row,
  };
}

/**
 * Merge two normalized lists, deduping by `dedupe_key`. When the same person
 * appears in both, source becomes "both" and we prefer non-null fields.
 */
export function mergeUnique(
  round1: NormalizedCandidate[],
  talUsers: NormalizedCandidate[],
): NormalizedCandidate[] {
  const map = new Map<string, NormalizedCandidate>();
  const upsert = (c: NormalizedCandidate) => {
    const existing = map.get(c.dedupe_key);
    if (!existing) {
      map.set(c.dedupe_key, c);
      return;
    }
    map.set(c.dedupe_key, {
      ...existing,
      source_table: "both",
      grapevine_id: existing.grapevine_id ?? c.grapevine_id,
      phone: existing.phone ?? c.phone,
      email: existing.email ?? c.email,
      name: existing.name ?? c.name,
      company: existing.company ?? c.company,
      role: existing.role ?? c.role,
      location: existing.location ?? c.location,
      raw: { ...c.raw, ...existing.raw },
    });
  };
  round1.forEach(upsert);
  talUsers.forEach(upsert);
  return [...map.values()];
}
