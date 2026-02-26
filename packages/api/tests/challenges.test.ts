import { describe, it, expect } from "vitest";
import { generateCascadingData } from "../src/challenges/cascading-failure/data.js";
import { scoreCascading } from "../src/challenges/cascading-failure/scorer.js";
import { generateGauntletData } from "../src/challenges/toolchain-gauntlet/data.js";
import { scoreGauntlet } from "../src/challenges/toolchain-gauntlet/scorer.js";
import { generateLedgerData } from "../src/challenges/tide-ledger/data.js";
import { scoreLedger } from "../src/challenges/tide-ledger/scorer.js";
import { generateMappingData } from "../src/challenges/deep-mapping/data.js";
import { scoreMapping } from "../src/challenges/deep-mapping/scorer.js";
import { generateCipherData } from "../src/challenges/cipher-forge/data.js";
import { scoreCipher } from "../src/challenges/cipher-forge/scorer.js";
import { generateLogicData } from "../src/challenges/logic-reef/data.js";
import { scoreLogic } from "../src/challenges/logic-reef/scorer.js";
import { generateRefactorData } from "../src/challenges/reef-refactor/data.js";
import { scoreRefactor } from "../src/challenges/reef-refactor/scorer.js";

// ── Cascading Failure ────────────────────────────────────────────────

describe("Cascading Failure data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateCascadingData(42);
    const d2 = generateCascadingData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.weather).toEqual(d2.weather);
    expect(d1.objective).toEqual(d2.objective);
  });

  it("different seeds produce different data", () => {
    const d1 = generateCascadingData(42);
    const d2 = generateCascadingData(99);
    expect(d1.groundTruth.target_ticker).not.toBe(d2.groundTruth.target_ticker);
  });

  it("has a failure schedule", () => {
    const d = generateCascadingData(42);
    expect(d.groundTruth.failure_schedule.length).toBeGreaterThan(0);
    for (const f of d.groundTruth.failure_schedule) {
      expect(f.callNumber).toBeGreaterThan(0);
      expect(["500", "malformed", "404", "stale", "timeout"]).toContain(f.type);
    }
  });
});

