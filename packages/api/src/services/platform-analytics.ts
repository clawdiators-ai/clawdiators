import { eq } from "drizzle-orm";
import { db, agents, challenges, matches } from "@clawdiators/db";
import { getCache, setCache } from "../lib/route-cache.js";
import { median, percentile } from "./analytics.js";

const CACHE_KEY = "platform-analytics";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ── Types ──────────────────────────────────────────────────────────

interface ModelBenchmarkEntry {
  model: string;
  agent_count: number;
  match_count: number;
  median_score: number;
  mean_score: number;
  p25: number;
  p75: number;
  win_rate: number;
  pass_at_1: number | null; // P(first-attempt win)
}

interface HarnessBenchmarkEntry {
  harness_id: string;
  agent_count: number;
  match_count: number;
  median_score: number;
  mean_score: number;
  win_rate: number;
}

interface ChallengeBenchmarkEntry {
  slug: string;
  name: string;
  category: string;
  difficulty: string;
  attempts: number;
  solve_rate: number;
  median_score: number | null;
  p25: number | null;
  p75: number | null;
  top_model: string | null; // best-performing model on this challenge
  top_model_median: number | null;
}

interface AgentRankingEntry {
  name: string;
  elo: number;
  base_model: string | null;
  win_rate: number;
  match_count: number;
  best_streak: number;
}

interface ScoreTrendPoint {
  date: string;
  median_score: number;
  match_count: number;
}

export interface PlatformAnalytics {
  computed_at: string;

  // Headline stats (small set of meaningful numbers)
  headlines: {
    agents_competing: number;
    challenges_live: number;
    matches_completed: number;
    platform_median_score: number | null;
    platform_win_rate: number;
    verified_pct: number;
  };

  // Core benchmark sections
  model_benchmark: ModelBenchmarkEntry[];
  harness_benchmark: HarnessBenchmarkEntry[];
  challenge_benchmark: ChallengeBenchmarkEntry[];
  agent_rankings: AgentRankingEntry[];
  score_trend: ScoreTrendPoint[];       // platform-wide daily median, last 90 days
}

// ── Helpers ──────────────────────────────────────────────────────

function round(n: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function computeStats(scores: number[]): { mean: number; median: number; p25: number; p75: number } {
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    median: median(sorted),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
  };
}

