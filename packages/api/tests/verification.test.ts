import { describe, it, expect } from "vitest";
import {
  generateNonce,
  computeChainHash,
  validateHashChain,
  checkTimingBounds,
  checkTokenSums,
  verifyAttestation,
} from "../src/services/verification.js";
import type { LLMCallRecord, VerifiedAttestation } from "@clawdiators/shared";
import { VERIFIED_ELO_BONUS, BENCHMARK_ELO_BONUS } from "@clawdiators/shared";

// ── Helpers ──────────────────────────────────────────────────────────

function makeCall(seq: number, overrides?: Partial<LLMCallRecord>): LLMCallRecord {
  return {
    seq,
    ts: new Date().toISOString(),
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    input_tokens: 100,
    output_tokens: 50,
    duration_ms: 500,
    status_code: 200,
    request_hash: "abc123",
    response_hash: "def456",
    token_extraction: "exact",
    ...overrides,
  };
}

function makeAttestation(nonce: string, overrides?: Partial<VerifiedAttestation>): VerifiedAttestation {
  const calls = [makeCall(1), makeCall(2)];
  // Compute the correct chain head hash so attestation is valid by default
  const { computedHead } = validateHashChain(nonce, calls);
  return {
    image_digest: "sha256:known",
    nonce,
    chain_head_hash: computedHead,
    chain_length: 2,
    llm_calls: calls,
    total_input_tokens: 200,
    total_output_tokens: 100,
    total_llm_calls: 2,
    total_tool_calls: 5,
    wall_clock_secs: 30,
    ...overrides,
  };
}

// ── generateNonce ────────────────────────────────────────────────────

describe("generateNonce", () => {
  it("returns a 64-character hex string", () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(nonce)).toBe(true);
  });

  it("generates unique nonces across calls", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });
});

// ── computeChainHash ─────────────────────────────────────────────────

describe("computeChainHash", () => {
  it("is deterministic for same inputs", () => {
    const call = makeCall(1);
    const h1 = computeChainHash("prev", 1, call);
    const h2 = computeChainHash("prev", 1, call);
    expect(h1).toBe(h2);
  });

  it("differs when any input changes", () => {
    const call = makeCall(1);
    const h1 = computeChainHash("prev", 1, call);
    const h2 = computeChainHash("different", 1, call);
    expect(h1).not.toBe(h2);
  });
});

// ── validateHashChain ────────────────────────────────────────────────

describe("validateHashChain", () => {
  it("returns valid for an empty chain with computedHead equal to nonce", () => {
    const result = validateHashChain("nonce", []);
    expect(result.valid).toBe(true);
    expect(result.computedHead).toBe("nonce");
  });

  it("returns valid for a single-element chain with seq=1", () => {
    const result = validateHashChain("nonce", [makeCall(1)]);
    expect(result.valid).toBe(true);
  });

  it("returns valid for a properly sequenced chain", () => {
    const calls = [makeCall(1), makeCall(2), makeCall(3)];
    expect(validateHashChain("nonce", calls).valid).toBe(true);
  });

  it("detects broken sequence (seq mismatch)", () => {
    const calls = [makeCall(1), makeCall(3)]; // seq 3 where 2 expected
    const result = validateHashChain("nonce", calls);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("seq mismatch");
  });
});

// ── checkTimingBounds ────────────────────────────────────────────────

describe("checkTimingBounds", () => {
  const start = new Date("2024-01-01T10:00:00Z");
  const expiry = new Date("2024-01-01T10:30:00Z");
  const within = "2024-01-01T10:15:00Z";

  it("passes when all calls are within window", () => {
    const calls = [makeCall(1, { ts: within })];
    expect(checkTimingBounds(calls, start, expiry)).toBe(true);
  });

  it("fails when a call is before match start", () => {
    const calls = [makeCall(1, { ts: "2024-01-01T09:59:59Z" })];
    expect(checkTimingBounds(calls, start, expiry)).toBe(false);
  });

  it("fails when a call is after match expiry", () => {
    const calls = [makeCall(1, { ts: "2024-01-01T10:30:01Z" })];
    expect(checkTimingBounds(calls, start, expiry)).toBe(false);
  });
});

// ── checkTokenSums ───────────────────────────────────────────────────

describe("checkTokenSums", () => {
  it("passes when input and output sums match", () => {
    const att = makeAttestation("testnonce"); // 2 calls: 100 in each = 200 total, 50 out each = 100 total
    expect(checkTokenSums(att)).toBe(true);
  });

  it("fails when total_input_tokens does not match sum", () => {
    const att = makeAttestation("testnonce", { total_input_tokens: 999 });
    expect(checkTokenSums(att)).toBe(false);
  });

  it("fails when total_output_tokens does not match sum", () => {
    const att = makeAttestation("testnonce", { total_output_tokens: 999 });
    expect(checkTokenSums(att)).toBe(false);
  });
});

// ── verifyAttestation ────────────────────────────────────────────────

