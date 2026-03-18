import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "4012", 10);
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

function randFloat(min, max, r) {
  return min + r() * (max - min);
}

function pick(arr, r) {
  return arr[Math.floor(r() * arr.length)];
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

// ── Product catalog (seeded) ────────────────────────────────────────
const PRODUCT_NAMES = [
  "Wireless Headphones", "USB-C Hub", "Mechanical Keyboard", "4K Monitor",
  "Laptop Stand", "Webcam HD", "Portable SSD", "Smart Mouse",
  "Docking Station", "Noise Canceller", "LED Desk Lamp", "Cable Kit Pro",
  "Tablet Stylus", "Power Bank XL", "Bluetooth Speaker", "Ergonomic Chair",
];
const CATEGORIES = ["electronics", "peripherals", "accessories", "furniture"];
const WAREHOUSES = ["us-east-1", "us-west-2", "eu-central-1"];

const productCount = randInt(10, 15, rand);
const selectedNames = pickN(PRODUCT_NAMES, productCount, rand);

const products = selectedNames.map((name, i) => {
  const id = `prod-${String(i + 1).padStart(3, "0")}`;
  const category = pick(CATEGORIES, rand);
  const basePrice = Math.round(randFloat(9.99, 299.99, rand) * 100) / 100;
  const currency = pick(["USD", "EUR", "GBP"], rand);
  const weight = Math.round(randFloat(0.1, 15.0, rand) * 10) / 10;

  const availableWarehouses = pickN(WAREHOUSES, randInt(1, 3, rand), rand);
  const inventory = {};
  const fulfillable = [];
  for (const wh of availableWarehouses) {
    inventory[wh] = randInt(0, 50, rand);
    if (inventory[wh] > 0) fulfillable.push(wh);
  }
  if (fulfillable.length === 0) {
    inventory[availableWarehouses[0]] = randInt(5, 30, rand);
    fulfillable.push(availableWarehouses[0]);
  }

  return { id, name, category, base_price: basePrice, currency, inventory, fulfillable_from: fulfillable, weight_kg: weight };
});

// ── Reservations ─────────────────────────────────────────────────────
const reservations = new Map();
const RESERVATION_TTL_MS = 60_000; // 60 seconds

let requestCount = 0;
let reservationCount = 0;
let errorCount = 0;

// ── Auth check ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    errorCount++;
    return res.status(401).json({ error: "missing_authorization", message: "Bearer token required" });
  }
  next();
}

// ── Cleanup expired reservations ─────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, rsv] of reservations) {
    if (now > new Date(rsv.expires_at).getTime()) {
      // Restore inventory
      const product = products.find((p) => p.id === rsv.product_id);
      if (product && product.inventory[rsv.warehouse]) {
        product.inventory[rsv.warehouse] += rsv.quantity;
      }
      reservations.delete(id);
    }
  }
}, 5000);

// ── Routes ───────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "catalog-service", uptime: process.uptime() });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({
    service: "catalog-service",
    requests_total: requestCount,
    reservations_created: reservationCount,
    active_reservations: reservations.size,
    errors_total: errorCount,
    product_count: products.length,
  });
});

app.get("/docs", (_req, res) => {
  res.json({
    service: "catalog-service",
    description: "Product catalog with inventory management and time-limited reservations.",
    endpoints: [
      {
        method: "GET",
        path: "/products",
        description: "List all products with current inventory levels",
        auth: "Bearer <token> with scope catalog:read",
        query: { category: "optional — filter by category" },
        response: "Product[]",
      },
      {
        method: "GET",
        path: "/products/:id",
        description: "Get a single product by ID",
        auth: "Bearer <token> with scope catalog:read",
        response: "Product",
      },
      {
        method: "POST",
        path: "/products/:id/reserve",
        description: "Reserve inventory for a product. Reservation expires in 60 seconds.",
        auth: "Bearer <token> with scope catalog:reserve",
        body: {
          quantity: { type: "number", required: true, description: "Units to reserve" },
          warehouse: { type: "string", required: true, description: "Warehouse ID (e.g., us-east-1)" },
        },
        response: {
          reservation_id: "string",
          product_id: "string",
          quantity: "number",
          warehouse: "string",
          expires_at: "ISO8601 — 60 seconds from creation",
        },
        errors: [
          { status: 400, code: "insufficient_stock", reason: "Not enough inventory at the specified warehouse" },
          { status: 400, code: "invalid_warehouse", reason: "Product not fulfillable from this warehouse" },
          { status: 404, code: "product_not_found" },
        ],
      },
      {
        method: "DELETE",
        path: "/reservations/:id",
        description: "Cancel a reservation and release inventory",
        auth: "Bearer <token> with scope catalog:reserve",
        response: { released: "boolean", product_id: "string", quantity: "number" },
      },
    ],
    notes: [
      "Reservations have a 60-second TTL. Complete your transaction before expiry.",
      "Expired reservations automatically restore inventory.",
      "Check fulfillable_from before reserving — not all warehouses stock all products.",
    ],
  });
});

