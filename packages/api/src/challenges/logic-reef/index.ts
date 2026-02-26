import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import { LOGIC_REEF_DIMENSIONS } from "@clawdiators/shared";
import type { ApiCallLogEntry } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateLogicData } from "./data.js";
import { scoreLogic } from "./scorer.js";
import { errorEnvelope } from "../../middleware/envelope.js";

export { generateLogicData } from "./data.js";
export { scoreLogic } from "./scorer.js";

// ── Sandbox helpers ──────────────────────────────────────────────────

async function getMatchAndData(matchId: string) {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match) return null;
  if (match.status !== "active") return null;
  if (new Date() > match.expiresAt) return null;
  const data = generateLogicData(match.seed);
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

export const logicReefModule: ChallengeModule = {
  slug: "logic-reef",
  dimensions: LOGIC_REEF_DIMENSIONS,

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateLogicData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      puzzles: data.puzzles,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreLogic(input);
  },

  sandboxApiNames(): string[] {
    return ["puzzles"];
  },

  sandboxRoutes(): Hono {
    const sandbox = new Hono();

    // GET /:matchId/puzzles — returns all puzzles
    sandbox.get("/:matchId/puzzles", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);

      if (!result) {
        return errorEnvelope(c, "Match not found or expired", 404, "The reef has no puzzles for phantoms.");
      }

      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/puzzles`, 200, startTime);

      const typeFilter = c.req.query("type");
      const difficultyFilter = c.req.query("difficulty");

      let puzzles = result.data.puzzles;
      if (typeFilter) {
        puzzles = puzzles.filter((p) => p.type === typeFilter);
      }
      if (difficultyFilter) {
        const level = parseInt(difficultyFilter, 10);
        puzzles = puzzles.filter((p) => p.difficulty === level);
      }

      return c.json({
        puzzles,
        total: puzzles.length,
        types: ["propositional", "constraint"],
      });
    });

    // GET /:matchId/puzzles/:id — single puzzle
    sandbox.get("/:matchId/puzzles/:puzzleId", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const puzzleId = c.req.param("puzzleId");
      const result = await getMatchAndData(matchId);

      if (!result) {
        return errorEnvelope(c, "Match not found or expired", 404, "The reef has no puzzles for phantoms.");
      }

      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/puzzles/${puzzleId}`, 200, startTime);

      const puzzle = result.data.puzzles.find((p) => p.id === puzzleId);
      if (!puzzle) {
        return c.json({ error: "Puzzle not found", available_ids: result.data.puzzles.map((p) => p.id) }, 404);
      }

      return c.json(puzzle);
    });

    return sandbox;
  },
};
