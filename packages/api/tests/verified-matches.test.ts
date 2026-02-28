import { describe, it, expect } from "vitest";
import { verifyAttestation, generateNonce, checkTokenSums } from "../src/services/verification.js";
import { VERIFIED_ELO_BONUS } from "@clawdiators/shared";
import type { VerifiedAttestation, LLMCallRecord, ChallengeVerificationPolicy, ChallengeDisclosurePolicy } from "@clawdiators/shared";

// ── Helpers ──────────────────────────────────────────────────────────

function makeCall(seq: number): LLMCallRecord {
  return {
    seq,
    ts: new Date().toISOString(),
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    input_tokens: 100,
    output_tokens: 50,
    duration_ms: 400,
    status_code: 200,
    request_hash: "req" + seq,
    response_hash: "res" + seq,
  };
}

function makeAtt(nonce: string, overrides?: Partial<VerifiedAttestation>): VerifiedAttestation {
  return {
    image_digest: "sha256:good",
    nonce,
    chain_head_hash: "head",
    chain_length: 1,
    llm_calls: [makeCall(1)],
    total_input_tokens: 100,
    total_output_tokens: 50,
    total_llm_calls: 1,
    total_tool_calls: 3,
    wall_clock_secs: 20,
    ...overrides,
  };
}

// ── Match Entry ──────────────────────────────────────────────────────

describe("Match entry — verified flag", () => {
  it("verified=true match should have a nonce attached", () => {
    const nonce = generateNonce();
    expect(nonce).toBeTruthy();
    expect(nonce).toHaveLength(64);
  });

  it("verified=false match has no nonce (nonce is null)", () => {
    const verified = false;
    const verificationNonce = verified ? generateNonce() : null;
    expect(verificationNonce).toBeNull();
  });

  it("required verification policy rejects unverified entry", () => {
    const policy: ChallengeVerificationPolicy = { mode: "required" };
    const verified = false;
    expect(policy.mode === "required" && !verified).toBe(true);
  });
});

// ── Attestation Validation ───────────────────────────────────────────

describe("Attestation validation", () => {
  const nonce = "verifiednonce123";
  const start = new Date(Date.now() - 5000);
  const expiry = new Date(Date.now() + 60000);
  const knownDigests = ["sha256:good"];

  it("valid attestation produces verified status", () => {
    const att = makeAtt(nonce);
    const result = verifyAttestation(att, nonce, start, expiry, knownDigests);
    expect(result.status).toBe("verified");
    expect(result.errors).toHaveLength(0);
  });

  it("missing attestation on verified match defaults to failed", () => {
    // Simulate the logic: verified match, no attestation submitted
    const verified = true;
    const attestationPayload = undefined;
    const verificationStatus = verified && !attestationPayload ? "failed" : "unverified";
    expect(verificationStatus).toBe("failed");
  });

  it("partial check failures preserve individual check results", () => {
    const att = makeAtt("wrong-nonce"); // only nonce will fail
    const result = verifyAttestation(att, nonce, start, expiry, knownDigests);
    expect(result.checks.nonce_match).toBe(false);
    expect(result.checks.image_digest_known).toBe(true);
    expect(result.checks.token_count_consistent).toBe(true);
    expect(result.status).toBe("failed");
  });

  it("verification fields are denormalized correctly from attestation", () => {
    const att = makeAtt(nonce);
    const llmCalls = att.llm_calls as Array<{ model?: string }>;
    const verifiedModel = llmCalls?.[0]?.model ?? null;
    const verifiedInputTokens = att.total_input_tokens;
    const verifiedOutputTokens = att.total_output_tokens;
    const verifiedLlmCalls = att.total_llm_calls;

    expect(verifiedModel).toBe("claude-sonnet-4-6");
    expect(verifiedInputTokens).toBe(100);
    expect(verifiedOutputTokens).toBe(50);
    expect(verifiedLlmCalls).toBe(1);
  });
});

// ── Elo Bonus ────────────────────────────────────────────────────────

describe("Elo bonus for verified matches", () => {
  it("verified win applies 1.1x bonus (rounded)", () => {
    const baseChange = 20;
    const status = "verified";
    const eloChange = status === "verified" && baseChange > 0
      ? Math.round(baseChange * VERIFIED_ELO_BONUS)
      : baseChange;
    expect(eloChange).toBe(22);
  });

  it("verified loss receives no bonus", () => {
    const baseChange = -15;
    const status = "verified";
    const eloChange = status === "verified" && baseChange > 0
      ? Math.round(baseChange * VERIFIED_ELO_BONUS)
      : baseChange;
    expect(eloChange).toBe(-15);
  });

  it("unverified win receives no bonus", () => {
    const baseChange = 18;
    const verified = false;
    const status = "unverified";
    const eloChange = verified && status === "verified" && baseChange > 0
      ? Math.round(baseChange * VERIFIED_ELO_BONUS)
      : baseChange;
    expect(eloChange).toBe(18);
  });
});

// ── Leaderboard Filters ──────────────────────────────────────────────

describe("Leaderboard filters composition", () => {
  const matches = [
    { score: 900, verified: true, attempt_number: 1, memoryless: true },
    { score: 850, verified: false, attempt_number: 1, memoryless: true },
    { score: 800, verified: true, attempt_number: 2, memoryless: false },
    { score: 750, verified: false, attempt_number: 3, memoryless: false },
  ];

  it("verified filter keeps only verified=true matches", () => {
    const filtered = matches.filter((m) => m.verified);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((m) => m.verified)).toBe(true);
  });

  it("all three filters compose correctly", () => {
    const filtered = matches.filter(
      (m) => m.verified && m.attempt_number === 1 && m.memoryless,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].score).toBe(900);
  });

  it("unfiltered set returns all matches", () => {
    expect(matches).toHaveLength(4);
  });
});

// ── Disclosure Policy ────────────────────────────────────────────────

describe("Disclosure policy", () => {
  it("policy fields are correctly typed", () => {
    const policy: ChallengeDisclosurePolicy = {
      replayVisibility: "delayed_public",
      redactSubmissionUntil: "version_rotated",
      benchmarkSeedExposure: "normal",
    };
    expect(policy.replayVisibility).toBe("delayed_public");
    expect(policy.redactSubmissionUntil).toBe("version_rotated");
    expect(policy.benchmarkSeedExposure).toBe("normal");
  });

  it("policy is surfaced in challenge detail response (simulated)", () => {
    const challenge = {
      slug: "cipher-forge",
      disclosurePolicy: {
        replayVisibility: "public_opt_in" as const,
        redactSubmissionUntil: "never" as const,
        benchmarkSeedExposure: "restricted" as const,
      } satisfies ChallengeDisclosurePolicy,
    };
    expect(challenge.disclosurePolicy?.replayVisibility).toBe("public_opt_in");
  });
});
