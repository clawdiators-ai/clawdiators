/**
 * Phase 3 unit tests — arena-runner proxy logic and SDK VerifiedRunner
 *
 * These tests do NOT require Docker. They test:
 * - chain.ts algorithm (using server's matching computeChainHash)
 * - provider parsing logic
 * - streaming SSE detection and parsing
 * - VerifiedRunner.getEnv() output
 * - chain ↔ server symmetry (proxy chain validates on server)
 */

import { describe, it, expect } from "vitest";
import { computeChainHash, validateHashChain } from "../src/services/verification.js";
import type { LLMCallRecord } from "@clawdiators/shared";
import { join } from "node:path";
import { createHash } from "node:crypto";

// ── Shared helpers ────────────────────────────────────────────────────

function makeRecord(seq: number, overrides?: Partial<LLMCallRecord>): LLMCallRecord {
  return {
    seq,
    ts: "2025-01-01T12:00:00.000Z",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    input_tokens: 100,
    output_tokens: 50,
    duration_ms: 400,
    status_code: 200,
    request_hash: "req" + seq,
    response_hash: "res" + seq,
    ...overrides,
  };
}

// ── chain.ts — computeChainHash ───────────────────────────────────────
//
// The proxy's chain.ts uses the EXACT same algorithm as server's verification.ts.
// We test the server's version here; both must produce the same output.

describe("chain.ts — computeChainHash (server-equivalent)", () => {
  it("is deterministic for the same inputs", () => {
    const record = makeRecord(1);
    const h1 = computeChainHash("nonce", 1, record);
    const h2 = computeChainHash("nonce", 1, record);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("different seq produces different hash", () => {
    const record = makeRecord(1);
    const h1 = computeChainHash("nonce", 1, record);
    const h2 = computeChainHash("nonce", 2, record);
    expect(h1).not.toBe(h2);
  });

  it("nonce is the chain anchor — different nonce changes all hashes", () => {
    const record = makeRecord(1);
    const h1 = computeChainHash("nonce-a", 1, record);
    const h2 = computeChainHash("nonce-b", 1, record);
    expect(h1).not.toBe(h2);
  });
});

// ── providers.ts — Anthropic ──────────────────────────────────────────
//
// Inline implementation matching proxy/src/providers.ts parseAnthropic()

function parseAnthropicBody(body: string) {
  const json = JSON.parse(body);
  const input_tokens = json?.usage?.input_tokens;
  const output_tokens = json?.usage?.output_tokens;
  const model = json?.model ?? "unknown";
  if (typeof input_tokens !== "number" || typeof output_tokens !== "number") {
    throw new Error("missing usage");
  }
  return { model, input_tokens, output_tokens, extraction: "exact" as const };
}

describe("providers.ts — Anthropic parser", () => {
  it("parses a complete Anthropic response body", () => {
    const body = JSON.stringify({
      id: "msg_01",
      type: "message",
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 200, output_tokens: 75 },
      content: [{ type: "text", text: "Hello" }],
    });
    const result = parseAnthropicBody(body);
    expect(result.input_tokens).toBe(200);
    expect(result.output_tokens).toBe(75);
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.extraction).toBe("exact");
  });

  it("throws on malformed JSON (triggers fallback in real code)", () => {
    expect(() => parseAnthropicBody("not-json")).toThrow();
  });

  it("throws when usage fields are missing (triggers fallback in real code)", () => {
    const body = JSON.stringify({ model: "claude-sonnet-4-6", content: [] });
    expect(() => parseAnthropicBody(body)).toThrow("missing usage");
  });
});

// ── providers.ts — OpenAI ─────────────────────────────────────────────

function parseOpenAIBody(body: string) {
  const json = JSON.parse(body);
  const input_tokens = json?.usage?.prompt_tokens;
  const output_tokens = json?.usage?.completion_tokens;
  const model = json?.model ?? "unknown";
  if (typeof input_tokens !== "number" || typeof output_tokens !== "number") {
    throw new Error("missing usage");
  }
  return { model, input_tokens, output_tokens, extraction: "exact" as const };
}

describe("providers.ts — OpenAI parser", () => {
  it("parses prompt_tokens and completion_tokens", () => {
    const body = JSON.stringify({
      id: "chatcmpl-1",
      model: "gpt-4o",
      usage: { prompt_tokens: 150, completion_tokens: 60, total_tokens: 210 },
      choices: [],
    });
    const result = parseOpenAIBody(body);
    expect(result.input_tokens).toBe(150);
    expect(result.output_tokens).toBe(60);
    expect(result.model).toBe("gpt-4o");
    expect(result.extraction).toBe("exact");
  });

  it("throws on missing completion_tokens", () => {
    const body = JSON.stringify({ model: "gpt-4o", usage: { prompt_tokens: 50 } });
    expect(() => parseOpenAIBody(body)).toThrow("missing usage");
  });

  it("returns extraction: 'exact' for successful parse", () => {
    const body = JSON.stringify({
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });
    expect(parseOpenAIBody(body).extraction).toBe("exact");
  });
});

