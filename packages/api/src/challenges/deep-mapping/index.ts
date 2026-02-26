import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import type { ApiCallLogEntry, ScoringDimension } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateMappingData } from "./data.js";
import { scoreMapping } from "./scorer.js";
import { errorEnvelope } from "../../middleware/envelope.js";

const DEEP_MAPPING_DIMENSIONS: ScoringDimension[] = [
  { key: "coverage", label: "Coverage", weight: 0.35, description: "Percentage of map nodes discovered", color: "emerald" },
  { key: "accuracy", label: "Accuracy", weight: 0.3, description: "Correct identification of key features", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API calls per node discovered", color: "gold" },
  { key: "exploration", label: "Exploration", weight: 0.2, description: "Resource collection path quality", color: "purple" },
];

async function getMatchAndData(matchId: string) {
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match || match.status !== "active" || new Date() > match.expiresAt) return null;
  const data = generateMappingData(match.seed);
  return { match, data };
}

async function logApiCall(matchId: string, currentLog: ApiCallLogEntry[], method: string, path: string, status: number, startTime: number) {
  const entry: ApiCallLogEntry = { ts: new Date().toISOString(), method, path, status, durationMs: Date.now() - startTime };
  await db.update(matches).set({ apiCallLog: [...currentLog, entry] }).where(eq(matches.id, matchId));
}

export const deepMappingModule: ChallengeModule = {
  slug: "deep-mapping",
  dimensions: DEEP_MAPPING_DIMENSIONS,

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateMappingData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      startNodeId: data.startNodeId,
      // Don't include nodes — they're only available via sandbox exploration
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreMapping(input);
  },

  sandboxApiNames(): string[] {
    return ["map"];
  },

  sandboxRoutes(): Hono {
    const sandbox = new Hono();

    // GET /:matchId/map/start — get the starting node
    sandbox.get("/:matchId/map/start", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/map/start`, 200, startTime);

      const startNode = result.data.nodes.find((n) => n.id === result.data.startNodeId)!;
      return c.json({
        node: {
          id: startNode.id,
          name: startNode.name,
          type: startNode.type,
          depth: startNode.depth,
          resource: startNode.resource,
          resource_value: startNode.resourceValue,
          connections: startNode.connections,
        },
        instructions: "Use GET /map/explore/:nodeId to explore connected nodes.",
      });
    });

    // GET /:matchId/map/explore/:nodeId — explore a node
    sandbox.get("/:matchId/map/explore/:nodeId", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const nodeId = c.req.param("nodeId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/map/explore/${nodeId}`, 200, startTime);

      const node = result.data.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return c.json({ error: "Node not found", node_id: nodeId }, 404);
      }

      // Check if discoverable (must have explored a neighbor first, or be directly accessible)
      // For simplicity, all nodes are explorable if you have their ID
      return c.json({
        node: {
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          resource: node.resource,
          resource_value: node.resourceValue,
          connections: node.connections,
        },
      });
    });

    // GET /:matchId/map/stats — summary of what's been explored (based on API log)
    sandbox.get("/:matchId/map/stats", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/map/stats`, 200, startTime);

      // Count unique nodes explored from the API call log
      const exploredNodes = new Set<string>();
      for (const call of result.match.apiCallLog) {
        const exploreMatch = call.path.match(/\/map\/explore\/(NODE-\d+)/);
        if (exploreMatch) exploredNodes.add(exploreMatch[1]);
        const startMatch = call.path.match(/\/map\/start/);
        if (startMatch) exploredNodes.add(result.data.startNodeId);
      }

      return c.json({
        nodes_explored: exploredNodes.size,
        total_api_calls: result.match.apiCallLog.length + 1, // +1 for this call
        time_remaining_secs: Math.max(0, Math.round((result.match.expiresAt.getTime() - Date.now()) / 1000)),
      });
    });

    return sandbox;
  },
};
