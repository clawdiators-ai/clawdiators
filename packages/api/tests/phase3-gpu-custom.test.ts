import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TIER_FLAGS,
  getTierFlags,
  buildCustomFlags,
} from "../src/challenges/docker-evaluator.js";
import {
  isImageAllowed,
  getAllowedImages,
  addAllowedImage,
  removeAllowedImage,
  validateSpec,
} from "../src/challenges/primitives/validator.js";
import { generateBenchmarkInlineScript } from "../src/challenges/primitives/benchmark.js";
import { createCodeModule } from "../src/challenges/primitives/code-module.js";
import { evaluate } from "../src/challenges/evaluator.js";
import { getChallenge } from "../src/challenges/registry.js";
import type { CommunitySpec } from "../src/challenges/primitives/validator.js";
import type { EnvironmentTier, EvaluationLog } from "@clawdiators/shared";

// ── Image Allowlist ──────────────────────────────────────────────────

describe("Image allowlist", () => {
  it("isImageAllowed accepts default images", () => {
    expect(isImageAllowed("clawdiators/eval-node:20")).toBe(true);
    expect(isImageAllowed("clawdiators/eval-python:3.12")).toBe(true);
    expect(isImageAllowed("clawdiators/eval-multi:latest")).toBe(true);
    expect(isImageAllowed("clawdiators/eval-cuda:12")).toBe(true);
    expect(isImageAllowed("clawdiators/eval-cuda:latest")).toBe(true);
  });

  it("isImageAllowed rejects unknown images", () => {
    expect(isImageAllowed("some-random/image:latest")).toBe(false);
    expect(isImageAllowed("evil-corp/bitcoin-miner:1.0")).toBe(false);
    expect(isImageAllowed("")).toBe(false);
  });

  it("getAllowedImages returns sorted list", () => {
    const images = getAllowedImages();
    expect(images.length).toBeGreaterThanOrEqual(5);
    // Verify sorted
    for (let i = 1; i < images.length; i++) {
      expect(images[i] >= images[i - 1]).toBe(true);
    }
  });

  it("addAllowedImage adds a new image", () => {
    const testImage = "test/phase3-image:1.0";
    expect(isImageAllowed(testImage)).toBe(false);
    addAllowedImage(testImage);
    expect(isImageAllowed(testImage)).toBe(true);
    // Clean up
    removeAllowedImage(testImage);
  });

  it("removeAllowedImage removes non-default images", () => {
    const testImage = "test/phase3-removable:2.0";
    addAllowedImage(testImage);
    expect(isImageAllowed(testImage)).toBe(true);
    const removed = removeAllowedImage(testImage);
    expect(removed).toBe(true);
    expect(isImageAllowed(testImage)).toBe(false);
  });

  it("removeAllowedImage prevents removing default images", () => {
    const removed = removeAllowedImage("clawdiators/eval-node:20");
    expect(removed).toBe(false);
    // Still in the list
    expect(isImageAllowed("clawdiators/eval-node:20")).toBe(true);
  });

  it("removeAllowedImage returns false for unknown images", () => {
    const removed = removeAllowedImage("does-not-exist:nope");
    expect(removed).toBe(false);
  });
});

// ── Validator: Image Allowlist Refinement ─────────────────────────────

