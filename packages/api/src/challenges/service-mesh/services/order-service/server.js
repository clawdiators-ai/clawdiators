import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "4014", 10);
const SEED = parseInt(process.env.SEED || "0", 10);
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "test-token";

// ── Order store ──────────────────────────────────────────────────────
const orders = new Map();
let requestCount = 0;
let orderCount = 0;
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

// ── Routes ───────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "order-service", uptime: process.uptime() });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({
    service: "order-service",
    requests_total: requestCount,
    orders_created: orderCount,
    active_orders: orders.size,
    cancelled_orders: [...orders.values()].filter((o) => o.status === "cancelled").length,
    errors_total: errorCount,
  });
});

app.get("/docs", (_req, res) => {
  res.json({
    service: "order-service",
    description: "Order lifecycle management. Creates orders from valid reservations and quotes.",
    endpoints: [
      {
        method: "POST",
        path: "/orders",
        description: "Create a new order from a reservation and price quote",
        auth: "Bearer <token> with scope order:create",
        body: {
          product_id: { type: "string", required: true },
          quantity: { type: "number", required: true },
          reservation_id: { type: "string", required: true, description: "Valid catalog-service reservation ID" },
          quote_id: { type: "string", required: true, description: "Valid pricing-engine quote ID" },
          warehouse: { type: "string", required: true, description: "Target warehouse for fulfillment" },
        },
        response: {
          order_id: "string",
          status: "string — 'created', 'fulfilled', 'cancelled'",
          product_id: "string",
          quantity: "number",
          reservation_id: "string",
          quote_id: "string",
          warehouse: "string",
          total_price: "number",
          created_at: "ISO8601",
        },
        errors: [
          { status: 400, code: "missing_fields", reason: "Required fields missing" },
          { status: 400, code: "stale_quote", reason: "Quote has consistency_status=pending — re-fetch from pricing-engine" },
        ],
      },
      {
        method: "GET",
        path: "/orders/:id",
        description: "Get order details by ID",
        auth: "Bearer <token> with scope order:read",
      },
      {
        method: "POST",
        path: "/orders/:id/cancel",
        description: "Cancel an order. Does NOT automatically release reservation or fulfillment — you must cancel those separately.",
        auth: "Bearer <token> with scope order:cancel",
        response: { order_id: "string", status: "cancelled", cancelled_at: "ISO8601" },
        notes: [
          "Cancellation is idempotent — cancelling an already cancelled order returns success.",
          "IMPORTANT: Cancelling an order does NOT cascade to the reservation or fulfillment allocation. You must release those independently (saga compensation).",
        ],
      },
    ],
    notes: [
      "Orders require valid reservation_id and quote_id from upstream services.",
      "If the quote has consistency_status='pending', the order will be rejected with 'stale_quote'. Re-fetch the quote first.",
      "Order cancellation does not cascade — implement saga compensation manually.",
    ],
  });
});

// POST /orders — create order
app.post("/orders", requireAuth, (req, res) => {
  requestCount++;
  const { product_id, quantity, reservation_id, quote_id, warehouse } = req.body || {};

  if (!product_id || !quantity || !reservation_id || !quote_id || !warehouse) {
    errorCount++;
    return res.status(400).json({
      error: "missing_fields",
      message: "Required: product_id, quantity, reservation_id, quote_id, warehouse",
    });
  }

  // Simulate stale quote detection — quote IDs containing certain patterns trigger rejection
  // In the real flow, the pricing-engine marks consistency_status for pending quotes.
  // Here we simulate it: first quote attempt for a product with high consistency delay is stale.
  const quoteSuffix = quote_id.slice(-4);
  const isFirstAttemptForProduct = ![...orders.values()].some((o) => o.product_id === product_id);
  // Seeded: products with SEED-derived delay get stale on first attempt
  const productIndex = parseInt(product_id.replace("prod-", ""), 10);
  const isStaleEligible = ((SEED + productIndex * 7) % 5) === 0;

  if (isFirstAttemptForProduct && isStaleEligible) {
    errorCount++;
    return res.status(400).json({
      error: "stale_quote",
      message: `Quote ${quote_id} has consistency_status=pending. The price may not be settled yet. Re-fetch a fresh quote from the pricing-engine and retry.`,
      quote_id,
    });
  }

  const orderId = `ord-${crypto.randomBytes(8).toString("hex")}`;
  const now = new Date();

  // Calculate a price (in reality this would verify against the quote service)
  const basePrice = (productIndex * 13.37 + SEED * 0.42) % 250 + 10;
  const totalPrice = Math.round(basePrice * quantity * 100) / 100;

  const order = {
    order_id: orderId,
    status: "created",
    product_id,
    quantity,
    reservation_id,
    quote_id,
    warehouse,
    total_price: totalPrice,
    created_at: now.toISOString(),
  };

  orders.set(orderId, order);
  orderCount++;

  res.status(201).json(order);
});

// GET /orders/:id — get order
app.get("/orders/:id", requireAuth, (req, res) => {
  requestCount++;
  const order = orders.get(req.params.id);
  if (!order) {
    errorCount++;
    return res.status(404).json({ error: "order_not_found", message: `No order with ID ${req.params.id}` });
  }
  res.json(order);
});

// POST /orders/:id/cancel — cancel order
app.post("/orders/:id/cancel", requireAuth, (req, res) => {
  requestCount++;
  const order = orders.get(req.params.id);
  if (!order) {
    errorCount++;
    return res.status(404).json({ error: "order_not_found", message: `No order with ID ${req.params.id}` });
  }

  if (order.status === "cancelled") {
    return res.json({
      order_id: order.order_id,
      status: "cancelled",
      cancelled_at: order.cancelled_at,
      note: "Already cancelled (idempotent)",
    });
  }

  order.status = "cancelled";
  order.cancelled_at = new Date().toISOString();

  res.json({
    order_id: order.order_id,
    status: "cancelled",
    cancelled_at: order.cancelled_at,
    note: "Order cancelled. Remember to release the reservation and cancel any fulfillment allocation separately (saga compensation).",
  });
});

app.listen(PORT, () => {
  console.log(`order-service listening on :${PORT} (seed=${SEED})`);
});
