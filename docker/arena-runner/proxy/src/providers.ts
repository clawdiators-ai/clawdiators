export interface ParsedUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  extraction: "exact" | "fallback" | "unknown";
}

const PROVIDER_HOSTS: Record<string, string> = {
  "api.anthropic.com": "anthropic",
  "api.openai.com": "openai",
  "generativelanguage.googleapis.com": "google",
  "openrouter.ai": "openrouter",
  "api.together.xyz": "together",
};

export function detectProvider(hostname: string): string {
  return PROVIDER_HOSTS[hostname] ?? "unknown";
}

function parseAnthropic(body: string): ParsedUsage {
  const json = JSON.parse(body);
  const input_tokens = json?.usage?.input_tokens;
  const output_tokens = json?.usage?.output_tokens;
  const model = json?.model ?? "unknown";
  if (typeof input_tokens !== "number" || typeof output_tokens !== "number") {
    throw new Error("Anthropic: missing usage fields");
  }
  return { model, input_tokens, output_tokens, extraction: "exact" };
}

function parseOpenAI(body: string): ParsedUsage {
  const json = JSON.parse(body);
  const input_tokens = json?.usage?.prompt_tokens;
  const output_tokens = json?.usage?.completion_tokens;
  const model = json?.model ?? "unknown";
  if (typeof input_tokens !== "number" || typeof output_tokens !== "number") {
    throw new Error("OpenAI: missing usage fields");
  }
  return { model, input_tokens, output_tokens, extraction: "exact" };
}

function parseGoogle(body: string): ParsedUsage {
  const json = JSON.parse(body);
  const input_tokens = json?.usageMetadata?.promptTokenCount;
  const output_tokens = json?.usageMetadata?.candidatesTokenCount;
  const model = json?.modelVersion ?? json?.model ?? "unknown";
  if (typeof input_tokens !== "number" || typeof output_tokens !== "number") {
    throw new Error("Google: missing usageMetadata fields");
  }
  return { model, input_tokens, output_tokens, extraction: "exact" };
}

/**
 * Recursive depth-first search for usage-shaped keys in a parsed object.
 * Returns { input_tokens, output_tokens } if found at any depth.
 */
function findUsageDeep(obj: unknown, depth = 0): { input: number; output: number } | null {
  if (depth > 10 || obj === null || typeof obj !== "object") return null;

  const o = obj as Record<string, unknown>;

  // Try usage-shaped keys at this level
  if ("usage" in o && typeof o.usage === "object" && o.usage !== null) {
    const u = o.usage as Record<string, unknown>;
    // Anthropic-style
    if (typeof u.input_tokens === "number" && typeof u.output_tokens === "number") {
      return { input: u.input_tokens, output: u.output_tokens };
    }
    // OpenAI-style
    if (typeof u.prompt_tokens === "number" && typeof u.completion_tokens === "number") {
      return { input: u.prompt_tokens, output: u.completion_tokens };
    }
  }

  // token_count (Google-style flat)
  if (typeof o.token_count === "number") {
    return { input: o.token_count as number, output: 0 };
  }
  if (typeof o.tokenCount === "number") {
    return { input: o.tokenCount as number, output: 0 };
  }
  if (typeof o.prompt_tokens === "number" && typeof o.completion_tokens === "number") {
    return { input: o.prompt_tokens as number, output: o.completion_tokens as number };
  }

  // Recurse into object values
  for (const val of Object.values(o)) {
    const found = findUsageDeep(val, depth + 1);
    if (found) return found;
  }

  return null;
}

function parseGeneric(body: string): ParsedUsage {
  try {
    const json = JSON.parse(body);
    const found = findUsageDeep(json);
    if (found) {
      return {
        model: "unknown",
        input_tokens: found.input,
        output_tokens: found.output,
        extraction: "fallback",
      };
    }
  } catch {
    // not JSON or parse error
  }
  return { model: "unknown", input_tokens: 0, output_tokens: 0, extraction: "unknown" };
}

export function parseResponseBody(provider: string, body: string): ParsedUsage {
  try {
    switch (provider) {
      case "anthropic": return parseAnthropic(body);
      case "openai":    return parseOpenAI(body);
      case "google":    return parseGoogle(body);
      default:          return parseGeneric(body);
    }
  } catch {
    return parseGeneric(body);
  }
}