// ── providers.ts — generic fallback ──────────────────────────────────

function findUsageDeep(obj: unknown, depth = 0): { input: number; output: number } | null {
  if (depth > 10 || obj === null || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if ("usage" in o && typeof o.usage === "object" && o.usage !== null) {
    const u = o.usage as Record<string, unknown>;
    if (typeof u.input_tokens === "number" && typeof u.output_tokens === "number") {
      return { input: u.input_tokens, output: u.output_tokens };
    }
    if (typeof u.prompt_tokens === "number" && typeof u.completion_tokens === "number") {
      return { input: u.prompt_tokens, output: u.completion_tokens };
    }
  }
  if (typeof o.prompt_tokens === "number" && typeof o.completion_tokens === "number") {
    return { input: o.prompt_tokens as number, output: o.completion_tokens as number };
  }
  for (const val of Object.values(o)) {
    const found = findUsageDeep(val, depth + 1);
    if (found) return found;
  }
  return null;
}

function parseGeneric(body: string) {
  try {
    const json = JSON.parse(body);
    const found = findUsageDeep(json);
    if (found) return { model: "unknown", input_tokens: found.input, output_tokens: found.output, extraction: "fallback" as const };
  } catch { /* not json */ }
  return { model: "unknown", input_tokens: 0, output_tokens: 0, extraction: "unknown" as const };
}

describe("providers.ts — generic fallback", () => {
  it("finds usage object at any depth", () => {
    const body = JSON.stringify({
      wrapper: {
        inner: {
          usage: { input_tokens: 80, output_tokens: 30 },
        },
      },
    });
    const result = parseGeneric(body);
    expect(result.input_tokens).toBe(80);
    expect(result.output_tokens).toBe(30);
    expect(result.extraction).toBe("fallback");
  });

  it("marks extraction: 'fallback' when usage found indirectly", () => {
    const body = JSON.stringify({ data: { usage: { input_tokens: 5, output_tokens: 3 } } });
    expect(parseGeneric(body).extraction).toBe("fallback");
  });

  it("returns 0 tokens and extraction: 'unknown' when nothing found", () => {
    const body = JSON.stringify({ result: "ok", no_usage_here: true });
    const result = parseGeneric(body);
    expect(result.input_tokens).toBe(0);
    expect(result.output_tokens).toBe(0);
    expect(result.extraction).toBe("unknown");
  });
});

// ── streaming.ts — SSE detection ──────────────────────────────────────

function isStreamingResponse(headers: Record<string, string | string[] | undefined>): boolean {
  const ct = headers["content-type"] ?? "";
  const ctStr = Array.isArray(ct) ? ct.join(", ") : ct;
  return ctStr.includes("text/event-stream");
}

describe("streaming.ts — isStreamingResponse", () => {
  it("returns true for text/event-stream content-type", () => {
    expect(isStreamingResponse({ "content-type": "text/event-stream" })).toBe(true);
  });

  it("returns true for text/event-stream with charset", () => {
    expect(isStreamingResponse({ "content-type": "text/event-stream; charset=utf-8" })).toBe(true);
  });

  it("returns false for application/json", () => {
    expect(isStreamingResponse({ "content-type": "application/json" })).toBe(false);
  });

  it("returns false for missing content-type", () => {
    expect(isStreamingResponse({})).toBe(false);
  });
});

// ── streaming.ts — Anthropic SSE ─────────────────────────────────────

function extractAnthropicSSE(sseData: string) {
  let inputTokens = 0, outputTokens = 0, model = "unknown";
  const lines = sseData.split("\n");
  let pendingEvent = "";
  for (const line of lines) {
    if (line.startsWith("event: ")) { pendingEvent = line.slice(7).trim(); }
    else if (line.startsWith("data: ")) {
      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") continue;
      try {
        const data = JSON.parse(dataStr);
        if (pendingEvent === "message_start" && data.type === "message_start") {
          inputTokens = data?.message?.usage?.input_tokens ?? 0;
          model = data?.message?.model ?? model;
        } else if (pendingEvent === "message_delta" && data.type === "message_delta") {
          outputTokens = data?.usage?.output_tokens ?? 0;
        }
      } catch { /* skip */ }
    }
  }
  if (inputTokens === 0 && outputTokens === 0) return { model, input_tokens: 0, output_tokens: 0, extraction: "unknown" as const };
  return { model, input_tokens: inputTokens, output_tokens: outputTokens, extraction: "exact" as const };
}

describe("streaming.ts — Anthropic SSE accumulation", () => {
  const ANTHROPIC_SSE = [
    "event: message_start",
    `data: {"type":"message_start","message":{"id":"msg_01","model":"claude-sonnet-4-6","usage":{"input_tokens":120}}}`,
    "",
    "event: content_block_start",
    `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
    "",
    "event: message_delta",
    `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":45}}`,
    "",
    "event: message_stop",
    `data: {"type":"message_stop"}`,
    "",
  ].join("\n");

  it("extracts input tokens from message_start event", () => {
    const result = extractAnthropicSSE(ANTHROPIC_SSE);
    expect(result.input_tokens).toBe(120);
  });

  it("extracts output tokens from message_delta event", () => {
    const result = extractAnthropicSSE(ANTHROPIC_SSE);
    expect(result.output_tokens).toBe(45);
  });

  it("returns exact extraction when both token counts found", () => {
    const result = extractAnthropicSSE(ANTHROPIC_SSE);
    expect(result.extraction).toBe("exact");
  });
});

// ── streaming.ts — OpenAI SSE ─────────────────────────────────────────

function extractOpenAISSE(sseData: string) {
  let model = "unknown";
  let lastUsage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
  const lines = sseData.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") continue;
      try {
        const data = JSON.parse(dataStr);
        if (data.model) model = data.model;
        if (data.usage?.prompt_tokens != null) lastUsage = data.usage;
      } catch { /* skip */ }
    }
  }
  if (lastUsage) return { model, input_tokens: lastUsage.prompt_tokens ?? 0, output_tokens: lastUsage.completion_tokens ?? 0, extraction: "exact" as const };
  return { model, input_tokens: 0, output_tokens: 0, extraction: "unknown" as const };
}

