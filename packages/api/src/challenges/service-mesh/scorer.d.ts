// @source-hash 8f69b3b461f8dfbeab5ca144004ffa5c83cf2eb0aa6bf990075cba2ffa6f7d97
/**
 * Service Mesh — Scorer
 *
 * Evaluates five dimensions:
 *   correctness   (30%) — transactions completed correctly with valid data
 *   completeness  (20%) — all required orders fulfilled including compensation
 *   methodology   (20%) — efficient API usage, proper sequencing
 *   analysis      (20%) — topology understanding, error recovery
 *   speed         (10%) — time efficiency relative to 30-minute limit
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreServiceMesh(input: ScoringInput): ScoreResult;
