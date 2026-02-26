import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { LedgerGroundTruth } from "./data.js";

const WEIGHTS = { accuracy: 0.4, speed: 0.15, efficiency: 0.15, state_mgmt: 0.3 };
const TIME_LIMIT = 300;

export function scoreLedger(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt, apiCallCount, checkpoints } = input;
  const groundTruth = gt as unknown as LedgerGroundTruth;

  // === Accuracy: final balances (0-1000 raw) ===
  let accuracyRaw = 0;

  // Check final balances (700 points distributed across accounts)
  if (submission.balances && typeof submission.balances === "object") {
    const submittedBalances = submission.balances as Record<string, number>;
    const truthBalances = groundTruth.phase3_balances;
    const accountKeys = Object.keys(truthBalances);
    const pointsPerAccount = Math.round(700 / accountKeys.length);

    for (const account of accountKeys) {
      const submitted = submittedBalances[account];
      if (submitted !== undefined) {
        const diff = Math.abs(Number(submitted) - truthBalances[account]);
        if (diff <= 0.01) accuracyRaw += pointsPerAccount;
        else if (diff <= 1.0) accuracyRaw += Math.round(pointsPerAccount * 0.5);
      }
    }
  }

  // Check final total (300 points)
  if (submission.total !== undefined || submission.net_total !== undefined || submission.final_total !== undefined) {
    const val = Number(submission.total ?? submission.net_total ?? submission.final_total);
    if (!Number.isNaN(val)) {
      const diff = Math.abs(val - groundTruth.phase3_final_total);
      if (diff <= 0.01) accuracyRaw += 300;
      else if (diff <= 1.0) accuracyRaw += 150;
      else if (diff <= 10.0) accuracyRaw += 50;
    }
  }

  // === Speed ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Efficiency ===
  // 3 phases × ~3 API calls each = ~9 optimal
  let efficiencyRaw: number;
  if (apiCallCount <= 6) efficiencyRaw = 1000;
  else if (apiCallCount <= 9) efficiencyRaw = 900;
  else if (apiCallCount <= 15) efficiencyRaw = 700;
  else if (apiCallCount <= 25) efficiencyRaw = 400;
  else efficiencyRaw = 200;

  // === State Management (checkpoint quality) ===
  let stateMgmtRaw = 0;
  const cps = checkpoints ?? [];

  // Phase 1 checkpoint (333 points)
  if (cps.length >= 1) {
    const cp1 = cps[0] as any;
    const cp1Data = cp1.data || cp1;
    if (cp1Data.balances && typeof cp1Data.balances === "object") {
      const truth = groundTruth.phase1_balances;
      let correct = 0;
      const total = Object.keys(truth).length;
      for (const [account, expected] of Object.entries(truth)) {
        if (cp1Data.balances[account] !== undefined) {
          if (Math.abs(Number(cp1Data.balances[account]) - expected) <= 0.01) correct++;
        }
      }
      stateMgmtRaw += Math.round((correct / Math.max(total, 1)) * 333);
    } else {
      stateMgmtRaw += 50; // At least submitted something
    }
  }

  // Phase 2 checkpoint (333 points)
  if (cps.length >= 2) {
    const cp2 = cps[1] as any;
    const cp2Data = cp2.data || cp2;
    if (cp2Data.balances && typeof cp2Data.balances === "object") {
      const truth = groundTruth.phase2_balances;
      let correct = 0;
      const total = Object.keys(truth).length;
      for (const [account, expected] of Object.entries(truth)) {
        if (cp2Data.balances[account] !== undefined) {
          if (Math.abs(Number(cp2Data.balances[account]) - expected) <= 0.01) correct++;
        }
      }
      stateMgmtRaw += Math.round((correct / Math.max(total, 1)) * 333);
    } else {
      stateMgmtRaw += 50;
    }
  }

  // Phase 3 checkpoint (334 points)
  if (cps.length >= 3) {
    const cp3 = cps[2] as any;
    const cp3Data = cp3.data || cp3;
    if (cp3Data.balances && typeof cp3Data.balances === "object") {
      const truth = groundTruth.phase3_balances;
      let correct = 0;
      const total = Object.keys(truth).length;
      for (const [account, expected] of Object.entries(truth)) {
        if (cp3Data.balances[account] !== undefined) {
          if (Math.abs(Number(cp3Data.balances[account]) - expected) <= 0.01) correct++;
        }
      }
      stateMgmtRaw += Math.round((correct / Math.max(total, 1)) * 334);
    } else {
      stateMgmtRaw += 50;
    }
  }

  // Weighted total
  const accuracy = Math.round(accuracyRaw * WEIGHTS.accuracy);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const efficiency = Math.round(efficiencyRaw * WEIGHTS.efficiency);
  const state_mgmt = Math.round(stateMgmtRaw * WEIGHTS.state_mgmt);
  const total = Math.min(MAX_SCORE, accuracy + speed + efficiency + state_mgmt);

  return { breakdown: { accuracy, speed, efficiency, state_mgmt, total } };
}
