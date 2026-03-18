import { Hono } from "hono";
import { envelope } from "../middleware/envelope.js";
import { getPlatformAnalytics } from "../services/platform-analytics.js";

export const analyticsRoutes = new Hono();

analyticsRoutes.get("/", async (c) => {
  const framework = c.req.query("framework") || undefined;
  const data = await getPlatformAnalytics(framework);
  return envelope(c, data);
});
