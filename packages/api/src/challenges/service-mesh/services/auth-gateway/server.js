import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "4011", 10);
const SEED = parseInt(process.env.SEED || "0", 10);
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "test-token";

// ── Seeded PRNG ──────────────────────────────────────────────────────
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(SEED);

// ── Valid scopes ─────────────────────────────────────────────────────
const VALID_SCOPES = [
  "catalog:read", "catalog:reserve",
  "order:create", "order:read", "order:cancel",
  "pricing:quote", "pricing:read",
  "fulfillment:allocate", "fulfillment:read", "fulfillment:cancel",
];

// ── Token store ──────────────────────────────────────────────────────
const tokens = new Map();
const TOKEN_EXPIRY_SECS = 300;

let requestCount = 0;
let tokenCount = 0;
let errorCount = 0;

// ── Auth middleware ──────────────────────────────────────────────────
function requireServiceToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    errorCount++;
    return res.status(401).json({ error: "missing_authorization", message: "Bearer token required" });
  }
  const token = auth.slice(7);
  if (token !== SERVICE_TOKEN) {
    errorCount++;
    return res.status(403).json({ error: "invalid_service_token", message: "Invalid service token" });
  }
  next();
}

// ── Routes ───────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "auth-gateway", uptime: process.uptime() });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({
    service: "auth-gateway",
    requests_total: requestCount,
    tokens_issued: tokenCount,
    errors_total: errorCount,
    active_tokens: tokens.size,
  });
});

app.get("/docs", (_req, res) => {
  res.json({
    service: "auth-gateway",
    description: "OAuth2-style token gateway for the service mesh. Issue scoped tokens for downstream service access.",
    endpoints: [
      {
        method: "POST",
        path: "/token",
        description: "Issue a new scoped access token",
        auth: "Bearer <service_token>",
        body: {
          scopes: { type: "string[]", required: true, description: "Requested scopes. Only valid scopes will be granted." },
        },
        response: {
          token: "string — JWT-like access token",
          scopes: "string[] — granted scopes",
          expires_at: "ISO8601 — expiry timestamp",
          expires_in: "number — seconds until expiry",
        },
        errors: [
          { status: 400, code: "invalid_scopes", reason: "No valid scopes requested" },
          { status: 400, code: "excessive_scopes", reason: "More than 5 scopes in a single request" },
        ],
      },
      {
        method: "POST",
        path: "/token/introspect",
        description: "Introspect a token to check validity, scopes, and expiry",
        auth: "Bearer <service_token>",
        body: {
          token: { type: "string", required: true, description: "The token to introspect" },
        },
        response: {
          active: "boolean",
          scopes: "string[]",
          expires_at: "ISO8601",
          issued_at: "ISO8601",
        },
      },
    ],
    valid_scopes: VALID_SCOPES,
    notes: [
      "Tokens expire after 300 seconds.",
      "Request only the scopes you need — requesting more than 5 scopes per token will be rejected.",
      "Each downstream service validates token scopes independently.",
    ],
  });
});

// POST /token — issue a scoped token
app.post("/token", requireServiceToken, (req, res) => {
  requestCount++;
  const { scopes } = req.body || {};

  if (!Array.isArray(scopes) || scopes.length === 0) {
    errorCount++;
    return res.status(400).json({
      error: "invalid_scopes",
      message: "Provide an array of scopes. Valid scopes: " + VALID_SCOPES.join(", "),
    });
  }

  // Reject excessive scope requests
  if (scopes.length > 5) {
    errorCount++;
    return res.status(400).json({
      error: "excessive_scopes",
      message: "Maximum 5 scopes per token request. Break into multiple tokens for different operation phases.",
    });
  }

  // Filter to valid scopes only
  const grantedScopes = scopes.filter((s) => VALID_SCOPES.includes(s));
  if (grantedScopes.length === 0) {
    errorCount++;
    return res.status(400).json({
      error: "invalid_scopes",
      message: "None of the requested scopes are valid. Valid scopes: " + VALID_SCOPES.join(", "),
    });
  }

  const tokenId = crypto.randomBytes(16).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_SECS * 1000);

  const tokenData = {
    id: tokenId,
    scopes: grantedScopes,
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  tokens.set(tokenId, tokenData);
  tokenCount++;

  res.status(201).json({
    token: tokenId,
    scopes: grantedScopes,
    expires_at: expiresAt.toISOString(),
    expires_in: TOKEN_EXPIRY_SECS,
  });
});

// POST /token/introspect — check token validity
app.post("/token/introspect", requireServiceToken, (req, res) => {
  requestCount++;
  const { token } = req.body || {};

  if (!token) {
    errorCount++;
    return res.status(400).json({ error: "missing_token", message: "Provide a token to introspect" });
  }

  const tokenData = tokens.get(token);
  if (!tokenData) {
    return res.json({ active: false, reason: "token_not_found" });
  }

  const now = new Date();
  const expired = now > new Date(tokenData.expires_at);

  if (expired) {
    tokens.delete(token);
    return res.json({ active: false, reason: "token_expired", expired_at: tokenData.expires_at });
  }

  res.json({
    active: true,
    scopes: tokenData.scopes,
    expires_at: tokenData.expires_at,
    issued_at: tokenData.issued_at,
  });
});

app.listen(PORT, () => {
  console.log(`auth-gateway listening on :${PORT} (seed=${SEED})`);
});
