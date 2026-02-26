import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { CascadingGroundTruth } from "./data.js";

const WEIGHTS = { accuracy: 0.3, speed: 0.1, efficiency: 0.15, resilience: 0.45 };
const TIME_LIMIT = 240;

export function scoreCascading(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt, apiCallCount } = input;
  const groundTruth = gt as unknown as CascadingGroundTruth;

  // === Accuracy (0-1000 raw) ===
  let accuracyRaw = 0;
  const fields = [
    { key: "ticker", truth: groundTruth.target_ticker, weight: 300 },
    { key: "close_price", truth: groundTruth.target_close_price, weight: 250, numeric: true, tolerance: 0.01 },
    { key: "headline", truth: groundTruth.target_article_headline, weight: 200, fuzzy: true },
    { key: "sentiment", truth: groundTruth.target_sentiment, weight: 150 },
    { key: "price_change_pct", truth: groundTruth.price_change_pct, weight: 100, numeric: true, tolerance: 0.5 },
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
          accuracyRaw += Math.round(field.weight * 0.5);
        }
      }
    } else if ((field as any).fuzzy) {
      const strVal = String(value).toLowerCase();
      const truthStr = String(field.truth).toLowerCase();
      if (strVal === truthStr) accuracyRaw += field.weight;
      else if (strVal.includes(truthStr) || truthStr.includes(strVal)) accuracyRaw += Math.round(field.weight * 0.7);
    } else {
      if (String(value).toLowerCase() === String(field.truth).toLowerCase()) accuracyRaw += field.weight;
    }
  }

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Efficiency (0-1000 raw) ===
  // With failures, agents need more calls. Be generous.
  let efficiencyRaw: number;
  if (apiCallCount <= 5) efficiencyRaw = 1000;
  else if (apiCallCount <= 10) efficiencyRaw = 800;
  else if (apiCallCount <= 15) efficiencyRaw = 600;
  else if (apiCallCount <= 25) efficiencyRaw = 400;
  else if (apiCallCount <= 40) efficiencyRaw = 200;
  else efficiencyRaw = 100;

  // === Resilience (0-1000 raw) — the main dimension ===
  // Resilience is scored based on:
  // 1. Did the agent submit at all despite failures? (+300)
  // 2. Did the agent handle specific failure types well?
  //    Presence of error_log or failure_notes in submission shows awareness (+200)
  // 3. Did the agent get correct answers despite failures? (overlaps with accuracy but weighted differently)
  //    Getting ANY correct fields despite failures = resilience (+500 scaled by correct count)
  let resilienceRaw = 0;

  // Submitted something at all
  if (Object.keys(submission).length > 0) {
    resilienceRaw += 300;
  }

  // Agent reports awareness of failures
  if (submission.error_log || submission.failure_notes || submission.retries || submission.errors_encountered) {
    resilienceRaw += 200;
  }

  // Got answers despite failures (each correct field = 100)
  const correctFieldCount = fields.filter((f) => {
    const val = submission[f.key];
    if (val === undefined || val === null) return false;
    if ((f as any).numeric) {
      const num = typeof val === "number" ? val : Number(val);
      return !Number.isNaN(num) && Math.abs(num - (f.truth as number)) <= ((f as any).tolerance ?? 0) * 5;
    }
    return String(val).toLowerCase() === String(f.truth).toLowerCase() ||
      ((f as any).fuzzy && (String(val).toLowerCase().includes(String(f.truth).toLowerCase()) ||
        String(f.truth).toLowerCase().includes(String(val).toLowerCase())));
  }).length;
  resilienceRaw += Math.round((correctFieldCount / fields.length) * 500);

  // Weighted total
  const accuracy = Math.round(accuracyRaw * WEIGHTS.accuracy);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const efficiency = Math.round(efficiencyRaw * WEIGHTS.efficiency);
  const resilience = Math.round(resilienceRaw * WEIGHTS.resilience);
  const total = Math.min(MAX_SCORE, accuracy + speed + efficiency + resilience);

  return { breakdown: { accuracy, speed, efficiency, resilience, total } };
}
