export type Tier = "supreme" | "tier1" | "tier2" | "other";

export type SourceTable = "round1_god_table" | "tal_users" | "both";

export interface NormalizedCandidate {
  source_table: SourceTable;
  dedupe_key: string;
  grapevine_id: string | null;
  phone: string | null;
  email: string | null;
  name: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  joined_at: string; // YYYY-MM-DD (IST date)
  raw: Record<string, unknown>;
}

export interface ClassifierInput {
  name: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  raw: Record<string, unknown>;
}

export type Confidence = "high" | "medium" | "low";

export interface ClassifierOutput {
  is_marketplace: boolean;
  tier: Tier;
  confidence: Confidence;
  reason: string;
}

export interface ClassifiedCandidate extends NormalizedCandidate {
  is_marketplace: boolean;
  tier: Tier;
  confidence: Confidence;
  reason: string;
  classifier_version: string;
}

export interface SummaryResponse {
  date: string;
  total: { value: number; delta: number };
  marketplace: { value: number; delta: number };
  tier1_supreme: { value: number; delta: number };
  tal_users: { value: number; delta: number };
  round1: { value: number; delta: number };
}

export interface AggregateRow {
  joined_at: string;
  total_count: number;
  marketplace_count: number;
  tier1_supreme_count: number;
  tal_users_count: number;
  round1_count: number;
}

export interface MarketplaceCandidateRow {
  name: string | null;
  company: string | null;
  role: string | null;
  current_role: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
  reason: string;
  joined_at: string;
}
