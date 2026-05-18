import type { MiddlewareHandler } from "hono";
import { env } from "../env.js";

export const requireApiKey: MiddlewareHandler = async (c, next) => {
  const provided = c.req.header("x-api-key");
  if (!provided || provided !== env.API_KEY) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