describe("verifyAttestation", () => {
  const nonce = "testnonce";
  const start = new Date(Date.now() - 10000);
  const expiry = new Date(Date.now() + 50000);
  const knownDigests = ["sha256:known"];

  it("returns verified when all checks pass", () => {
    const att = makeAttestation(nonce);
    const result = verifyAttestation(att, nonce, start, expiry, knownDigests);
    expect(result.status).toBe("verified");
    expect(result.errors).toHaveLength(0);
    expect(result.checks.nonce_match).toBe(true);
    expect(result.checks.chain_integrity).toBe(true);
    expect(result.checks.image_digest_known).toBe(true);
    expect(result.checks.token_count_consistent).toBe(true);
  });

  it("returns failed when nonce mismatches", () => {
    const att = makeAttestation("wrong-nonce");
    const result = verifyAttestation(att, nonce, start, expiry, knownDigests);
    expect(result.status).toBe("failed");
    expect(result.checks.nonce_match).toBe(false);
    expect(result.errors.some((e) => e.includes("Nonce"))).toBe(true);
  });

  it("returns failed when image digest is unknown", () => {
    const att = makeAttestation(nonce, { image_digest: "sha256:unknown" });
    const result = verifyAttestation(att, nonce, start, expiry, knownDigests);
    expect(result.status).toBe("failed");
    expect(result.checks.image_digest_known).toBe(false);
  });

  it("returns failed when timing is violated", () => {
    const pastCall = makeCall(1, { ts: "2000-01-01T00:00:00Z" });
    // Rebuild a valid attestation but with the past-dated call and recomputed chain head
    const { computedHead } = validateHashChain(nonce, [pastCall]);
    const att = makeAttestation(nonce, { llm_calls: [pastCall], chain_head_hash: computedHead, chain_length: 1, total_input_tokens: 100, total_output_tokens: 50 });
    const result = verifyAttestation(att, nonce, start, expiry, knownDigests);
    expect(result.status).toBe("failed");
    expect(result.checks.timing_consistent).toBe(false);
  });

  it("returns failed when token sums mismatch", () => {
    const att = makeAttestation(nonce, { total_input_tokens: 9999 });
    const result = verifyAttestation(att, nonce, start, expiry, knownDigests);
    expect(result.status).toBe("failed");
    expect(result.checks.token_count_consistent).toBe(false);
  });

  it("returns failed when chain_head_hash has been tampered with", () => {
    const att = makeAttestation(nonce, { chain_head_hash: "tampered-hash" });
    const result = verifyAttestation(att, nonce, start, expiry, knownDigests);
    expect(result.status).toBe("failed");
    expect(result.checks.chain_integrity).toBe(false);
    expect(result.errors.some((e) => e.includes("head hash"))).toBe(true);
  });
});

// ── Elo bonus ────────────────────────────────────────────────────────

describe("VERIFIED_ELO_BONUS application", () => {
  it("positive Elo change gets 1.1x multiplier", () => {
    const change = 20;
    const bonusChange = Math.round(change * VERIFIED_ELO_BONUS);
    expect(bonusChange).toBe(22);
  });

  it("negative Elo change is not modified (loss unchanged)", () => {
    const change = -15;
    // Bonus only applies to positive changes
    const bonusChange = change > 0 ? Math.round(change * VERIFIED_ELO_BONUS) : change;
    expect(bonusChange).toBe(-15);
  });

  it("zero Elo change stays zero", () => {
    const change = 0;
    const bonusChange = change > 0 ? Math.round(change * VERIFIED_ELO_BONUS) : change;
    expect(bonusChange).toBe(0);
  });

  it("benchmark grade (memoryless + first attempt) gets 1.2x multiplier", () => {
    const change = 20;
    const bonusChange = Math.round(change * BENCHMARK_ELO_BONUS);
    expect(bonusChange).toBe(24);
  });

  it("benchmark bonus only applies to positive changes", () => {
    const change = -15;
    const bonusChange = change > 0 ? Math.round(change * BENCHMARK_ELO_BONUS) : change;
    expect(bonusChange).toBe(-15);
  });
});

// ── ChallengeVerificationPolicy ──────────────────────────────────────

describe("ChallengeVerificationPolicy modes", () => {
  it("required mode rejects unverified entry (logic test)", () => {
    const policy = { mode: "required" as const };
    const verified = false;
    const shouldReject = policy.mode === "required" && !verified;
    expect(shouldReject).toBe(true);
  });

  it("optional mode accepts unverified entry", () => {
    const policy = { mode: "optional" as const };
    const verified = false;
    const shouldReject = policy.mode === "required" && !verified;
    expect(shouldReject).toBe(false);
  });

  it("recommended mode accepts both verified and unverified", () => {
    const policy = { mode: "recommended" as const };
    const shouldRejectUnverified = policy.mode === "required" && !false;
    const shouldRejectVerified = policy.mode === "required" && !true;
    expect(shouldRejectUnverified).toBe(false);
    expect(shouldRejectVerified).toBe(false);
  });
});
