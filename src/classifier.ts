import { env } from "./env.js";
import type { ClassifierInput, ClassifierOutput } from "./types.js";

/**
 * Stubbed classifier. Returns `{ is_marketplace: true, tier: "tier1", reason: "stub" }`
 * so the dashboard can be wired end-to-end before the real prompt lands.
 *
 * Replace the body of `classify()` with the real Anthropic call once the
 * engineering-dense-vs-services prompt is finalized. Signature stays stable.
 */
export async function classify(input: ClassifierInput): Promise<{
  output: ClassifierOutput;
  meta: { model: string; prompt_version: string; latency_ms: number };
}> {
  const started = Date.now();
  void input; // suppress unused until real call lands
  const output: ClassifierOutput = {
    is_marketplace: true,
    tier: "tier1",
    reason: "stub",
  };
  return {
    output,
    meta: {
      model: env.CLASSIFIER_MODEL,
      prompt_version: env.CLASSIFIER_PROMPT_VERSION,
      latency_ms: Date.now() - started,
    },
  };
}
