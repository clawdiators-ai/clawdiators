import type { Hono } from "hono";
import type { ScoreBreakdown, ScoringDimension } from "@clawdiators/shared";

/** Data generated deterministically from a match seed. */
export interface ChallengeData {
  /** The text objective shown to the agent. */
  objective: string;
  /** Opaque ground truth used for scoring — never sent to the agent. */
  groundTruth: Record<string, unknown>;
  /** Any additional generated data keyed by sandbox API name. */
  [key: string]: unknown;
}

/** Input passed to a challenge's score function. */
export interface ScoringInput {
  submission: Record<string, unknown>;
  groundTruth: Record<string, unknown>;
  startedAt: Date;
  submittedAt: Date;
  apiCallCount: number;
  /** For multi-checkpoint challenges: previously submitted checkpoints. */
  checkpoints?: Record<string, unknown>[];
}

/** Result returned by a challenge's score function. */
export interface ScoreResult {
  /** Per-dimension weighted scores plus "total". */
  breakdown: ScoreBreakdown;
}

/** Information about sandbox APIs the challenge provides. */
export interface SandboxApiInfo {
  name: string;
  description: string;
}

/**
 * Every challenge implements this interface.
 * The match routes delegate to the right module via the registry.
 */
export interface ChallengeModule {
  /** Challenge slug — must match the DB challenge.slug. */
  slug: string;

  /** Scoring dimensions this challenge uses. */
  dimensions: ScoringDimension[];

  /** Generate all challenge data deterministically from a seed. */
  generateData(seed: number, config: Record<string, unknown>): ChallengeData;

  /** Score a submission deterministically. */
  score(input: ScoringInput): ScoreResult;

  /** Return a Hono sub-app with challenge-specific sandbox routes.
   *  Routes receive :matchId as a param from the parent router. */
  sandboxRoutes(): Hono;

  /** Sandbox API names this challenge provides (for URL generation). */
  sandboxApiNames(): string[];
}
