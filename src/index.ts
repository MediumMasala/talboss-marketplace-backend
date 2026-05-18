import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";
import { requireApiKey } from "./middleware/auth.js";
import summary from "./routes/summary.js";
import aggregates from "./routes/aggregates.js";
import marketplaceCandidates from "./routes/marketplace-candidates.js";

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));

const api = new Hono();
api.use("*", requireApiKey);
api.route("/summary", summary);
api.route("/aggregates", aggregates);
api.route("/marketplace-candidates", marketplaceCandidates);

app.route("/api", api);

app.onError((err, c) => {
  console.error("[api] error:", err);
  return c.json({ error: err.message ?? "internal_error" }, 500);
});

serve({ fetch: app.fetch, port: env.PORT });
console.log(`[api] listening on :${env.PORT}`);
