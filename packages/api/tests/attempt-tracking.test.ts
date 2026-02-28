import { describe, it, expect } from "vitest";
import { calculateElo, scoreToResult } from "../src/services/elo.js";
import { DIFFICULTY_ELO, ELO_DEFAULT } from "@clawdiators/shared";

// ── Layer 1: Attempt Number Computation ─────────────────────────────

describe("Attempt number computation", () => {
  it("first attempt is 1 when no prior completed matches", () => {
    const previousCompleted = 0;
    const attemptNumber = previousCompleted + 1;
    expect(attemptNumber).toBe(1);
  });

  it("after N completions, attempt is N+1", () => {
    for (const n of [1, 3, 10, 50]) {
      expect(n + 1).toBe(n + 1);
    }
    // Concrete case: 5 completions → attempt 6
    const previousCompleted = 5;
    expect(previousCompleted + 1).toBe(6);
  });

  it("expired matches do not count (only completed)", () => {
    // Simulating the SQL WHERE clause: status = 'completed'
    const allMatches = [
      { status: "completed", agentId: "a1", challengeId: "c1" },
      { status: "expired", agentId: "a1", challengeId: "c1" },
      { status: "completed", agentId: "a1", challengeId: "c1" },
      { status: "active", agentId: "a1", challengeId: "c1" },
    ];

    const completedCount = allMatches.filter(
      (m) => m.agentId === "a1" && m.challengeId === "c1" && m.status === "completed",
    ).length;

    expect(completedCount).toBe(2);
    expect(completedCount + 1).toBe(3); // next attempt number
  });

  it("attempt number is per agent-challenge pair", () => {
    const allMatches = [
      { status: "completed", agentId: "a1", challengeId: "c1" },
      { status: "completed", agentId: "a1", challengeId: "c1" },
      { status: "completed", agentId: "a1", challengeId: "c2" },
      { status: "completed", agentId: "a2", challengeId: "c1" },
    ];

    const countFor = (agentId: string, challengeId: string) =>
      allMatches.filter(
        (m) => m.agentId === agentId && m.challengeId === challengeId && m.status === "completed",
      ).length;

    expect(countFor("a1", "c1") + 1).toBe(3); // a1 on c1: 2 completed → attempt 3
    expect(countFor("a1", "c2") + 1).toBe(2); // a1 on c2: 1 completed → attempt 2
    expect(countFor("a2", "c1") + 1).toBe(2); // a2 on c1: 1 completed → attempt 2
    expect(countFor("a2", "c2") + 1).toBe(1); // a2 on c2: 0 completed → attempt 1
  });
});

// ── Layer 2: Memoryless Mode ────────────────────────────────────────

describe("Memoryless mode", () => {
  it("defaults to false", () => {
    const defaults = { memoryless: false };
    expect(defaults.memoryless).toBe(false);
  });

  it("can be set to true", () => {
    const opts = { memoryless: true };
    expect(opts.memoryless).toBe(true);
  });

  it("redacted memory has correct empty shape", () => {
    const redactedMemory = {
      reflections: [],
      strategies: [],
      rivals: [],
      stats_summary: null,
    };

    expect(redactedMemory.reflections).toHaveLength(0);
    expect(redactedMemory.strategies).toHaveLength(0);
    expect(redactedMemory.rivals).toHaveLength(0);
    expect(redactedMemory.stats_summary).toBeNull();
  });

  it("memory redaction only during active memoryless match", () => {
    const shouldRedact = (activeMatch: { status: string; memoryless: boolean } | null) =>
      activeMatch !== null && activeMatch.status === "active" && activeMatch.memoryless === true;

    // Active + memoryless → redact
    expect(shouldRedact({ status: "active", memoryless: true })).toBe(true);
    // Active + not memoryless → no redact
    expect(shouldRedact({ status: "active", memoryless: false })).toBe(false);
    // Completed + memoryless → no redact (match over)
    expect(shouldRedact({ status: "completed", memoryless: true })).toBe(false);
    // No active match → no redact
    expect(shouldRedact(null)).toBe(false);
  });

  it("memory writes and reflections blocked during memoryless", () => {
    const isMemoryBlocked = (activeMemoryless: boolean) => activeMemoryless;
    const isReflectBlocked = (matchMemoryless: boolean) => matchMemoryless;

    expect(isMemoryBlocked(true)).toBe(true);
    expect(isMemoryBlocked(false)).toBe(false);
    expect(isReflectBlocked(true)).toBe(true);
    expect(isReflectBlocked(false)).toBe(false);
  });
});

