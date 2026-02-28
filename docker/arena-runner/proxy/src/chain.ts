import { createHash } from "node:crypto";
import type { LLMCallRecord } from "./types.js";

/**
 * Compute a chain hash for a single LLM call record.
 * MUST match packages/api/src/services/verification.ts:computeChainHash exactly.
 */
export function computeChainHash(prevHash: string, seq: number, record: LLMCallRecord): string {
  const data = `${prevHash}|${seq}|${record.ts}|${record.provider}|${record.model}|${record.input_tokens}|${record.output_tokens}|${record.request_hash}|${record.response_hash}`;
  return createHash("sha256").update(data).digest("hex");
}

export function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