describe("Cascading Failure scoring", () => {
  const data = generateCascadingData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub = { ticker: gt.target_ticker };
    const r1 = scoreCascading({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 10 });
    const r2 = scoreCascading({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 10 });
    expect(r1).toEqual(r2);
  });

  it("scores resilience higher for agents that report errors", () => {
    const withErrors = scoreCascading({
      submission: { ticker: gt.target_ticker, error_log: ["500 on weather"] },
      groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 15,
    });
    const withoutErrors = scoreCascading({
      submission: { ticker: gt.target_ticker },
      groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 15,
    });
    expect(withErrors.breakdown.resilience).toBeGreaterThan(withoutErrors.breakdown.resilience);
  });

  it("score never exceeds 1000", () => {
    const r = scoreCascading({
      submission: { ticker: gt.target_ticker, close_price: gt.target_close_price, headline: gt.target_article_headline, sentiment: gt.target_sentiment, price_change_pct: gt.price_change_pct, error_log: ["handled"] },
      groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 3,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Tool-Chain Gauntlet ──────────────────────────────────────────────

describe("Tool-Chain Gauntlet data generation", () => {
  it("is deterministic", () => {
    const d1 = generateGauntletData(42);
    const d2 = generateGauntletData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.registry).toEqual(d2.registry);
  });

  it("different seeds produce different data", () => {
    const d1 = generateGauntletData(42);
    const d2 = generateGauntletData(999);
    expect(d1.groundTruth.optimalProduct.sku).not.toBe(d2.groundTruth.optimalProduct.sku);
  });

  it("generates all 6 API datasets", () => {
    const d = generateGauntletData(42);
    expect(d.registry.length).toBeGreaterThan(0);
    expect(d.inventory.length).toBeGreaterThan(0);
    expect(d.pricing.length).toBeGreaterThan(0);
    expect(d.shipping.length).toBeGreaterThan(0);
    expect(d.loyalty.customerId).toBeDefined();
    expect(d.audit.length).toBeGreaterThan(0);
  });

  it("optimal product is in stock, compliant, and cheapest", () => {
    const d = generateGauntletData(42);
    const opt = d.groundTruth.optimalProduct;
    // In stock
    const inStock = d.inventory.find((i) => i.sku === opt.sku && i.warehouse === opt.warehouse);
    expect(inStock).toBeDefined();
    expect(inStock!.quantity).toBeGreaterThan(0);
    // Compliant
    const audit = d.audit.find((a) => a.sku === opt.sku);
    expect(audit?.compliant).toBe(true);
  });
});

describe("Tool-Chain Gauntlet scoring", () => {
  const data = generateGauntletData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub = { sku: gt.optimalProduct.sku };
    const r1 = scoreGauntlet({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 6 });
    const r2 = scoreGauntlet({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 6 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer with checkpoints gets high score", () => {
    const r = scoreGauntlet({
      submission: {
        sku: gt.optimalProduct.sku,
        final_price: gt.optimalProduct.finalPrice,
        shipping_cost: gt.optimalProduct.shippingCost,
        total_cost: gt.optimalProduct.totalCost,
        carrier: gt.optimalProduct.carrier,
        delivery_days: gt.optimalProduct.deliveryDays,
      },
      groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 6,
      checkpoints: [{}, {}, {}],
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
  });
});

// ── Tide Ledger ──────────────────────────────────────────────────────

describe("Tide Ledger data generation", () => {
  it("is deterministic", () => {
    const d1 = generateLedgerData(42);
    const d2 = generateLedgerData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.phase1_transactions).toEqual(d2.phase1_transactions);
  });

  it("different seeds produce different data", () => {
    const d1 = generateLedgerData(42);
    const d2 = generateLedgerData(999);
    expect(d1.groundTruth.phase3_final_total).not.toBe(d2.groundTruth.phase3_final_total);
  });

  it("generates correct phase sizes", () => {
    const d = generateLedgerData(42);
    expect(d.phase1_transactions).toHaveLength(50);
    expect(d.phase2_amendments).toHaveLength(30);
    expect(d.phase3_rollbacks).toHaveLength(20);
    expect(d.phase3_new_transactions).toHaveLength(10);
  });

  it("phase1 balances are internally consistent", () => {
    const d = generateLedgerData(42);
    const computed: Record<string, number> = {};
    for (const txn of d.phase1_transactions) {
      if (!computed[txn.account]) computed[txn.account] = 0;
      if (txn.type === "credit") computed[txn.account] = Math.round((computed[txn.account] + txn.amount) * 100) / 100;
      else computed[txn.account] = Math.round((computed[txn.account] - txn.amount) * 100) / 100;
    }
    expect(computed).toEqual(d.groundTruth.phase1_balances);
  });
});

describe("Tide Ledger scoring", () => {
  const data = generateLedgerData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub = { balances: gt.phase3_balances, total: gt.phase3_final_total };
    const r1 = scoreLedger({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 6 });
    const r2 = scoreLedger({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 6 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer with checkpoints gets high score", () => {
    const r = scoreLedger({
      submission: { balances: gt.phase3_balances, total: gt.phase3_final_total },
      groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 6,
      checkpoints: [
        { data: { balances: gt.phase1_balances } },
        { data: { balances: gt.phase2_balances } },
        { data: { balances: gt.phase3_balances } },
      ],
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
  });
});

// ── Deep Mapping ─────────────────────────────────────────────────────

describe("Deep Mapping data generation", () => {
  it("is deterministic", () => {
    const d1 = generateMappingData(42);
    const d2 = generateMappingData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.nodes).toEqual(d2.nodes);
  });

  it("different seeds produce different data", () => {
    const d1 = generateMappingData(42);
    const d2 = generateMappingData(999);
    expect(d1.groundTruth.deepestNode.id).not.toBe(d2.groundTruth.deepestNode.id);
  });

  it("generates 30-40 nodes", () => {
    const d = generateMappingData(42);
    expect(d.nodes.length).toBeGreaterThanOrEqual(30);
    expect(d.nodes.length).toBeLessThanOrEqual(40);
  });

  it("graph is connected (all nodes reachable from start)", () => {
    const d = generateMappingData(42);
    const visited = new Set<string>();
    const queue = [d.startNodeId];
    visited.add(d.startNodeId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = d.nodes.find((n) => n.id === current);
      if (!node) continue;
      for (const conn of node.connections) {
        if (!visited.has(conn)) {
          visited.add(conn);
          queue.push(conn);
        }
      }
    }
    expect(visited.size).toBe(d.nodes.length);
  });
});

describe("Deep Mapping scoring", () => {
  const data = generateMappingData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub = { nodes_discovered: 20 };
    const r1 = scoreMapping({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 600000), apiCallCount: 20 });
    const r2 = scoreMapping({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 600000), apiCallCount: 20 });
    expect(r1).toEqual(r2);
  });

  it("full coverage gets high coverage score", () => {
    const r = scoreMapping({
      submission: {
        nodes_discovered: gt.totalNodes,
        deepest_node: gt.deepestNode.id,
        most_connected_node: gt.mostConnectedNode.id,
        resources_by_type: gt.resourcesByType,
        total_resource_value: gt.totalResourceValue,
        best_path: gt.optimalPath,
        path_value: gt.optimalPathValue,
      },
      groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 600000),
      apiCallCount: gt.totalNodes,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(600);
  });

  it("score never exceeds 1000", () => {
    const r = scoreMapping({
      submission: {
        nodes_discovered: gt.totalNodes,
        deepest_node: gt.deepestNode.id,
        most_connected_node: gt.mostConnectedNode.id,
        resources_by_type: gt.resourcesByType,
        total_resource_value: gt.totalResourceValue,
        best_path: gt.optimalPath,
        path_value: gt.optimalPathValue,
      },
      groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000),
      apiCallCount: gt.totalNodes,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Cipher Forge ────────────────────────────────────────────────────

describe("Cipher Forge data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateCipherData(42);
    const d2 = generateCipherData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.messages).toEqual(d2.messages);
  });

  it("different seeds produce different data", () => {
    const d1 = generateCipherData(42);
    const d2 = generateCipherData(99);
    expect(d1.groundTruth.messages[0].plaintext).not.toBe(d2.groundTruth.messages[0].plaintext);
  });

  it("generates 5 messages with progressive difficulty", () => {
    const d = generateCipherData(42);
    expect(d.messages).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(d.messages[i].difficulty).toBe(i + 1);
    }
  });

  it("generates different cipher types", () => {
    const d = generateCipherData(42);
    const types = d.messages.map((m) => m.cipher_type);
    expect(types).toContain("caesar");
    expect(types).toContain("substitution");
    expect(types).toContain("vigenere");
    expect(types).toContain("transposition");
    expect(types).toContain("combined");
  });

  it("provides a reference table", () => {
    const d = generateCipherData(42);
    expect(d.reference_table.most_common).toBeDefined();
  });
});

describe("Cipher Forge scoring", () => {
  const data = generateCipherData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub: Record<string, unknown> = {};
    sub[gt.messages[0].id] = gt.messages[0].plaintext;
    const r1 = scoreCipher({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 2 });
    const r2 = scoreCipher({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 2 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const msg of gt.messages) {
      sub[msg.id] = msg.plaintext;
    }
    const r = scoreCipher({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 1,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const msg of gt.messages) {
      sub[msg.id] = msg.plaintext;
    }
    const r = scoreCipher({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 1,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Logic Reef ──────────────────────────────────────────────────────

describe("Logic Reef data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateLogicData(42);
    const d2 = generateLogicData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.puzzles).toEqual(d2.puzzles);
  });

  it("different seeds produce different data", () => {
    const d1 = generateLogicData(42);
    const d2 = generateLogicData(99);
    expect(d1.puzzles[0].premises).not.toEqual(d2.puzzles[0].premises);
  });

  it("generates 6 puzzles (3 propositional + 3 constraint)", () => {
    const d = generateLogicData(42);
    expect(d.puzzles).toHaveLength(6);
    const propCount = d.puzzles.filter((p) => p.type === "propositional").length;
    const cspCount = d.puzzles.filter((p) => p.type === "constraint").length;
    expect(propCount).toBe(3);
    expect(cspCount).toBe(3);
  });

  it("each puzzle has premises, rules, and a question", () => {
    const d = generateLogicData(42);
    for (const p of d.puzzles) {
      expect(p.premises.length).toBeGreaterThan(0);
      expect(p.rules.length).toBeGreaterThan(0);
      expect(p.question.length).toBeGreaterThan(0);
    }
  });
});

describe("Logic Reef scoring", () => {
  const data = generateLogicData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub: Record<string, unknown> = {};
    sub[gt.puzzles[0].id] = gt.puzzles[0].answer;
    const r1 = scoreLogic({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 1 });
    const r2 = scoreLogic({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 1 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const puzzle of gt.puzzles) {
      sub[puzzle.id] = puzzle.answer;
    }
    sub.reasoning = "By logical deduction.";
    const r = scoreLogic({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 1,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const puzzle of gt.puzzles) {
      sub[puzzle.id] = puzzle.answer;
    }
    sub.reasoning = "Short.";
    const r = scoreLogic({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 1,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Reef Refactor ───────────────────────────────────────────────────

describe("Reef Refactor data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateRefactorData(42);
    const d2 = generateRefactorData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.functions).toEqual(d2.functions);
  });

  it("different seeds produce different data", () => {
    const d1 = generateRefactorData(42);
    const d2 = generateRefactorData(99);
    const outputs1 = JSON.stringify(d1.groundTruth);
    const outputs2 = JSON.stringify(d2.groundTruth);
    expect(outputs1).not.toBe(outputs2);
  });

  it("generates 5 broken functions", () => {
    const d = generateRefactorData(42);
    expect(d.functions).toHaveLength(5);
  });

  it("each function has test cases", () => {
    const d = generateRefactorData(42);
    for (const fn of d.functions) {
      expect(fn.test_cases.length).toBeGreaterThanOrEqual(2);
      expect(fn.code.length).toBeGreaterThan(0);
      expect(fn.bug_description.length).toBeGreaterThan(0);
    }
  });

  it("ground truth has matching function count", () => {
    const d = generateRefactorData(42);
    expect(d.groundTruth.functions).toHaveLength(5);
  });
});

describe("Reef Refactor scoring", () => {
  const data = generateRefactorData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub: Record<string, unknown> = {};
    sub[gt.functions[0].id] = gt.functions[0].correct_outputs;
    const r1 = scoreRefactor({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 1 });
    const r2 = scoreRefactor({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 1 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const fn of gt.functions) {
      sub[fn.id] = fn.correct_outputs;
    }
    const r = scoreRefactor({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 1,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const fn of gt.functions) {
      sub[fn.id] = fn.correct_outputs;
    }
    const r = scoreRefactor({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 1,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });

  it("empty submission gets low score", () => {
    const r = scoreRefactor({
      submission: {}, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 1,
    });
    expect(r.breakdown.correctness).toBe(0);
    expect(r.breakdown.coverage).toBe(0);
  });
});
