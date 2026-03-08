/**
 * Scorer for the autoresearch challenge.
 *
 * Scores are primarily based on val_bpb from the training service metrics.
 * The scorer reads serviceMetrics from the training-lab container to get
 * the best val_bpb achieved and the run history.
 *
 * Secondary dimensions score methodology (experiment log quality) and
 * analysis (improvement efficiency).
 */

import type { ScoringInput, ScoreResult } from "../types.js";

// ── Scoring constants ──

const MAX_SCORE = 1000;

// ML-related keywords for methodology scoring
const ML_KEYWORDS = [
  // Architecture
  "gelu", "swiglu", "silu", "relu", "activation",
  "pre-norm", "pre-ln", "post-norm", "layernorm", "rmsnorm",
  "weight tying", "weight_tying", "tied weights",
  "rotary", "rope", "positional", "embedding",
  "attention", "multi-head", "multi-query", "grouped-query",
  "residual", "skip connection",
  // Optimizer
  "adamw", "adam", "sgd", "muon", "lion", "sophia",
  "weight decay", "weight_decay",
  "gradient clipping", "grad_clip", "clip_grad",
  "learning rate", "lr", "cosine", "warmup",
  "beta1", "beta2", "momentum",
  // Training dynamics
  "loss spike", "diverge", "convergence", "plateau",
  "overfitting", "underfitting", "regularization", "dropout",
  "batch size", "batch_size", "gradient accumulation",
  "compute-optimal", "chinchilla", "scaling",
  "throughput", "tokens per second",
  // General ML
  "val_bpb", "bits per byte", "cross-entropy", "perplexity",
  "parameters", "depth", "width", "dimension",
  "experiment", "hypothesis", "baseline", "improvement",
];

// ── Scoring functions ──

function scoreCorrectness(
  bestValBpb: number | null,
  baselineValBpb: number,
  floorValBpb: number,
): number {
  if (bestValBpb === null || bestValBpb >= baselineValBpb) {
    return 0;
  }

  // Score = improvement fraction * MAX_SCORE
  const improvement = baselineValBpb - bestValBpb;
  const maxImprovement = baselineValBpb - floorValBpb;

  if (maxImprovement <= 0) return 0;

  const fraction = Math.min(1.0, improvement / maxImprovement);
  return Math.round(fraction * MAX_SCORE);
}

function scoreMethodology(methodology: string | undefined): number {
  if (!methodology || typeof methodology !== "string") return 0;

  const text = methodology.toLowerCase();

  // Length check — very short methodology is low effort
  if (text.length < 100) return Math.round(MAX_SCORE * 0.05);

  let score = 0;

  // 1. ML keyword coverage (0-400 points)
  const matchedKeywords = new Set<string>();
  for (const kw of ML_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      matchedKeywords.add(kw);
    }
  }
  const keywordCoverage = Math.min(1.0, matchedKeywords.size / 12);
  score += Math.round(keywordCoverage * 400);

  // 2. Structured experiment tracking (0-300 points)
  // Look for run numbering, val_bpb values, improvement markers
  const hasRunNumbers = /run\s*\d/i.test(text) || /experiment\s*\d/i.test(text);
  const hasValBpbValues = /val_bpb\s*[:=]\s*[\d.]+/i.test(text) || /\d\.\d{2,}/g.test(text);
  const hasComparisonWords = /(improvement|better|worse|improved|decreased|increased)/i.test(text);
  const hasSections = /^##\s/m.test(methodology) || /\n[-*]\s/m.test(methodology);

  if (hasRunNumbers) score += 75;
  if (hasValBpbValues) score += 75;
  if (hasComparisonWords) score += 75;
  if (hasSections) score += 75;

  // 3. Causal reasoning (0-200 points)
  const causalPatterns = [
    /because/i, /therefore/i, /this (caused|led to|resulted)/i,
    /due to/i, /which (means|implies|suggests)/i,
    /the reason/i, /hypothesis/i, /expected.*because/i,
  ];
  const causalMatches = causalPatterns.filter(p => p.test(text)).length;
  score += Math.round((Math.min(causalMatches, 4) / 4) * 200);

  // 4. Length bonus (0-100 points) — reward thoroughness
  const lengthScore = Math.min(1.0, text.length / 2000);
  score += Math.round(lengthScore * 100);

  return Math.min(MAX_SCORE, score);
}

