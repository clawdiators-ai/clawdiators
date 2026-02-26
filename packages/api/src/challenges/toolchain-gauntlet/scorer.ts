import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { GauntletGroundTruth } from "./data.js";

const WEIGHTS = { accuracy: 0.35, speed: 0.15, efficiency: 0.25, style: 0.25 };
const TIME_LIMIT = 180;

export function scoreGauntlet(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt, apiCallCount, checkpoints } = input;
  const groundTruth = gt as unknown as GauntletGroundTruth;
  const optimal = groundTruth.optimalProduct;

  // === Accuracy (0-1000 raw) ===
  let accuracyRaw = 0;

  // SKU match (300)
  if (submission.sku !== undefined) {
    if (String(submission.sku).toUpperCase() === optimal.sku.toUpperCase()) {
      accuracyRaw += 300;
    }
  }

  // Final price (200, numeric ±0.05)
  if (submission.final_price !== undefined || submission.finalPrice !== undefined) {
    const val = Number(submission.final_price ?? submission.finalPrice);
    if (!Number.isNaN(val)) {
      const diff = Math.abs(val - optimal.finalPrice);
      if (diff <= 0.05) accuracyRaw += 200;
      else if (diff <= 0.5) accuracyRaw += 100;
    }
  }

  // Shipping cost (150, numeric ±0.05)
  if (submission.shipping_cost !== undefined || submission.shippingCost !== undefined) {
    const val = Number(submission.shipping_cost ?? submission.shippingCost);
    if (!Number.isNaN(val)) {
      const diff = Math.abs(val - optimal.shippingCost);
      if (diff <= 0.05) accuracyRaw += 150;
      else if (diff <= 0.5) accuracyRaw += 75;
    }
  }

  // Total cost (200, numeric ±0.10)
  if (submission.total_cost !== undefined || submission.totalCost !== undefined) {
    const val = Number(submission.total_cost ?? submission.totalCost);
    if (!Number.isNaN(val)) {
      const diff = Math.abs(val - optimal.totalCost);
      if (diff <= 0.10) accuracyRaw += 200;
      else if (diff <= 1.0) accuracyRaw += 100;
    }
  }

  // Carrier (100, exact)
  if (submission.carrier !== undefined) {
    if (String(submission.carrier).toLowerCase() === optimal.carrier.toLowerCase()) {
      accuracyRaw += 100;
    }
  }

  // Delivery days (50, exact)
  if (submission.delivery_days !== undefined || submission.deliveryDays !== undefined) {
    const val = Number(submission.delivery_days ?? submission.deliveryDays);
    if (val === optimal.deliveryDays) accuracyRaw += 50;
  }

  // === Speed ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Efficiency ===
  // With 6 APIs, optimal is ~6-8 calls (1-2 per API)
  let efficiencyRaw: number;
  if (apiCallCount <= 6) efficiencyRaw = 1000;
  else if (apiCallCount <= 8) efficiencyRaw = 900;
  else if (apiCallCount <= 12) efficiencyRaw = 700;
  else if (apiCallCount <= 18) efficiencyRaw = 500;
  else if (apiCallCount <= 30) efficiencyRaw = 300;
  else efficiencyRaw = 100;

  // === Style (chain orchestration quality) ===
  let styleRaw = 0;

  // Valid structured submission
  if (typeof submission === "object" && Object.keys(submission).length > 0) {
    styleRaw += 200;
  }

  // Used checkpoints (shows proper chain traversal)
  const cpCount = checkpoints?.length ?? 0;
  if (cpCount >= 1) styleRaw += 200; // At least one checkpoint
  if (cpCount >= 2) styleRaw += 200; // Two checkpoints (phase 1 + phase 2)
  if (cpCount >= 3) styleRaw += 200; // All three phases

  // Has expected fields
  const expectedKeys = ["sku", "final_price", "shipping_cost", "total_cost", "carrier", "delivery_days"];
  const altKeys = ["sku", "finalPrice", "shippingCost", "totalCost", "carrier", "deliveryDays"];
  const presentCount = expectedKeys.filter((k, i) => submission[k] !== undefined || submission[altKeys[i]] !== undefined).length;
  styleRaw += Math.round((presentCount / expectedKeys.length) * 200);

  // Weighted total
  const accuracy = Math.round(accuracyRaw * WEIGHTS.accuracy);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const efficiency = Math.round(efficiencyRaw * WEIGHTS.efficiency);
  const style = Math.round(styleRaw * WEIGHTS.style);
  const total = Math.min(MAX_SCORE, accuracy + speed + efficiency + style);

  return { breakdown: { accuracy, speed, efficiency, style, total } };
}
