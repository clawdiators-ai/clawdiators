import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import type { ApiCallLogEntry, ScoringDimension } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateLedgerData } from "./data.js";
import { scoreLedger } from "./scorer.js";
import { errorEnvelope } from "../../middleware/envelope.js";

const TIDE_LEDGER_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.4, description: "Correctness of final balances and totals", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "state_mgmt", label: "State Mgmt", weight: 0.3, description: "Checkpoint accuracy across all 3 phases", color: "purple" },
];

async function getMatchAndData(matchId: string) {
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match || match.status !== "active" || new Date() > match.expiresAt) return null;
  const data = generateLedgerData(match.seed);
  return { match, data };
}

async function logApiCall(matchId: string, currentLog: ApiCallLogEntry[], method: string, path: string, status: number, startTime: number) {
  const entry: ApiCallLogEntry = { ts: new Date().toISOString(), method, path, status, durationMs: Date.now() - startTime };
  await db.update(matches).set({ apiCallLog: [...currentLog, entry] }).where(eq(matches.id, matchId));
}

export const tideLedgerModule: ChallengeModule = {
  slug: "tide-ledger",
  dimensions: TIDE_LEDGER_DIMENSIONS,

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateLedgerData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      phase1_transactions: data.phase1_transactions,
      phase2_amendments: data.phase2_amendments,
      phase3_rollbacks: data.phase3_rollbacks,
      phase3_new_transactions: data.phase3_new_transactions,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreLedger(input);
  },

  sandboxApiNames(): string[] {
    return ["transactions", "amendments", "rollbacks"];
  },

  sandboxRoutes(): Hono {
    const sandbox = new Hono();

    // GET /:matchId/transactions — Phase 1 initial transactions
    sandbox.get("/:matchId/transactions", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);
      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/transactions`, 200, startTime);

      const account = c.req.query("account");
      const page = Number(c.req.query("page") || "1");
      const perPage = 20;

      let txns = result.data.phase1_transactions;
      if (account) txns = txns.filter((t) => t.account === account);

      const start = (page - 1) * perPage;
      const paged = txns.slice(start, start + perPage);

      return c.json({
        transactions: paged,
        total: txns.length,
        page,
        pages: Math.ceil(txns.length / perPage),
      });
    });

    // GET /:matchId/amendments — Phase 2 amendments
    sandbox.get("/:matchId/amendments", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);

      // Check if agent has submitted Phase 1 checkpoint
      const hasPhase1 = result.match.checkpoints.length >= 1;
      if (!hasPhase1) {
        await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/amendments`, 403, startTime);
        return errorEnvelope(c, "Submit Phase 1 checkpoint first", 403, "The next phase is locked until you prove you've processed the first.");
      }

      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/amendments`, 200, startTime);
      return c.json({ amendments: result.data.phase2_amendments, total: result.data.phase2_amendments.length });
    });

    // GET /:matchId/rollbacks — Phase 3 rollbacks + new transactions
    sandbox.get("/:matchId/rollbacks", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);
      if (!result) return errorEnvelope(c, "Match not found or expired", 404);

      // Check if agent has submitted Phase 2 checkpoint
      const hasPhase2 = result.match.checkpoints.length >= 2;
      if (!hasPhase2) {
        await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/rollbacks`, 403, startTime);
        return errorEnvelope(c, "Submit Phase 2 checkpoint first", 403, "Complete Phase 2 before the final phase unlocks.");
      }

      await logApiCall(matchId, result.match.apiCallLog, "GET", `/sandbox/${matchId}/rollbacks`, 200, startTime);
      return c.json({
        rollbacks: result.data.phase3_rollbacks,
        new_transactions: result.data.phase3_new_transactions,
        rollback_count: result.data.phase3_rollbacks.length,
        new_count: result.data.phase3_new_transactions.length,
      });
    });

    return sandbox;
  },
};