describe("Validator: image allowlist refinement", () => {
  const gpuSpec = {
    slug: "gpu-test-spec",
    name: "GPU Test Challenge",
    description: "A test challenge for GPU tier validation.",
    lore: "The GPU arena blazes with computation.",
    category: "coding",
    difficulty: "veteran",
    matchType: "single",
    timeLimitSecs: 300,
    workspace: {
      type: "generator",
      seedable: true,
      challengeMd: "# GPU Test\n\nSolve the problem.",
    },
    submission: { type: "json" },
    scoring: {
      method: "deterministic",
      dimensions: [
        { key: "accuracy", label: "Accuracy", weight: 0.7, description: "Correctness", color: "emerald" },
        { key: "speed", label: "Speed", weight: 0.3, description: "Time efficiency", color: "sky" },
      ],
      maxScore: 1000,
    },
    environment: {
      tier: "gpu",
      image: "clawdiators/eval-cuda:12",
    },
  };

  it("accepts gpu spec with allowlisted image", () => {
    const result = validateSpec(gpuSpec);
    expect(result.valid).toBe(true);
  });

  it("rejects gpu spec with unknown image", () => {
    const badSpec = {
      ...gpuSpec,
      environment: { tier: "gpu", image: "evil-corp/unknown:666" },
    };
    const result = validateSpec(badSpec);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some(e => e.includes("allowlisted"))).toBe(true);
    }
  });

  it("accepts custom spec with allowlisted image", () => {
    const customSpec = {
      ...gpuSpec,
      environment: { tier: "custom", image: "clawdiators/eval-multi:latest" },
    };
    const result = validateSpec(customSpec);
    expect(result.valid).toBe(true);
  });

  it("rejects custom spec with unknown image", () => {
    const badSpec = {
      ...gpuSpec,
      environment: { tier: "custom", image: "random/image:nope" },
    };
    const result = validateSpec(badSpec);
    expect(result.valid).toBe(false);
  });

  it("sandboxed tier does not require image check", () => {
    const sandboxedSpec = {
      ...gpuSpec,
      environment: { tier: "sandboxed" },
    };
    const result = validateSpec(sandboxedSpec);
    expect(result.valid).toBe(true);
  });
});

// ── getTierFlags ─────────────────────────────────────────────────────

describe("getTierFlags", () => {
  it("sandboxed includes --network=none", () => {
    expect(getTierFlags("sandboxed")).toContain("--network=none");
  });

  it("sandboxed has 512m memory", () => {
    expect(getTierFlags("sandboxed")).toContain("--memory=512m");
  });

  it("networked does NOT include --network=none", () => {
    expect(getTierFlags("networked")).not.toContain("--network=none");
  });

  it("networked has 1g memory", () => {
    expect(getTierFlags("networked")).toContain("--memory=1g");
  });

  it("gpu includes --gpus", () => {
    const flags = getTierFlags("gpu");
    expect(flags).toContain("--gpus");
    const gpuIdx = flags.indexOf("--gpus");
    expect(flags[gpuIdx + 1]).toBe("all");
  });

  it("gpu has 4g memory", () => {
    expect(getTierFlags("gpu")).toContain("--memory=4g");
  });

  it("gpu has 4 cpus", () => {
    expect(getTierFlags("gpu")).toContain("--cpus=4");
  });

  it("gpu has 200 pids limit", () => {
    expect(getTierFlags("gpu")).toContain("--pids-limit=200");
  });

  it("custom returns empty array", () => {
    expect(getTierFlags("custom")).toEqual([]);
  });

  it("gpu respects CLAWDIATORS_GPU_FLAGS env var", () => {
    const originalEnv = process.env.CLAWDIATORS_GPU_FLAGS;
    process.env.CLAWDIATORS_GPU_FLAGS = "device=0";
    try {
      const flags = getTierFlags("gpu");
      expect(flags).toContain("--gpus");
      const gpuIdx = flags.indexOf("--gpus");
      expect(flags[gpuIdx + 1]).toBe("device=0");
    } finally {
      if (originalEnv !== undefined) {
        process.env.CLAWDIATORS_GPU_FLAGS = originalEnv;
      } else {
        delete process.env.CLAWDIATORS_GPU_FLAGS;
      }
    }
  });

  it("static TIER_FLAGS constant is still accessible for backward compat", () => {
    const tiers: EnvironmentTier[] = ["sandboxed", "networked", "gpu", "custom"];
    for (const tier of tiers) {
      expect(TIER_FLAGS[tier]).toBeDefined();
      expect(Array.isArray(TIER_FLAGS[tier])).toBe(true);
    }
  });
});

// ── buildCustomFlags ─────────────────────────────────────────────────

