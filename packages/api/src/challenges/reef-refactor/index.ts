import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import { REEF_REFACTOR_DIMENSIONS } from "@clawdiators/shared";
import type { ApiCallLogEntry } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateRefactorData } from "./data.js";
import { scoreRefactor } from "./scorer.js";
import { errorEnvelope } from "../../middleware/envelope.js";

export { generateRefactorData } from "./data.js";
export { scoreRefactor } from "./scorer.js";

// ── Sandbox helpers ──────────────────────────────────────────────────

async function getMatchAndData(matchId: string) {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match) return null;
  if (match.status !== "active") return null;
  if (new Date() > match.expiresAt) return null;
  const data = generateRefactorData(match.seed);
  return { match, data };
}

async function logApiCall(
  matchId: string,
  currentLog: ApiCallLogEntry[],
  method: string,
  path: string,
  status: number,
  startTime: number,
) {
  const entry: ApiCallLogEntry = {
    ts: new Date().toISOString(),
    method,
    path,
    status,
    durationMs: Date.now() - startTime,
  };
  await db
    .update(matches)
    .set({ apiCallLog: [...currentLog, entry] })
    .where(eq(matches.id, matchId));
}

// ── ChallengeModule implementation ───────────────────────────────────

export const reefRefactorModule: ChallengeModule = {
  slug: "reef-refactor",
  dimensions: REEF_REFACTOR_DIMENSIONS,

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateRefactorData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      functions: data.functions,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreRefactor(input);
  },

  sandboxApiNames(): string[] {
    return ["code"];
  },

  sandboxRoutes(): Hono {
    const sandbox = new Hono();

    // GET /:matchId/code — returns all broken functions + test cases
    sandbox.get("/:matchId/code", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);

      if (!result) {
        return errorEnvelope(c, "Match not found or expired", 404, "The reef has no code for phantoms.");
      }

      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/code`, 200, startTime);

      return c.json({
        functions: result.data.functions,
        total: result.data.functions.length,
        instructions: "For each function, determine the correct output for each test case. Submit as { [function_id]: [output1, output2, ...] }",
      });
    });

    // GET /:matchId/code/:id — single function
    sandbox.get("/:matchId/code/:fnId", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const fnId = c.req.param("fnId");
      const result = await getMatchAndData(matchId);

      if (!result) {
        return errorEnvelope(c, "Match not found or expired", 404, "The reef has no code for phantoms.");
      }

      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/code/${fnId}`, 200, startTime);

      const fn = result.data.functions.find((f) => f.id === fnId);
      if (!fn) {
        return c.json({ error: "Function not found", available_ids: result.data.functions.map((f) => f.id) }, 404);
      }

      return c.json(fn);
    });

    return sandbox;
  },
};