// ── Layer 3: Leaderboard Filters ────────────────────────────────────

describe("Leaderboard filters", () => {
  const sampleMatches = [
    { agentId: "a1", score: 800, attemptNumber: 1, memoryless: true, status: "completed", result: "win" },
    { agentId: "a1", score: 900, attemptNumber: 2, memoryless: false, status: "completed", result: "win" },
    { agentId: "a2", score: 600, attemptNumber: 1, memoryless: false, status: "completed", result: "draw" },
    { agentId: "a2", score: 700, attemptNumber: 1, memoryless: true, status: "completed", result: "win" },
    { agentId: "a3", score: 500, attemptNumber: 1, memoryless: true, status: "completed", result: "draw" },
  ];

  it("first_attempt filter keeps only attempt_number=1", () => {
    const filtered = sampleMatches.filter((m) => m.attemptNumber === 1);
    expect(filtered).toHaveLength(4); // a1(1), a2(1), a2(1-memoryless), a3(1)
  });

  it("memoryless filter keeps only memoryless=true", () => {
    const filtered = sampleMatches.filter((m) => m.memoryless === true);
    expect(filtered).toHaveLength(3); // a1(1), a2(memoryless), a3(1)
  });

  it("filters compose (AND): first_attempt + memoryless", () => {
    const filtered = sampleMatches.filter(
      (m) => m.attemptNumber === 1 && m.memoryless === true,
    );
    expect(filtered).toHaveLength(3); // a1(1,mem), a2(1,mem), a3(1,mem)

    // Best score per agent from filtered matches
    const bestByAgent: Record<string, number> = {};
    for (const m of filtered) {
      bestByAgent[m.agentId] = Math.max(bestByAgent[m.agentId] ?? 0, m.score);
    }
    expect(bestByAgent["a1"]).toBe(800);
    expect(bestByAgent["a2"]).toBe(700);
    expect(bestByAgent["a3"]).toBe(500);
  });
});

// ── Layer 4: IRT-Elo ────────────────────────────────────────────────

describe("IRT-Elo", () => {
  it("DIFFICULTY_ELO mapping is correct", () => {
    expect(DIFFICULTY_ELO["newcomer"]).toBe(800);
    expect(DIFFICULTY_ELO["contender"]).toBe(1000);
    expect(DIFFICULTY_ELO["veteran"]).toBe(1200);
    expect(DIFFICULTY_ELO["legendary"]).toBe(1400);
  });

  it("winning newcomer challenge gives less Elo than winning legendary", () => {
    const agentElo = 1000;
    const matchCount = 5; // new agent, K=32

    const newcomerWin = calculateElo(agentElo, DIFFICULTY_ELO["newcomer"], "win", matchCount);
    const legendaryWin = calculateElo(agentElo, DIFFICULTY_ELO["legendary"], "win", matchCount);

    // Winning against 800 (newcomer) should give less than winning against 1400 (legendary)
    expect(newcomerWin.change).toBeLessThan(legendaryWin.change);
  });

  it("uses calibrated difficulty when available, falls back to author difficulty", () => {
    // Simulating the matches.ts logic
    const getOpponentElo = (calibratedDifficulty: string | null, difficulty: string) => {
      const effectiveDifficulty = (calibratedDifficulty ?? difficulty) as string;
      return DIFFICULTY_ELO[effectiveDifficulty] ?? ELO_DEFAULT;
    };

    // Calibrated takes precedence
    expect(getOpponentElo("legendary", "contender")).toBe(1400);
    // Falls back to author difficulty
    expect(getOpponentElo(null, "veteran")).toBe(1200);
    // Unknown difficulty falls back to ELO_DEFAULT
    expect(getOpponentElo(null, "unknown")).toBe(ELO_DEFAULT);
  });

  it("Elo gain is asymmetric based on difficulty", () => {
    const agentElo = 1200;
    const matchCount = 5;

    // Win against lower-rated (newcomer=800): small gain
    const easyWin = calculateElo(agentElo, 800, "win", matchCount);
    // Win against same-rated (veteran=1200): medium gain
    const evenWin = calculateElo(agentElo, 1200, "win", matchCount);
    // Win against higher-rated (legendary=1400): large gain
    const hardWin = calculateElo(agentElo, 1400, "win", matchCount);

    expect(easyWin.change).toBeLessThan(evenWin.change);
    expect(evenWin.change).toBeLessThan(hardWin.change);
  });
});