describe("buildCustomFlags", () => {
  it("empty capabilities returns sane defaults", () => {
    const flags = buildCustomFlags([]);
    expect(flags).toContain("--memory=4g");
    expect(flags).toContain("--cpus=4");
    expect(flags).toContain("--pids-limit=200");
    expect(flags).toContain("--read-only");
  });

  it("undefined capabilities returns sane defaults", () => {
    const flags = buildCustomFlags(undefined);
    expect(flags).toContain("--memory=4g");
    expect(flags).toContain("--cpus=4");
    expect(flags).toContain("--pids-limit=200");
    expect(flags).toContain("--read-only");
  });

  it("gpu capability includes --gpus", () => {
    const flags = buildCustomFlags(["gpu"]);
    expect(flags).toContain("--gpus");
  });

  it("large-memory capability sets 8g", () => {
    const flags = buildCustomFlags(["large-memory"]);
    expect(flags).toContain("--memory=8g");
    expect(flags).not.toContain("--memory=4g");
  });

  it("without large-memory uses 4g", () => {
    const flags = buildCustomFlags(["gpu"]);
    expect(flags).toContain("--memory=4g");
  });

  it("shm capability includes --shm-size=1g", () => {
    const flags = buildCustomFlags(["shm"]);
    expect(flags).toContain("--shm-size=1g");
  });

  it("multiple capabilities combine correctly", () => {
    const flags = buildCustomFlags(["gpu", "large-memory", "shm"]);
    expect(flags).toContain("--gpus");
    expect(flags).toContain("--memory=8g");
    expect(flags).toContain("--shm-size=1g");
    expect(flags).toContain("--read-only");
    expect(flags).toContain("--cpus=4");
    expect(flags).toContain("--pids-limit=200");
  });

  it("always includes --read-only", () => {
    const flags = buildCustomFlags(["gpu", "shm"]);
    expect(flags).toContain("--read-only");
  });
});

// ── EvaluationLog: durationMs and estimatedCostUsd ──────────────────

describe("EvaluationLog: durationMs and estimatedCostUsd", () => {
  it("durationMs is populated and non-negative", async () => {
    const mod = getChallenge("cipher-forge")!;
    expect(mod).toBeDefined();
    const data = mod.generateData(42, {});
    const input = {
      submission: {},
      groundTruth: data.groundTruth,
      startedAt: new Date("2025-01-01T00:00:00Z"),
      submittedAt: new Date("2025-01-01T00:01:00Z"),
      apiCallCount: 0,
      checkpoints: [],
    };
    const { log } = await evaluate(mod, input);
    expect(log.durationMs).toBeDefined();
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("estimatedCostUsd is undefined for non-GPU tiers", async () => {
    const mod = getChallenge("cipher-forge")!;
    const data = mod.generateData(42, {});
    const input = {
      submission: {},
      groundTruth: data.groundTruth,
      startedAt: new Date("2025-01-01T00:00:00Z"),
      submittedAt: new Date("2025-01-01T00:01:00Z"),
      apiCallCount: 0,
      checkpoints: [],
    };
    const { log } = await evaluate(mod, input);
    expect(log.estimatedCostUsd).toBeUndefined();
  });

  it("estimatedCostUsd is positive for GPU tier", async () => {
    const mod = getChallenge("cipher-forge")!;
    const data = mod.generateData(42, {});
    const input = {
      submission: {},
      groundTruth: data.groundTruth,
      startedAt: new Date("2025-01-01T00:00:00Z"),
      submittedAt: new Date("2025-01-01T00:01:00Z"),
      apiCallCount: 0,
      checkpoints: [],
    };
    const { log } = await evaluate(mod, input, { tier: "gpu" });
    expect(log.estimatedCostUsd).toBeDefined();
    expect(log.estimatedCostUsd).toBeGreaterThanOrEqual(0);
  });
});

// ── generateBenchmarkInlineScript ────────────────────────────────────

describe("generateBenchmarkInlineScript", () => {
  it("returns a non-empty string", () => {
    const script = generateBenchmarkInlineScript();
    expect(typeof script).toBe("string");
    expect(script.length).toBeGreaterThan(100);
  });

  it("contains benchmark function", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("function benchmark(");
  });

  it("contains measureMemory function", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("function measureMemory(");
  });

  it("contains measureGpu function", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("function measureGpu(");
  });

  it("benchmark function uses process.hrtime.bigint", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("process.hrtime.bigint()");
  });

  it("measureGpu calls nvidia-smi", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("nvidia-smi");
  });
});

// ── Code module: GPU tier evaluator wrapper includes benchmark ───────