function scoreSpeed(
  startedAt: Date,
  submittedAt: Date,
  timeLimitSecs: number = 2700,
): number {
  const elapsedMs = submittedAt.getTime() - startedAt.getTime();
  const elapsedSecs = elapsedMs / 1000;

  // Linear decay from 1.0 at t=0 to 0.0 at t=timeLimit
  const fraction = Math.max(0, 1 - elapsedSecs / timeLimitSecs);
  return Math.round(fraction * MAX_SCORE);
}

function scoreAnalysis(
  runHistory: Array<{ val_bpb: number | null; status: string }> | undefined,
): number {
  if (!runHistory || runHistory.length === 0) return 0;

  const completedRuns = runHistory.filter(
    (r) => r.status === "completed" && r.val_bpb !== null
  );

  if (completedRuns.length === 0) return 0;

  let score = 0;

  // 1. Improvement trajectory (0-500 points)
  // Count how many runs improved over the previous best
  let currentBest = completedRuns[0].val_bpb!;
  let improvements = 0;
  for (let i = 1; i < completedRuns.length; i++) {
    const bpb = completedRuns[i].val_bpb!;
    if (bpb < currentBest) {
      improvements++;
      currentBest = bpb;
    }
  }
  // Ratio of improving runs to total runs (excluding first)
  if (completedRuns.length > 1) {
    const improvementRatio = improvements / (completedRuns.length - 1);
    score += Math.round(improvementRatio * 500);
  }

  // 2. Efficiency (0-300 points)
  // Did the agent achieve good results in fewer runs?
  // Fewer runs with good improvement = more efficient = higher score
  const efficiencyBonus = Math.max(0, 1 - (completedRuns.length - 1) / 15);
  if (improvements > 0) {
    score += Math.round(efficiencyBonus * 300);
  }

  // 3. Completion bonus (0-200 points)
  // At least attempted multiple runs
  const attemptBonus = Math.min(1.0, completedRuns.length / 5);
  score += Math.round(attemptBonus * 200);

  return Math.min(MAX_SCORE, score);
}

// ── Main scorer ──

export function scoreAutoresearch(input: ScoringInput): ScoreResult {
  const { submission, groundTruth, startedAt, submittedAt, serviceMetrics } = input;

  const gt = groundTruth as {
    baselineValBpb: number;
    floorValBpb: number;
    corpusName: string;
  };

  // Extract metrics from training-lab service
  const labMetrics = serviceMetrics?.["training-lab"] as {
    best_val_bpb?: number | null;
    run_history?: Array<{ val_bpb: number | null; status: string }>;
    total_runs?: number;
    completed_runs?: number;
  } | undefined;

  const bestValBpb = labMetrics?.best_val_bpb ?? null;
  const runHistory = labMetrics?.run_history;

  // Score each dimension (raw 0-1000 before weighting)
  const correctnessRaw = scoreCorrectness(
    bestValBpb,
    gt.baselineValBpb,
    gt.floorValBpb,
  );

  const methodologyRaw = scoreMethodology(
    submission.methodology as string | undefined,
  );

  const speedRaw = scoreSpeed(startedAt, submittedAt);

  const analysisRaw = scoreAnalysis(runHistory);

  // Apply dimension weights (from AUTORESEARCH_DIMENSIONS: 0.60, 0.20, 0.10, 0.10)
  const correctness = Math.round(correctnessRaw * 0.60);
  const methodology = Math.round(methodologyRaw * 0.20);
  const speed = Math.round(speedRaw * 0.10);
  const analysis = Math.round(analysisRaw * 0.10);

  const total = correctness + methodology + speed + analysis;

  const details: Record<string, { score: number; max: number; note?: string }> = {
    val_bpb: {
      score: correctnessRaw,
      max: MAX_SCORE,
      note: bestValBpb !== null
        ? `Best val_bpb: ${bestValBpb.toFixed(4)} (baseline: ${gt.baselineValBpb.toFixed(4)}, floor: ${gt.floorValBpb.toFixed(4)})`
        : "No successful training runs completed",
    },
    runs: {
      score: labMetrics?.completed_runs ?? 0,
      max: 15,
      note: `${labMetrics?.completed_runs ?? 0} completed out of ${labMetrics?.total_runs ?? 0} attempted`,
    },
  };

  return {
    breakdown: {
      correctness,
      methodology,
      speed,
      analysis,
      total,
    },
    details,
  };
}
