import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import { TOOLCHAIN_DIMENSIONS } from "@clawdiators/shared";
import type { ApiCallLogEntry } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateGauntletData } from "./data.js";
import { scoreGauntlet } from "./scorer.js";
import { errorEnvelope } from "../../middleware/envelope.js";

async function getMatchAndData(matchId: string) {
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match || match.status !== "active" || new Date() > match.expiresAt) return null;
  const data = generateGauntletData(match.seed);
  return { match, data };
}

async function logApiCall(matchId: string, currentLog: ApiCallLogEntry[], method: string, path: string, status: number, startTime: number) {
  const entry: ApiCallLogEntry = { ts: new Date().toISOString(), method, path, status, durationMs: Date.now() - startTime };
  await db.update(matches).set({ apiCallLog: [...currentLog, entry] }).where(eq(matches.id, matchId));
}

export const toolchainGauntletModule: ChallengeModule = {
  slug: "toolchain-gauntlet",
  dimensions: TOOLCHAIN_DIMENSIONS,

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateGauntletData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      registry: data.registry,
      inventory: data.inventory,
      pricing: data.pricing,
      shipping: data.shipping,
      loyalty: data.loyalty,
      audit: data.audit,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreGauntlet(input);
  },

  sandboxApiNames(): string[] {
    return ["registry", "inventory", "pricing", "shipping", "loyalty", "audit"];
  },

  sandboxRoutes(): Hono {
    const sandbox = new Hono();

    // GET /:matchId/registry — product catalog
    sandbox.get("/:matchId/registry", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/registry`, 200, startTime);

      const category = c.req.query("category");
      let products = result.data.registry;
      if (category) products = products.filter((p) => p.category.toLowerCase() === category.toLowerCase());
      return c.json({ products, total: products.length });
    });

    // GET /:matchId/inventory — stock levels by SKU
    sandbox.get("/:matchId/inventory", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/inventory`, 200, startTime);

      const sku = c.req.query("sku");
      const warehouse = c.req.query("warehouse");
      let items = result.data.inventory;
      if (sku) items = items.filter((i) => i.sku.toLowerCase() === sku.toLowerCase());
      if (warehouse) items = items.filter((i) => i.warehouse.toLowerCase() === warehouse.toLowerCase());
      return c.json({ items, total: items.length });
    });

    // GET /:matchId/pricing — prices by SKU
    sandbox.get("/:matchId/pricing", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/pricing`, 200, startTime);

      const sku = c.req.query("sku");
      if (sku) {
        const entry = result.data.pricing.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
        if (!entry) return c.json({ error: "SKU not found in pricing" }, 404);
        return c.json(entry);
      }
      return c.json({ prices: result.data.pricing });
    });

    // GET /:matchId/shipping — shipping options
    sandbox.get("/:matchId/shipping", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/shipping`, 200, startTime);

      const warehouse = c.req.query("warehouse");
      const dest = c.req.query("destination");
      let options = result.data.shipping;
      if (warehouse) options = options.filter((s) => s.warehouse.toLowerCase() === warehouse.toLowerCase());
      if (dest) options = options.filter((s) => s.destination.toLowerCase() === dest.toLowerCase());
      return c.json({ options, total: options.length });
    });

    // GET /:matchId/loyalty — customer loyalty profile
    sandbox.get("/:matchId/loyalty", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/loyalty`, 200, startTime);

      const customerId = c.req.query("customer_id");
      if (customerId && customerId !== result.data.loyalty.customerId) {
        return c.json({ error: "Customer not found" }, 404);
      }
      return c.json(result.data.loyalty);
    });

    // GET /:matchId/audit — compliance records
    sandbox.get("/:matchId/audit", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/audit`, 200, startTime);

      const sku = c.req.query("sku");
      if (sku) {
        const record = result.data.audit.find((a) => a.sku.toLowerCase() === sku.toLowerCase());
        if (!record) return c.json({ error: "No audit record for SKU" }, 404);
        return c.json(record);
      }
      return c.json({ records: result.data.audit });
    });

    return sandbox;
  },
};