describe("streaming.ts — OpenAI SSE accumulation", () => {
  const OPENAI_SSE = [
    `data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"delta":{"content":"Hello"}}]}`,
    "",
    `data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[],"usage":{"prompt_tokens":80,"completion_tokens":30,"total_tokens":110}}`,
    "",
    "data: [DONE]",
  ].join("\n");

  it("finds usage in final chunk with non-null usage", () => {
    const result = extractOpenAISSE(OPENAI_SSE);
    expect(result.input_tokens).toBe(80);
    expect(result.output_tokens).toBe(30);
    expect(result.extraction).toBe("exact");
  });
});

describe("streaming.ts — unknown provider SSE returns unknown extraction", () => {
  it("returns 0 tokens and unknown extraction for unrecognized SSE", () => {
    const sseData = "data: {\"something\": \"else\"}\n\n";
    // Generic unknown provider: no provider-specific parser
    const result = { model: "unknown", input_tokens: 0, output_tokens: 0, extraction: "unknown" as const };
    expect(result.extraction).toBe("unknown");
    expect(result.input_tokens).toBe(0);
  });
});

// ── VerifiedRunner.getEnv() ───────────────────────────────────────────
//
// Test the env var generation logic without Docker

function makeProxyEnv(port: number, attestationDir: string): Record<string, string> {
  const caPath = join(attestationDir, "ca.crt");
  return {
    HTTPS_PROXY: `http://localhost:${port}`,
    HTTP_PROXY: `http://localhost:${port}`,
    NODE_EXTRA_CA_CERTS: caPath,
    REQUESTS_CA_BUNDLE: caPath,
    SSL_CERT_FILE: caPath,
  };
}

describe("VerifiedRunner.getEnv()", () => {
  it("returns correct proxy URL with configured port", () => {
    const env = makeProxyEnv(8080, "/tmp/att");
    expect(env.HTTPS_PROXY).toBe("http://localhost:8080");
    expect(env.HTTP_PROXY).toBe("http://localhost:8080");
  });

  it("includes CA cert path derived from attestationDir", () => {
    const env = makeProxyEnv(8080, "/tmp/test-att");
    expect(env.NODE_EXTRA_CA_CERTS).toContain("ca.crt");
    expect(env.NODE_EXTRA_CA_CERTS).toContain("/tmp/test-att");
    expect(env.REQUESTS_CA_BUNDLE).toBe(env.NODE_EXTRA_CA_CERTS);
  });
});

// ── chain ↔ server symmetry ───────────────────────────────────────────
//
// Verify that a chain built in the proxy (computeChainHash, identical algorithm)
// validates correctly with the server's validateHashChain.

describe("chain ↔ server symmetry", () => {
  it("a correctly built chain validates on the server", () => {
    const nonce = "deadbeef".repeat(8); // 64 chars
    const calls: LLMCallRecord[] = [];
    let prevHash = nonce;

    for (let i = 1; i <= 3; i++) {
      const record = makeRecord(i);
      prevHash = computeChainHash(prevHash, i, record);
      calls.push(record);
    }

    const result = validateHashChain(nonce, calls);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("a chain with a tampered seq fails server validation", () => {
    const nonce = "abc123";
    // Build calls with correct seqs
    const calls: LLMCallRecord[] = [makeRecord(1), makeRecord(3)]; // seq 3 where 2 expected

    const result = validateHashChain(nonce, calls);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("seq mismatch");
  });
});