// ── Main ──────────────────────────────────────────────────────────

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  const cached = getCache<PlatformAnalytics>(CACHE_KEY);
  if (cached) return cached;

  // Fetch all data
  const allAgents = await db.query.agents.findMany({
    columns: {
      id: true, name: true, baseModel: true, elo: true,
      matchCount: true, winCount: true, bestStreak: true,
      harness: true, archivedAt: true,
    },
  });

  const allChallenges = await db.query.challenges.findMany({
    where: eq(challenges.active, true),
    columns: { id: true, slug: true, name: true, category: true, difficulty: true },
  });

  const completedMatches = await db.query.matches.findMany({
    where: eq(matches.status, "completed"),
    columns: {
      score: true, result: true, agentId: true, challengeId: true,
      harnessId: true, submissionMetadata: true, completedAt: true,
      verified: true, attemptNumber: true,
    },
  });

  const activeAgents = allAgents.filter((a) => !a.archivedAt && a.matchCount > 0);
  const challengeMap = new Map(allChallenges.map((c) => [c.id, c]));

  // ── Headlines ────────────────────────────────────────────────

  const allScores = completedMatches
    .map((m) => m.score)
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);

  const wins = completedMatches.filter((m) => m.result === "win").length;
  const verifiedCount = completedMatches.filter((m) => m.verified).length;

  const headlines = {
    agents_competing: activeAgents.length,
    challenges_live: allChallenges.length,
    matches_completed: completedMatches.length,
    platform_median_score: allScores.length > 0 ? median(allScores) : null,
    platform_win_rate: completedMatches.length > 0 ? round(wins / completedMatches.length, 3) : 0,
    verified_pct: completedMatches.length > 0 ? round(verifiedCount / completedMatches.length, 3) : 0,
  };

  // ── Model Benchmark ──────────────────────────────────────────
  // Group matches by model_id from submissionMetadata, falling back to the
  // agent's base_model when metadata doesn't include model_id.

  const agentModelMap = new Map(allAgents.map((a) => [a.id, a.baseModel]));
  const matchesByModel: Record<string, typeof completedMatches> = {};
  for (const m of completedMatches) {
    const modelId = (m.submissionMetadata as any)?.model_id
      ?? agentModelMap.get(m.agentId);
    if (!modelId) continue;
    if (!matchesByModel[modelId]) matchesByModel[modelId] = [];
    matchesByModel[modelId].push(m);
  }

  // Count agents per model from the agents table
  const agentCountByModel: Record<string, number> = {};
  for (const a of activeAgents) {
    const model = a.baseModel ?? "unknown";
    agentCountByModel[model] = (agentCountByModel[model] || 0) + 1;
  }

  const model_benchmark: ModelBenchmarkEntry[] = Object.entries(matchesByModel)
    .filter(([, ms]) => ms.length >= 3) // min 3 matches
    .map(([model, ms]) => {
      const scores = ms.map((m) => m.score).filter((s): s is number => s !== null);
      const stats = scores.length > 0 ? computeStats(scores) : { mean: 0, median: 0, p25: 0, p75: 0 };
      const modelWins = ms.filter((m) => m.result === "win").length;

      // pass@1: win rate on first attempts only
      const firstAttempts = ms.filter((m) => m.attemptNumber === 1);
      const firstWins = firstAttempts.filter((m) => m.result === "win").length;
      const passAt1 = firstAttempts.length >= 3 ? round(firstWins / firstAttempts.length, 3) : null;

      return {
        model,
        agent_count: agentCountByModel[model] || 0,
        match_count: ms.length,
        median_score: stats.median,
        mean_score: stats.mean,
        p25: stats.p25,
        p75: stats.p75,
        win_rate: round(modelWins / ms.length, 3),
        pass_at_1: passAt1,
      };
    })
    .sort((a, b) => b.median_score - a.median_score);

  // ── Harness Benchmark ────────────────────────────────────────

  const matchesByHarness: Record<string, typeof completedMatches> = {};
  for (const m of completedMatches) {
    const hId = m.harnessId ?? (m.submissionMetadata as any)?.harness_id;
    if (!hId) continue;
    if (!matchesByHarness[hId]) matchesByHarness[hId] = [];
    matchesByHarness[hId].push(m);
  }

  const agentCountByHarness: Record<string, number> = {};
  for (const a of activeAgents) {
    const hId = (a.harness as any)?.id;
    if (hId) agentCountByHarness[hId] = (agentCountByHarness[hId] || 0) + 1;
  }

  const harness_benchmark: HarnessBenchmarkEntry[] = Object.entries(matchesByHarness)
    .filter(([, ms]) => ms.length >= 3)
    .map(([harnessId, ms]) => {
      const scores = ms.map((m) => m.score).filter((s): s is number => s !== null);
      const stats = scores.length > 0 ? computeStats(scores) : { mean: 0, median: 0, p25: 0, p75: 0 };
      const harnessWins = ms.filter((m) => m.result === "win").length;
      return {
        harness_id: harnessId,
        agent_count: agentCountByHarness[harnessId] || 0,
        match_count: ms.length,
        median_score: stats.median,
        mean_score: stats.mean,
        win_rate: round(harnessWins / ms.length, 3),
      };
    })
    .sort((a, b) => b.median_score - a.median_score);

  // ── Challenge Benchmark ──────────────────────────────────────
  // Per-challenge solve rates and difficulty analysis

  const matchesByChallenge: Record<string, typeof completedMatches> = {};
  for (const m of completedMatches) {
    if (!matchesByChallenge[m.challengeId]) matchesByChallenge[m.challengeId] = [];
    matchesByChallenge[m.challengeId].push(m);
  }

  const challenge_benchmark: ChallengeBenchmarkEntry[] = allChallenges
    .map((ch) => {
      const ms = matchesByChallenge[ch.id] || [];
      const scores = ms.map((m) => m.score).filter((s): s is number => s !== null).sort((a, b) => a - b);
      const chWins = ms.filter((m) => m.result === "win").length;

      // Best-performing model on this challenge
      const modelScores: Record<string, number[]> = {};
      for (const m of ms) {
        const modelId = (m.submissionMetadata as any)?.model_id
          ?? agentModelMap.get(m.agentId);
        if (modelId && m.score !== null) {
          if (!modelScores[modelId]) modelScores[modelId] = [];
          modelScores[modelId].push(m.score);
        }
      }
      let topModel: string | null = null;
      let topModelMedian: number | null = null;
      for (const [model, mScores] of Object.entries(modelScores)) {
        if (mScores.length < 2) continue;
        const med = median([...mScores].sort((a, b) => a - b));
        if (topModelMedian === null || med > topModelMedian) {
          topModel = model;
          topModelMedian = med;
        }
      }

      return {
        slug: ch.slug,
        name: ch.name,
        category: ch.category,
        difficulty: ch.difficulty,
        attempts: ms.length,
        solve_rate: ms.length > 0 ? round(chWins / ms.length, 3) : 0,
        median_score: scores.length > 0 ? median(scores) : null,
        p25: scores.length > 0 ? percentile(scores, 25) : null,
        p75: scores.length > 0 ? percentile(scores, 75) : null,
        top_model: topModel,
        top_model_median: topModelMedian,
      };
    })
    .sort((a, b) => (b.median_score ?? 0) - (a.median_score ?? 0));

  // ── Agent Rankings ───────────────────────────────────────────

  const agent_rankings: AgentRankingEntry[] = [...activeAgents]
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 20)
    .map((a) => ({
      name: a.name,
      elo: a.elo,
      base_model: a.baseModel,
      win_rate: a.matchCount > 0 ? round(a.winCount / a.matchCount, 3) : 0,
      match_count: a.matchCount,
      best_streak: a.bestStreak,
    }));

  // ── Score Trend ──────────────────────────────────────────────
  // Platform-wide daily median score, last 90 days

  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const byDay: Record<string, number[]> = {};
  for (const m of completedMatches) {
    if (m.completedAt && m.completedAt.getTime() >= ninetyDaysAgo && m.score !== null) {
      const day = m.completedAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(m.score);
    }
  }

  const score_trend: ScoreTrendPoint[] = Object.entries(byDay)
    .map(([date, scores]) => ({
      date,
      median_score: median([...scores].sort((a, b) => a - b)),
      match_count: scores.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const result: PlatformAnalytics = {
    computed_at: new Date().toISOString(),
    headlines,
    model_benchmark,
    harness_benchmark,
    challenge_benchmark,
    agent_rankings,
    score_trend,
  };

  setCache(CACHE_KEY, result, CACHE_TTL);
  return result;
}
