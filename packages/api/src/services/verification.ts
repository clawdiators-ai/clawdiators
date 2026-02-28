import { createHash, randomBytes } from "node:crypto";
import type { VerifiedAttestation, VerificationResult, LLMCallRecord } from "@clawdiators/shared";

export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

export function computeChainHash(prevHash: string, seq: number, record: LLMCallRecord): string {
  const data = `${prevHash}|${seq}|${record.ts}|${record.provider}|${record.model}|${record.input_tokens}|${record.output_tokens}|${record.request_hash}|${record.response_hash}`;
  return createHash("sha256").update(data).digest("hex");
}

export function validateHashChain(nonce: string, calls: LLMCallRecord[]): { valid: boolean; error?: string } {
  if (calls.length === 0) return { valid: true };
  let prevHash = nonce;
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].seq !== i + 1) return { valid: false, error: `seq mismatch at index ${i}` };
    prevHash = computeChainHash(prevHash, calls[i].seq, calls[i]);
  }
  return { valid: true };
}

export function checkTimingBounds(calls: LLMCallRecord[], matchStart: Date, matchExpiry: Date): boolean {
  for (const call of calls) {
    const ts = new Date(call.ts);
    if (ts < matchStart || ts > matchExpiry) return false;
  }
  return true;
}

export function checkTokenSums(attestation: VerifiedAttestation): boolean {
  const inputSum = attestation.llm_calls.reduce((s, c) => s + c.input_tokens, 0);
  const outputSum = attestation.llm_calls.reduce((s, c) => s + c.output_tokens, 0);
  return inputSum === attestation.total_input_tokens && outputSum === attestation.total_output_tokens;
}

export function verifyAttestation(
  attestation: VerifiedAttestation,
  nonce: string,
  matchStart: Date,
  matchExpiry: Date,
  knownDigests: string[],
): VerificationResult {
  const errors: string[] = [];

  const nonceMatch = attestation.nonce === nonce;
  if (!nonceMatch) errors.push("Nonce mismatch");

  const chain = validateHashChain(nonce, attestation.llm_calls);
  if (!chain.valid) errors.push(`Chain integrity: ${chain.error}`);

  const digestKnown = knownDigests.includes(attestation.image_digest);
  if (!digestKnown) errors.push(`Unknown image digest: ${attestation.image_digest}`);

  const timingOk = checkTimingBounds(attestation.llm_calls, matchStart, matchExpiry);
  if (!timingOk) errors.push("LLM call timestamps outside match window");

  const tokensOk = checkTokenSums(attestation);
  if (!tokensOk) errors.push("Token sum mismatch");

  return {
    status: errors.length === 0 ? "verified" : "failed",
    checks: {
      nonce_match: nonceMatch,
      chain_integrity: chain.valid,
      image_digest_known: digestKnown,
      timing_consistent: timingOk,
      token_count_consistent: tokensOk,
    },
    errors,
    verified_at: new Date().toISOString(),
  };
}
