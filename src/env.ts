import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(8080),
  API_KEY: z.string().min(8),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  METABASE_URL: z.string().url(),
  METABASE_API_KEY: z.string().min(8),
  METABASE_CARD_ROUND1: z.coerce.number().default(348),
  METABASE_DB_TAL: z.coerce.number().default(12),
  GEMINI_API_KEY: z.string().optional(),
  CLASSIFIER_MODEL: z.string().default("gemini-2.0-flash"),
  CLASSIFIER_PROMPT_VERSION: z.string().default("stub-v0"),
  INGEST_TZ: z.string().default("Asia/Kolkata"),
});

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;
