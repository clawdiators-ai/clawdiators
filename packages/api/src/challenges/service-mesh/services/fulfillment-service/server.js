import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "4015", 10);
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

function randInt(min, max, r) {
  return min + Math.floor(r() * (max - min + 1));
}

function pickN(arr, n, r) {
  const pool = [...arr];
  const out = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const idx = Math.floor(r() * (pool.length - i));
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

const rand = rng(SEED);

// ── Warehouse definitions (seeded) ──────────────────────────────────
const WAREHOUSES = [
  { id: "us-east-1", region: "US East", capacity: randInt(500, 2000, rand), lat: 39.0, lon: -77.5 },
  { id: "us-west-2", region: "US West", capacity: randInt(500, 2000, rand), lat: 45.5, lon: -122.7 },
  { id: "eu-central-1", region: "EU Central", capacity: randInt(500, 2000, rand), lat: 50.1, lon: 8.7 },
];

// Geographic constraints: some products can only ship from certain warehouses
// We rebuild the same product list deterministically using the same PRNG pattern as catalog
const productFulfillmentMap = {};
const PRODUCT_NAMES_COUNT = 16;
const catalogRand = rng(SEED); // same seed as catalog-service

// Consume same random values as catalog to stay in sync
const productCount = randInt(10, 15, catalogRand);
for (let i = 0; i < productCount; i++) {
  // Consume the same random values as catalog-service's product generation
  catalogRand(); // name pick
  catalogRand(); // category pick
  catalogRand(); catalogRand(); // price
  catalogRand(); // currency
  catalogRand(); catalogRand(); // weight

  const warehouseCount = randInt(1, 3, catalogRand);
  const availableWarehouses = pickN(WAREHOUSES.map((w) => w.id), warehouseCount, catalogRand);
  const id = `prod-${String(i + 1).padStart(3, "0")}`;

  // Check inventory values (consume same randoms)
  const fulfillable = [];
  for (const wh of availableWarehouses) {
    const stock = randInt(0, 50, catalogRand);
    if (stock > 0) fulfillable.push(wh);
  }
  if (fulfillable.length === 0) {
    randInt(5, 30, catalogRand); // consume the fallback random
    fulfillable.push(availableWarehouses[0]);
  }

  productFulfillmentMap[id] = fulfillable;
}

// ── Allocation store ─────────────────────────────────────────────────
const allocations = new Map();
let requestCount = 0;
let allocationCount = 0;
let errorCount = 0;
let rejectionCount = 0;

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
  res.json({ status: "ok", service: "fulfillment-service", uptime: process.uptime() });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({
    service: "fulfillment-service",
    requests_total: requestCount,
    allocations_created: allocationCount,
    allocations_rejected: rejectionCount,
    active_allocations: allocations.size,
    errors_total: errorCount,
    warehouses: WAREHOUSES.map((w) => ({ id: w.id, region: w.region, capacity: w.capacity })),
  });
});

app.get("/docs", (_req, res) => {
  res.json({
    service: "fulfillment-service",
    description: "Warehouse allocation service with geographic constraints. Allocates inventory from specific warehouses for order fulfillment.",
    endpoints: [
      {
        method: "POST",
        path: "/allocate",
        description: "Allocate warehouse inventory for an order",
        auth: "Bearer <token> with scope fulfillment:allocate",
        body: {
          order_id: { type: "string", required: true, description: "Order ID from order-service" },
          product_id: { type: "string", required: true },
          quantity: { type: "number", required: true },
          warehouse: { type: "string", required: true, description: "Target warehouse ID" },
        },
        response: {
          allocation_id: "string",
          order_id: "string",
          product_id: "string",
          quantity: "number",
          warehouse: "string",
          status: "string — 'allocated' or 'rejected'",
          estimated_ship_date: "ISO8601",
        },
        errors: [
          { status: 400, code: "warehouse_constraint", reason: "Product cannot be fulfilled from this warehouse" },
          { status: 400, code: "capacity_exceeded", reason: "Warehouse does not have enough capacity" },
          { status: 400, code: "missing_fields", reason: "Required fields missing" },
        ],
      },
      {
        method: "GET",
        path: "/allocations/:id",
        description: "Get allocation details by ID",
        auth: "Bearer <token> with scope fulfillment:read",
      },
      {
        method: "POST",
        path: "/allocations/:id/cancel",
        description: "Cancel a fulfillment allocation",
        auth: "Bearer <token> with scope fulfillment:cancel",
        response: { allocation_id: "string", status: "cancelled", cancelled_at: "ISO8601" },
      },
    ],
    warehouses: WAREHOUSES.map((w) => ({
      id: w.id,
      region: w.region,
      capacity: w.capacity,
    })),
    notes: [
      "Geographic constraints: not all products can be fulfilled from all warehouses.",
      "Check product fulfillable_from in the catalog-service before requesting allocation.",
      "If allocation is rejected due to warehouse_constraint, cancel the order and retry with a valid warehouse.",
    ],
  });
});

