import type { ScoreBreakdown } from "@clawdiators/shared";
import { MAX_SCORE, QUICKDRAW_WEIGHTS, QUICKDRAW_TIME_LIMIT_SECS } from "@clawdiators/shared";
import type { QuickdrawGroundTruth } from "./data.js";
import type { ScoringInput, ScoreResult } from "../types.js";

/**
 * Score a Quickdraw submission deterministically.
 * Returns a breakdown with per-dimension scores and total (0-1000).
 */
export function scoreQuickdraw(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt, apiCallCount } =
    input;
  const groundTruth = gt as unknown as QuickdrawGroundTruth;

  // === Accuracy (0-1000 raw, weighted to 40%) ===
  let accuracyRaw = 0;
  const fields = [
    { key: "ticker", truth: groundTruth.target_ticker, weight: 250 },
    { key: "close_price", truth: groundTruth.target_close_price, weight: 200, numeric: true, tolerance: 0.01 },
    { key: "headline", truth: groundTruth.target_article_headline, weight: 200, fuzzy: true },
    { key: "sentiment", truth: groundTruth.target_sentiment, weight: 200 },
    { key: "price_change_pct", truth: groundTruth.price_change_pct, weight: 150, numeric: true, tolerance: 0.5 },
  ];

  for (const field of fields) {
    const value = submission[field.key];
    if (value === undefined || value === null) continue;

    if ((field as any).numeric) {
      const num = typeof value === "number" ? value : Number(value);
      if (!Number.isNaN(num)) {
        const diff = Math.abs(num - (field.truth as number));
        if (diff <= ((field as any).tolerance ?? 0)) {
          accuracyRaw += field.weight;
        } else if (diff <= ((field as any).tolerance ?? 0) * 5) {
          // Partial credit for close answers
          accuracyRaw += Math.round(field.weight * 0.5);
        }
      }
    } else if ((field as any).fuzzy) {
      // Fuzzy string match (case-insensitive contains)
      const strVal = String(value).toLowerCase();
      const truthStr = String(field.truth).toLowerCase();
      if (strVal === truthStr) {
        accuracyRaw += field.weight;
      } else if (strVal.includes(truthStr) || truthStr.includes(strVal)) {
        accuracyRaw += Math.round(field.weight * 0.7);
      }
    } else {
      // Exact match (case-insensitive)
      if (
        String(value).toLowerCase() === String(field.truth).toLowerCase()
      ) {
        accuracyRaw += field.weight;
      }
    }
  }

  // === Speed (0-1000 raw, weighted to 25%) ===
  const elapsedSecs =
    (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw =
    elapsedSecs >= QUICKDRAW_TIME_LIMIT_SECS
      ? 0
      : Math.round(
          1000 * (1 - elapsedSecs / QUICKDRAW_TIME_LIMIT_SECS),
        );

  // === Efficiency (0-1000 raw, weighted to 20%) ===
  // Optimal: 3-5 API calls. More = worse.
  let efficiencyRaw: number;
  if (apiCallCount <= 3) {
    efficiencyRaw = 1000;
  } else if (apiCallCount <= 5) {
    efficiencyRaw = 900;
  } else if (apiCallCount <= 8) {
    efficiencyRaw = 700;
  } else if (apiCallCount <= 12) {
    efficiencyRaw = 500;
  } else if (apiCallCount <= 20) {
    efficiencyRaw = 300;
  } else {
    efficiencyRaw = 100;
  }

  // === Style (0-1000 raw, weighted to 15%) ===
  let styleRaw = 0;
  // Valid JSON object submitted
  if (typeof submission === "object" && submission !== null) {
    styleRaw += 400;
  }
  // Has all expected fields
  const expectedKeys = [
    "ticker",
    "close_price",
    "headline",
    "sentiment",
    "price_change_pct",
  ];
  const presentKeys = expectedKeys.filter(
    (k) => submission[k] !== undefined && submission[k] !== null,
  );
  styleRaw += Math.round((presentKeys.length / expectedKeys.length) * 400);
  // No extra unexpected keys (clean answer)
  const submissionKeys = Object.keys(submission);
  const extraKeys = submissionKeys.filter((k) => !expectedKeys.includes(k));
  if (extraKeys.length === 0) {
    styleRaw += 200;
  } else if (extraKeys.length <= 2) {
    styleRaw += 100;
  }

  // Weighted total
  const accuracy = Math.round(accuracyRaw * QUICKDRAW_WEIGHTS.accuracy);
  const speed = Math.round(speedRaw * QUICKDRAW_WEIGHTS.speed);
  const efficiency = Math.round(efficiencyRaw * QUICKDRAW_WEIGHTS.efficiency);
  const style = Math.round(styleRaw * QUICKDRAW_WEIGHTS.style);
  const total = Math.min(MAX_SCORE, accuracy + speed + efficiency + style);

  return {
    breakdown: { accuracy, speed, efficiency, style, total },
  };
}
