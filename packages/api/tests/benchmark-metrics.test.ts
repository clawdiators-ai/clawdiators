import { describe, it, expect } from "vitest";
import type { BenchmarkMetrics } from "@clawdiators/shared";

// ── Helpers (mirror analytics.ts logic for unit testing) ────────────

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

interface AttemptEntry {
  attempt: number;
  score: number;
  result: string;
}

function computeBenchmarkMetrics(
  agentAttempts: Record<string, AttemptEntry[]>,
): BenchmarkMetrics {
  // Score by attempt number
  const byAttempt: Record<number, number[]> = {};
  for (const entries of Object.values(agentAttempts)) {
    for (const e of entries) {
      if (!byAttempt[e.attempt]) byAttempt[e.attempt] = [];
      byAttempt[e.attempt].push(e.score);
    }
  }
  const scoreByAttemptNumber: Record<string, { mean: number; median: number; count: number }> = {};
  for (const [attempt, scores] of Object.entries(byAttempt)) {
    const sorted = [...scores].sort((a, b) => a - b);
    scoreByAttemptNumber[attempt] = {
      mean: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 10) / 10,
      median: median(sorted),
      count: sorted.length,
    };
  }

  // pass@1
  const firstAttempts = Object.values(agentAttempts)
    .map((entries) => entries.find((e) => e.attempt === 1))
    .filter(Boolean) as AttemptEntry[];
  const passAt1 =
    firstAttempts.length > 0
      ? firstAttempts.filter((e) => e.result === "win").length / firstAttempts.length
      : null;

  // best-of-k
  function bestOfK(k: number): number | null {
    const eligible = Object.values(agentAttempts).filter(
      (entries) => entries.filter((e) => e.attempt <= k).length >= 1,
    );
    if (eligible.length < 3) return null;
    const bests = eligible.map((entries) =>
      Math.max(...entries.filter((e) => e.attempt <= k).map((e) => e.score)),
    );
    return Math.round((bests.reduce((a, b) => a + b, 0) / bests.length) * 10) / 10;
  }

  // pass^k
  function passExpK(k: number): number | null {
    const eligible = Object.values(agentAttempts).filter(
      (entries) => entries.filter((e) => e.attempt <= k).length >= k,
    );
    if (eligible.length < 3) return null;
    const allWin = eligible.filter((entries) =>
      entries.filter((e) => e.attempt <= k).every((e) => e.result === "win"),
    );
    return Math.round((allWin.length / eligible.length) * 1000) / 1000;
  }

  return {
    pass_at_1: passAt1 !== null ? Math.round(passAt1 * 1000) / 1000 : undefined,
    best_of_3: bestOfK(3) ?? undefined,
    best_of_5: bestOfK(5) ?? undefined,
    pass_k_3: passExpK(3) ?? undefined,
    pass_k_5: passExpK(5) ?? undefined,
    learning_curve: {
      attempt_1_mean: scoreByAttemptNumber["1"]?.mean,
      attempt_2_mean: scoreByAttemptNumber["2"]?.mean,
      attempt_3_mean: scoreByAttemptNumber["3"]?.mean,
    },
    agents_sampled: Object.keys(agentAttempts).length,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("pass@1", () => {
  it("computes correctly with mixed results", () => {
    const agentAttempts: Record<string, AttemptEntry[]> = {
      a1: [{ attempt: 1, score: 800, result: "win" }],
      a2: [{ attempt: 1, score: 300, result: "loss" }],
      a3: [{ attempt: 1, score: 750, result: "win" }],
      a4: [{ attempt: 1, score: 500, result: "draw" }],
    };

    const metrics = computeBenchmarkMetrics(agentAttempts);
    // 2 wins out of 4 agents = 0.5
    expect(metrics.pass_at_1).toBe(0.5);
  });

  it("undefined when no data", () => {
    const metrics = computeBenchmarkMetrics({});
    expect(metrics.pass_at_1).toBeUndefined();
  });
});

describe("best-of-k", () => {
  it("selects max score from first k attempts per agent", () => {
    const agentAttempts: Record<string, AttemptEntry[]> = {
      a1: [
        { attempt: 1, score: 400, result: "draw" },
        { attempt: 2, score: 700, result: "win" },
        { attempt: 3, score: 600, result: "draw" },
      ],
      a2: [
        { attempt: 1, score: 500, result: "draw" },
        { attempt: 2, score: 800, result: "win" },
        { attempt: 3, score: 900, result: "win" },
      ],
      a3: [
        { attempt: 1, score: 300, result: "loss" },
        { attempt: 2, score: 350, result: "loss" },
        { attempt: 3, score: 500, result: "draw" },
      ],
    };

    const metrics = computeBenchmarkMetrics(agentAttempts);
    // best-of-3: max(400,700,600)=700, max(500,800,900)=900, max(300,350,500)=500
    // mean = (700+900+500)/3 = 700
    expect(metrics.best_of_3).toBe(700);
  });

  it("handles agents with fewer than k attempts", () => {
    const agentAttempts: Record<string, AttemptEntry[]> = {
      a1: [{ attempt: 1, score: 600, result: "draw" }], // only 1 attempt
      a2: [
        { attempt: 1, score: 500, result: "draw" },
        { attempt: 2, score: 700, result: "win" },
        { attempt: 3, score: 800, result: "win" },
      ],
      a3: [
        { attempt: 1, score: 400, result: "draw" },
        { attempt: 2, score: 450, result: "draw" },
      ],
    };

    const metrics = computeBenchmarkMetrics(agentAttempts);
    // best-of-3: all 3 agents have at least 1 attempt <= 3
    // a1: max(600)=600, a2: max(500,700,800)=800, a3: max(400,450)=450
    // mean = (600+800+450)/3 = 616.7
    expect(metrics.best_of_3).toBe(616.7);
  });

  it("returns undefined when fewer than 3 agents", () => {
    const agentAttempts: Record<string, AttemptEntry[]> = {
      a1: [{ attempt: 1, score: 800, result: "win" }],
      a2: [{ attempt: 1, score: 600, result: "draw" }],
    };

    const metrics = computeBenchmarkMetrics(agentAttempts);
    expect(metrics.best_of_3).toBeUndefined();
  });
});

describe("pass^k (reliability)", () => {
  it("detects all-win sequences", () => {
    const agentAttempts: Record<string, AttemptEntry[]> = {
      a1: [
        { attempt: 1, score: 800, result: "win" },
        { attempt: 2, score: 750, result: "win" },
        { attempt: 3, score: 900, result: "win" },
      ],
      a2: [
        { attempt: 1, score: 700, result: "win" },
        { attempt: 2, score: 300, result: "loss" },
        { attempt: 3, score: 800, result: "win" },
      ],
      a3: [
        { attempt: 1, score: 800, result: "win" },
        { attempt: 2, score: 800, result: "win" },
        { attempt: 3, score: 700, result: "win" },
      ],
    };

    const metrics = computeBenchmarkMetrics(agentAttempts);
    // pass^3: a1 all win, a2 has loss, a3 all win → 2/3
    expect(metrics.pass_k_3).toBe(0.667);
  });

  it("requires exactly k attempts (agents with fewer excluded)", () => {
    const agentAttempts: Record<string, AttemptEntry[]> = {
      a1: [
        { attempt: 1, score: 800, result: "win" },
        { attempt: 2, score: 750, result: "win" },
        { attempt: 3, score: 900, result: "win" },
      ],
      a2: [{ attempt: 1, score: 700, result: "win" }], // only 1 attempt, excluded
      a3: [
        { attempt: 1, score: 800, result: "win" },
        { attempt: 2, score: 800, result: "win" },
        { attempt: 3, score: 700, result: "win" },
      ],
      a4: [
        { attempt: 1, score: 800, result: "win" },
        { attempt: 2, score: 400, result: "draw" },
        { attempt: 3, score: 700, result: "win" },
      ],
    };

    const metrics = computeBenchmarkMetrics(agentAttempts);
    // Eligible for pass^3: a1 (3 attempts), a3 (3 attempts), a4 (3 attempts) — a2 excluded
    // All win: a1 yes, a3 yes, a4 no → 2/3
    expect(metrics.pass_k_3).toBe(0.667);
  });

  it("shows exponential decay for unreliable agents", () => {
    // If pass@1 = 0.6, then perfect reliability would be pass^3 ≈ 0.216
    const agentAttempts: Record<string, AttemptEntry[]> = {};
    // Create 10 agents, 6 always win, 4 always lose
    for (let i = 0; i < 10; i++) {
      const isWinner = i < 6;
      agentAttempts[`a${i}`] = [
        { attempt: 1, score: isWinner ? 800 : 300, result: isWinner ? "win" : "loss" },
        { attempt: 2, score: isWinner ? 750 : 350, result: isWinner ? "win" : "loss" },
        { attempt: 3, score: isWinner ? 900 : 200, result: isWinner ? "win" : "loss" },
      ];
    }

    const metrics = computeBenchmarkMetrics(agentAttempts);
    expect(metrics.pass_at_1).toBe(0.6);
    expect(metrics.pass_k_3).toBe(0.6); // same since winners always win, losers always lose
  });
});

describe("Learning curve", () => {
  it("groups scores by attempt number", () => {
    const agentAttempts: Record<string, AttemptEntry[]> = {
      a1: [
        { attempt: 1, score: 400, result: "draw" },
        { attempt: 2, score: 600, result: "draw" },
        { attempt: 3, score: 800, result: "win" },
      ],
      a2: [
        { attempt: 1, score: 500, result: "draw" },
        { attempt: 2, score: 700, result: "win" },
        { attempt: 3, score: 900, result: "win" },
      ],
    };

    const metrics = computeBenchmarkMetrics(agentAttempts);
    expect(metrics.learning_curve).toBeDefined();
    // attempt 1: mean(400, 500) = 450
    expect(metrics.learning_curve!.attempt_1_mean).toBe(450);
    // attempt 2: mean(600, 700) = 650
    expect(metrics.learning_curve!.attempt_2_mean).toBe(650);
    // attempt 3: mean(800, 900) = 850
    expect(metrics.learning_curve!.attempt_3_mean).toBe(850);
  });

  it("shows improvement pattern across attempts", () => {
    const agentAttempts: Record<string, AttemptEntry[]> = {
      a1: [
        { attempt: 1, score: 300, result: "loss" },
        { attempt: 2, score: 500, result: "draw" },
        { attempt: 3, score: 700, result: "win" },
      ],
      a2: [
        { attempt: 1, score: 400, result: "draw" },
        { attempt: 2, score: 600, result: "draw" },
        { attempt: 3, score: 800, result: "win" },
      ],
      a3: [
        { attempt: 1, score: 200, result: "loss" },
        { attempt: 2, score: 400, result: "draw" },
        { attempt: 3, score: 600, result: "draw" },
      ],
    };

    const metrics = computeBenchmarkMetrics(agentAttempts);
    const lc = metrics.learning_curve!;

    // Should show monotonic improvement
    expect(lc.attempt_2_mean!).toBeGreaterThan(lc.attempt_1_mean!);
    expect(lc.attempt_3_mean!).toBeGreaterThan(lc.attempt_2_mean!);
  });
});

describe("BenchmarkMetrics type", () => {
  it("agents_sampled counts distinct agents", () => {
    const agentAttempts: Record<string, AttemptEntry[]> = {
      a1: [{ attempt: 1, score: 500, result: "draw" }],
      a2: [{ attempt: 1, score: 600, result: "draw" }],
      a3: [{ attempt: 1, score: 700, result: "win" }],
    };

    const metrics = computeBenchmarkMetrics(agentAttempts);
    expect(metrics.agents_sampled).toBe(3);
  });

  it("empty data produces minimal metrics", () => {
    const metrics = computeBenchmarkMetrics({});
    expect(metrics.agents_sampled).toBe(0);
    expect(metrics.pass_at_1).toBeUndefined();
    expect(metrics.best_of_3).toBeUndefined();
    expect(metrics.best_of_5).toBeUndefined();
    expect(metrics.pass_k_3).toBeUndefined();
    expect(metrics.pass_k_5).toBeUndefined();
  });
});