// POST /allocate — allocate warehouse inventory
app.post("/allocate", requireAuth, (req, res) => {
  requestCount++;
  const { order_id, product_id, quantity, warehouse } = req.body || {};

  if (!order_id || !product_id || !quantity || !warehouse) {
    errorCount++;
    return res.status(400).json({
      error: "missing_fields",
      message: "Required: order_id, product_id, quantity, warehouse",
    });
  }

  // Check warehouse exists
  const wh = WAREHOUSES.find((w) => w.id === warehouse);
  if (!wh) {
    errorCount++;
    return res.status(400).json({
      error: "invalid_warehouse",
      message: `Unknown warehouse ${warehouse}. Available: ${WAREHOUSES.map((w) => w.id).join(", ")}`,
    });
  }

  // Check geographic constraint
  const fulfillableFrom = productFulfillmentMap[product_id];
  if (fulfillableFrom && !fulfillableFrom.includes(warehouse)) {
    rejectionCount++;
    return res.status(400).json({
      error: "warehouse_constraint",
      message: `Product ${product_id} cannot be fulfilled from warehouse ${warehouse}. This product is only available from: ${fulfillableFrom.join(", ")}. Cancel the order and retry with a valid warehouse.`,
      product_id,
      warehouse,
      fulfillable_from: fulfillableFrom,
    });
  }

  const allocationId = `alloc-${crypto.randomBytes(8).toString("hex")}`;
  const now = new Date();
  const shipDate = new Date(now.getTime() + randInt(1, 5, rand) * 86400000);

  const allocation = {
    allocation_id: allocationId,
    order_id,
    product_id,
    quantity,
    warehouse,
    status: "allocated",
    created_at: now.toISOString(),
    estimated_ship_date: shipDate.toISOString(),
  };

  allocations.set(allocationId, allocation);
  allocationCount++;

  res.status(201).json(allocation);
});

// GET /allocations/:id — get allocation
app.get("/allocations/:id", requireAuth, (req, res) => {
  requestCount++;
  const allocation = allocations.get(req.params.id);
  if (!allocation) {
    errorCount++;
    return res.status(404).json({ error: "allocation_not_found", message: `No allocation with ID ${req.params.id}` });
  }
  res.json(allocation);
});

// POST /allocations/:id/cancel — cancel allocation
app.post("/allocations/:id/cancel", requireAuth, (req, res) => {
  requestCount++;
  const allocation = allocations.get(req.params.id);
  if (!allocation) {
    errorCount++;
    return res.status(404).json({ error: "allocation_not_found", message: `No allocation with ID ${req.params.id}` });
  }

  if (allocation.status === "cancelled") {
    return res.json({
      allocation_id: allocation.allocation_id,
      status: "cancelled",
      cancelled_at: allocation.cancelled_at,
      note: "Already cancelled (idempotent)",
    });
  }

  allocation.status = "cancelled";
  allocation.cancelled_at = new Date().toISOString();

  res.json({
    allocation_id: allocation.allocation_id,
    status: "cancelled",
    cancelled_at: allocation.cancelled_at,
  });
});

app.listen(PORT, () => {
  console.log(`fulfillment-service listening on :${PORT} (seed=${SEED})`);
});
