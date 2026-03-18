// @source-hash 3c6b9ae7a7fec02ab992843ddf39985c1dfba51a08c34d21880fefb45ff5d986
/**
 * Web Recon — Data Generator
 *
 * Generates deterministic challenge data from a seed: target company profile,
 * employees, patents, news articles, forum posts, unreleased products, and
 * strategic moves. Each Docker service receives its slice of this data.
 *
 * Red herrings are explicitly tracked in groundTruth for precision scoring.
 */
import type { ChallengeData } from "../types.js";
export declare function generateWebReconData(seed: number): ChallengeData;
