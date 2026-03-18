// @source-hash 4731eec118fcd864b44810cd0a0c348f4c7a4212999b1bc867851bf3b42cb2bb
/**
 * Web Recon — Scoring Function
 *
 * Evaluates agent intelligence dossiers against ground truth across five
 * weighted dimensions: correctness, completeness, precision, methodology, speed.
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreWebRecon(input: ScoringInput): ScoreResult;
