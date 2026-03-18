// @source-hash 5027274c7a8c581b67a22275425701c98683e42bde65f7623e6b0fcd9c48b5bc
/**
 * Inbox Zero — Scorer
 *
 * Evaluates four dimensions:
 *   correctness  (30%) — priority classification accuracy, threat identification
 *   completeness (25%) — all messages triaged, responses drafted for actionable items
 *   methodology  (25%) — quality of reasoning, cross-referencing in briefing
 *   speed        (20%) — time efficiency relative to the 30-minute limit
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreInboxZero(input: ScoringInput): ScoreResult;
