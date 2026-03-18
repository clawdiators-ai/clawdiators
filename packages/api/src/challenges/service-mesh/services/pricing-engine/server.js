import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "4013", 10);
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

function randFloat(min, max, r) {
  return min + r() * (max - min);
}

function randInt(min, max, r) {
  return min + Math.floor(r() * (max - min + 1));
}

const rand = rng(SEED);

// ── Pricing configuration (seeded) ──────────────────────────────────
const currencyRates = {
  USD: 1.0,
  EUR: Math.round(randFloat(0.85, 0.95, rand) * 100) / 100,
  GBP: Math.round(randFloat(0.75, 0.85, rand) * 100) / 100,
};

// Products that have eventual consistency delays (simulating stale prices)
const consistencyDelays = {};
for (let i = 1; i <= 16; i++) {
  const id = `prod-${String(i).padStart(3, "0")}`;
  consistencyDelays[id] = randInt(0, 2000, rand);
}

const QUOTE_EXPIRY_SECS = 120;

// ── Quote store ──────────────────────────────────────────────────────
const quotes = new Map();
let requestCount = 0;
let quoteCount = 0;
let errorCount = 0;

// Track quote versions for eventual consistency simulation
const quoteVersions = new Map(); // product_id -> version counter

// ── Auth check ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    errorCount++;
    return res.status(401).json({ error: "missing_authorization", message: "Bearer token required" });
  }
  next();
}

// ── Routes ───────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "pricing-engine", uptime: process.uptime() });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({
    service: "pricing-engine",
    requests_total: requestCount,
    quotes_issued: quoteCount,
    active_quotes: quotes.size,
    errors_total: errorCount,
    currency_rates: currencyRates,
  });
});

app.get("/docs", (_req, res) => {
  res.json({
    service: "pricing-engine",
    description: "Price quote engine with eventual consistency simulation. Quotes have a 120-second expiry.",
    endpoints: [
      {
        method: "POST",
        path: "/quote",
        description: "Generate a price quote for a product and quantity",
        auth: "Bearer <token> with scope pricing:quote",
        body: {
          product_id: { type: "string", required: true },
          quantity: { type: "number", required: true },
          currency: { type: "string", required: false, default: "USD", description: "Target currency (USD, EUR, GBP)" },
          reservation_id: { type: "string", required: false, description: "Link to a catalog reservation" },
        },
        response: {
          quote_id: "string",
          product_id: "string",
          quantity: "number",
          unit_price: "number",
          total_price: "number",
          currency: "string",
          expires_at: "ISO8601 — 120 seconds from creation",
          version: "number — quote version (increases on price updates)",
          consistency_status: "string — 'settled' or 'pending' (eventual consistency)",
        },
        notes: [
          "Quotes with consistency_status='pending' may have slightly stale prices.",
          "If the order service rejects a pending quote, re-fetch to get the settled price.",
        ],
      },
      {
        method: "GET",
        path: "/quotes/:id",
        description: "Retrieve an existing quote by ID",
        auth: "Bearer <token> with scope pricing:read",
        response: "Quote object",
      },
    ],
    currency_rates: currencyRates,
    notes: [
      "Quotes expire after 120 seconds — check expires_at before using.",
      "Some products have eventual consistency delays — the first quote may show a 'pending' status.",
      "Re-requesting a quote for the same product will return a fresh price if the previous was pending.",
    ],
  });
});

// POST /quote — generate price quote
app.post("/quote", requireAuth, (req, res) => {
  requestCount++;
  const { product_id, quantity, currency = "USD", reservation_id } = req.body || {};

  if (!product_id || !quantity) {
    errorCount++;
    return res.status(400).json({ error: "missing_fields", message: "product_id and quantity are required" });
  }

  if (!["USD", "EUR", "GBP"].includes(currency)) {
    errorCount++;
    return res.status(400).json({ error: "invalid_currency", message: "Supported currencies: USD, EUR, GBP" });
  }

  // Simulate a base price derived from the product ID (seeded)
  const productSeed = rng(SEED + product_id.charCodeAt(product_id.length - 1) * 997);
  const basePrice = Math.round(randFloat(9.99, 299.99, productSeed) * 100) / 100;
  const rate = currencyRates[currency] || 1.0;
  const unitPrice = Math.round(basePrice * rate * 100) / 100;
  const totalPrice = Math.round(unitPrice * quantity * 100) / 100;

  // Track version for eventual consistency
  const currentVersion = (quoteVersions.get(product_id) || 0) + 1;
  quoteVersions.set(product_id, currentVersion);

  // Determine consistency status based on delay config
  const delayMs = consistencyDelays[product_id] || 0;
  const isPending = delayMs > 1000 && currentVersion <= 1;
  const consistencyStatus = isPending ? "pending" : "settled";

  // If pending, apply a small price variance to simulate stale data
  const effectiveUnitPrice = isPending
    ? Math.round(unitPrice * (1 + (rand() * 0.1 - 0.05)) * 100) / 100
    : unitPrice;
  const effectiveTotal = Math.round(effectiveUnitPrice * quantity * 100) / 100;

  const quoteId = `qt-${crypto.randomBytes(8).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_EXPIRY_SECS * 1000);

  const quote = {
    quote_id: quoteId,
    product_id,
    quantity,
    unit_price: effectiveUnitPrice,
    total_price: effectiveTotal,
    currency,
    reservation_id: reservation_id || null,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    version: currentVersion,
    consistency_status: consistencyStatus,
  };

  quotes.set(quoteId, quote);
  quoteCount++;

  res.status(201).json(quote);
});

// GET /quotes/:id — retrieve quote
app.get("/quotes/:id", requireAuth, (req, res) => {
  requestCount++;
  const quote = quotes.get(req.params.id);
  if (!quote) {
    errorCount++;
    return res.status(404).json({ error: "quote_not_found", message: `No quote with ID ${req.params.id}` });
  }

  const now = new Date();
  if (now > new Date(quote.expires_at)) {
    return res.json({ ...quote, expired: true, consistency_status: "expired" });
  }

  res.json(quote);
});

app.listen(PORT, () => {
  console.log(`pricing-engine listening on :${PORT} (seed=${SEED})`);
});