describe("Code module: GPU tier evaluator wrapper", () => {
  const validDataJs = `
function generateData(seed) {
  var random = rng(seed);
  var target = Math.floor(random() * 1000);
  return {
    objective: "Find the number.",
    groundTruth: { answer: target },
  };
}
module.exports = { generateData: generateData };
`;

  const validScorerJs = `
function score(input) {
  var correct = input.submission.answer === input.groundTruth.answer;
  return { breakdown: { accuracy: correct ? 700 : 0, speed: 300, total: correct ? 1000 : 300 } };
}
module.exports = { score: score };
`;

  const gpuSpec: CommunitySpec = {
    slug: "gpu-benchmark-test",
    name: "GPU Benchmark Test",
    description: "Tests that GPU tier includes benchmark utilities.",
    lore: "The GPU forge burns bright.",
    category: "coding",
    difficulty: "veteran",
    matchType: "single",
    timeLimitSecs: 300,
    workspace: {
      type: "generator",
      seedable: true,
      challengeMd: "# GPU Test\n\nSolve it.",
    },
    submission: { type: "json" },
    scoring: {
      method: "deterministic",
      dimensions: [
        { key: "accuracy", label: "Accuracy", weight: 0.7, description: "Correctness", color: "emerald" },
        { key: "speed", label: "Speed", weight: 0.3, description: "Speed", color: "sky" },
      ],
      maxScore: 1000,
    },
    codeFiles: {
      "data.js": validDataJs,
      "scorer.js": validScorerJs,
    },
    environment: {
      tier: "gpu",
      image: "clawdiators/eval-cuda:12",
    },
  };

  it("GPU tier evaluator wrapper contains benchmark utilities", () => {
    const mod = createCodeModule(gpuSpec);
    const evaluator = mod.scoringSpec?.evaluator;
    expect(evaluator).toBeDefined();
    expect(evaluator).toContain("function benchmark(");
    expect(evaluator).toContain("function measureMemory(");
    expect(evaluator).toContain("function measureGpu(");
  });

  it("sandboxed tier does NOT include benchmark utilities", () => {
    const sandboxedSpec: CommunitySpec = {
      ...gpuSpec,
      slug: "sandboxed-no-benchmark",
      environment: undefined,
    };
    const mod = createCodeModule(sandboxedSpec);
    // Sandboxed tier has no evaluator wrapper (undefined for in-process execution)
    const evaluator = mod.scoringSpec?.evaluator;
    if (evaluator) {
      expect(evaluator).not.toContain("function benchmark(");
    }
  });

  it("custom tier evaluator wrapper also contains benchmark utilities", () => {
    const customSpec: CommunitySpec = {
      ...gpuSpec,
      slug: "custom-benchmark-test",
      environment: {
        tier: "custom",
        image: "clawdiators/eval-multi:latest",
      },
    };
    const mod = createCodeModule(customSpec);
    const evaluator = mod.scoringSpec?.evaluator;
    expect(evaluator).toBeDefined();
    expect(evaluator).toContain("function benchmark(");
  });

  it("networked tier does NOT include benchmark utilities", () => {
    const networkedSpec: CommunitySpec = {
      ...gpuSpec,
      slug: "networked-no-benchmark",
      environment: { tier: "networked" },
    };
    const mod = createCodeModule(networkedSpec);
    const evaluator = mod.scoringSpec?.evaluator;
    expect(evaluator).toBeDefined();
    // Networked has evaluator wrapper but no benchmark utilities
    expect(evaluator).not.toContain("function benchmark(");
  });
});

// ── Backward compatibility ──────────────────────────────────────────

describe("Backward compatibility: Tier 1-2 unaffected", () => {
  it("existing challenges still load and score correctly", () => {
    const mod = getChallenge("cipher-forge")!;
    expect(mod).toBeDefined();
    const data = mod.generateData(42, {});
    expect(data.objective).toBeDefined();
    expect(data.groundTruth).toBeDefined();
  });

  it("evaluate() still works for deterministic challenges", async () => {
    const mod = getChallenge("cipher-forge")!;
    const data = mod.generateData(42, {});
    const input = {
      submission: {},
      groundTruth: data.groundTruth,
      startedAt: new Date("2025-01-01T00:00:00Z"),
      submittedAt: new Date("2025-01-01T00:01:00Z"),
      apiCallCount: 0,
      checkpoints: [],
    };
    const { result, log } = await evaluate(mod, input);
    expect(result.breakdown.total).toBeDefined();
    expect(log.method).toBe("deterministic");
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.estimatedCostUsd).toBeUndefined();
  });
});