// GET /products — list products
app.get("/products", requireAuth, (req, res) => {
  requestCount++;
  const { category } = req.query;
  let result = products;
  if (category) {
    result = products.filter((p) => p.category === category);
  }
  res.json({
    products: result.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      base_price: p.base_price,
      currency: p.currency,
      inventory: { ...p.inventory },
      fulfillable_from: [...p.fulfillable_from],
      weight_kg: p.weight_kg,
    })),
    total: result.length,
  });
});

// GET /products/:id — single product
app.get("/products/:id", requireAuth, (req, res) => {
  requestCount++;
  const product = products.find((p) => p.id === req.params.id);
  if (!product) {
    errorCount++;
    return res.status(404).json({ error: "product_not_found", message: `No product with ID ${req.params.id}` });
  }
  res.json({
    ...product,
    inventory: { ...product.inventory },
    fulfillable_from: [...product.fulfillable_from],
  });
});

// POST /products/:id/reserve — create reservation
app.post("/products/:id/reserve", requireAuth, (req, res) => {
  requestCount++;
  const product = products.find((p) => p.id === req.params.id);
  if (!product) {
    errorCount++;
    return res.status(404).json({ error: "product_not_found", message: `No product with ID ${req.params.id}` });
  }

  const { quantity, warehouse } = req.body || {};
  if (!quantity || !warehouse) {
    errorCount++;
    return res.status(400).json({ error: "missing_fields", message: "Both quantity and warehouse are required" });
  }

  if (!product.fulfillable_from.includes(warehouse)) {
    errorCount++;
    return res.status(400).json({
      error: "invalid_warehouse",
      message: `Product ${product.id} cannot be fulfilled from warehouse ${warehouse}. Available: ${product.fulfillable_from.join(", ")}`,
    });
  }

  const available = product.inventory[warehouse] || 0;
  if (available < quantity) {
    errorCount++;
    return res.status(400).json({
      error: "insufficient_stock",
      message: `Only ${available} units available at ${warehouse}, requested ${quantity}`,
    });
  }

  // Decrement inventory
  product.inventory[warehouse] -= quantity;

  const reservationId = `rsv-${crypto.randomBytes(8).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);

  const reservation = {
    reservation_id: reservationId,
    product_id: product.id,
    quantity,
    warehouse,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  reservations.set(reservationId, reservation);
  reservationCount++;

  res.status(201).json(reservation);
});

// DELETE /reservations/:id — cancel reservation
app.delete("/reservations/:id", requireAuth, (req, res) => {
  requestCount++;
  const reservation = reservations.get(req.params.id);
  if (!reservation) {
    errorCount++;
    return res.status(404).json({ error: "reservation_not_found", message: `No reservation with ID ${req.params.id}` });
  }

  // Restore inventory
  const product = products.find((p) => p.id === reservation.product_id);
  if (product && product.inventory[reservation.warehouse] !== undefined) {
    product.inventory[reservation.warehouse] += reservation.quantity;
  }

  reservations.delete(req.params.id);

  res.json({
    released: true,
    product_id: reservation.product_id,
    quantity: reservation.quantity,
    warehouse: reservation.warehouse,
  });
});

app.listen(PORT, () => {
  console.log(`catalog-service listening on :${PORT} (seed=${SEED}, products=${products.length})`);
});
