import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches } from "@clawdiators/db";
import { CIPHER_FORGE_DIMENSIONS } from "@clawdiators/shared";
import type { ApiCallLogEntry } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateCipherData } from "./data.js";
import { scoreCipher } from "./scorer.js";
import { errorEnvelope } from "../../middleware/envelope.js";

export { generateCipherData } from "./data.js";
export { scoreCipher } from "./scorer.js";

// ── Sandbox helpers ──────────────────────────────────────────────────

async function getMatchAndData(matchId: string) {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match) return null;
  if (match.status !== "active") return null;
  if (new Date() > match.expiresAt) return null;
  const data = generateCipherData(match.seed);
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

export const cipherForgeModule: ChallengeModule = {
  slug: "cipher-forge",
  dimensions: CIPHER_FORGE_DIMENSIONS,

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateCipherData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      messages: data.messages,
      reference_table: data.reference_table,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreCipher(input);
  },

  sandboxApiNames(): string[] {
    return ["ciphers"];
  },

  sandboxRoutes(): Hono {
    const sandbox = new Hono();

    // GET /:matchId/ciphers — returns all encrypted messages + reference table
    sandbox.get("/:matchId/ciphers", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const result = await getMatchAndData(matchId);

      if (!result) {
        return errorEnvelope(c, "Match not found or expired", 404, "The forge has gone cold.");
      }

      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/ciphers`, 200, startTime);

      const difficulty = c.req.query("difficulty");
      if (difficulty) {
        const level = parseInt(difficulty, 10);
        const msg = result.data.messages.find((m) => m.difficulty === level);
        if (!msg) {
          return c.json({ error: "No cipher at that difficulty level", available: [1, 2, 3, 4, 5] }, 404);
        }
        return c.json({ message: msg, reference_table: result.data.reference_table });
      }

      return c.json({
        messages: result.data.messages,
        reference_table: result.data.reference_table,
        total: result.data.messages.length,
      });
    });

    // GET /:matchId/ciphers/:id — single cipher message
    sandbox.get("/:matchId/ciphers/:cipherId", async (c) => {
      const startTime = Date.now();
      const matchId = c.req.param("matchId");
      const cipherId = c.req.param("cipherId");
      const result = await getMatchAndData(matchId);

      if (!result) {
        return errorEnvelope(c, "Match not found or expired", 404, "The forge has gone cold.");
      }

      await logApiCall(matchId, result.match.apiCallLog, "GET",
        `/sandbox/${matchId}/ciphers/${cipherId}`, 200, startTime);

      const msg = result.data.messages.find((m) => m.id === cipherId);
      if (!msg) {
        return c.json({ error: "Cipher not found", available_ids: result.data.messages.map((m) => m.id) }, 404);
      }

      return c.json({ message: msg, reference_table: result.data.reference_table });
    });

    return sandbox;
  },
};
