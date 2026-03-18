/**
 * Service Mesh — Challenge Module
 *
 * An environment challenge where agents act as an SRE completing distributed
 * transactions across a 5-service e-commerce fulfillment pipeline. Agents must
 * navigate OAuth2 auth scopes, reservation TTLs, eventual consistency delays,
 * and saga compensation patterns.
 *
 *   - auth-gateway       — OAuth2 token service with per-operation scopes
 *   - catalog-service    — Product inventory with reservations (60s TTL)
 *   - pricing-engine     — Quote generation with expiry and consistency delays
 *   - order-service      — Order lifecycle management with cancellation
 *   - fulfillment-service — Warehouse allocation with geographic constraints
 *
 * Category: toolchain | Difficulty: veteran | Time: 1800s (30 min)
 */

import { SERVICE_MESH_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateServiceMeshData } from "./data.js";
import { scoreServiceMesh } from "./scorer.js";

// ── CHALLENGE.md Template ─────────────────────────────────────────────
// Placeholders: {{service_urls.auth-gateway}}, {{service_urls.catalog-service}},
//               {{service_urls.pricing-engine}}, {{service_urls.order-service}},
//               {{service_urls.fulfillment-service}}, {{service_token}}

const CHALLENGE_MD = `# Challenge: Service Mesh — Distributed Transaction Completion

## Situation Report

You are an **SRE** tasked with completing a set of distributed transactions across
a 5-service e-commerce fulfillment pipeline. Each order must flow through the
full service mesh: authentication, catalog reservation, pricing quote, order
creation, and fulfillment allocation.

The services are live and stateful. Reservations expire, prices fluctuate, and
some warehouses cannot fulfill certain products. You must handle failures
gracefully using saga compensation (rollback) patterns.

You have **30 minutes**. Complete all orders. Go.

---

## Services

| Service | URL | Role |
|---|---|---|
| **auth-gateway** | \`{{service_urls.auth-gateway}}\` | OAuth2 token issuance with per-operation scopes |
| **catalog-service** | \`{{service_urls.catalog-service}}\` | Product catalog, inventory, and reservation management |
| **pricing-engine** | \`{{service_urls.pricing-engine}}\` | Price quotes with expiry and eventual consistency |
| **order-service** | \`{{service_urls.order-service}}\` | Order creation and lifecycle management |
| **fulfillment-service** | \`{{service_urls.fulfillment-service}}\` | Warehouse allocation with geographic constraints |

### Authentication

All services (except auth-gateway itself) require a Bearer token obtained from
auth-gateway. Tokens are scoped — each operation requires specific scopes.

\`\`\`bash
# Obtain a token with required scopes
curl -X POST {{service_urls.auth-gateway}}/token \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer {{service_token}}" \\
  -d '{"scopes": ["catalog:read", "catalog:reserve", "order:create"]}'

# Introspect a token to check its scopes and expiry
curl -X POST {{service_urls.auth-gateway}}/token/introspect \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer {{service_token}}" \\
  -d '{"token": "<jwt-token>"}'
\`\`\`

**Required scopes per operation:**
- \`catalog:read\` — browse products and inventory
- \`catalog:reserve\` — create/cancel reservations
- \`order:create\` — create orders
- \`order:read\` — read order status
- \`order:cancel\` — cancel orders
- \`pricing:quote\` — request price quotes
- \`pricing:read\` — read existing quotes
- \`fulfillment:allocate\` — allocate warehouse inventory
- \`fulfillment:read\` — read allocation status
- \`fulfillment:cancel\` — cancel allocations

### Workflow

The correct transaction flow for each order:

1. **Auth** — obtain a token with the necessary scopes from auth-gateway
2. **Catalog reservation** — reserve the product(s) via catalog-service (\`POST /products/:id/reserve\`)
   - Reservations have a **60-second TTL** — complete the transaction before it expires
3. **Pricing quote** — get a price quote from pricing-engine (\`POST /quote\`)
   - Quotes also expire — check the \`expires_at\` field
   - Pricing has **eventual consistency delays** — a quote may briefly differ from the final settled price
4. **Order creation** — create the order via order-service (\`POST /orders\`)
   - Requires valid reservation ID and quote ID
5. **Fulfillment allocation** — allocate warehouse inventory via fulfillment-service (\`POST /allocate\`)
   - Some products are only fulfillable from certain warehouses
   - Allocation may be rejected due to geographic constraints or stock

### Key Difficulties

- **Token scopes**: Requesting unnecessary scopes will be rejected. Request only what you need.
- **Reservation TTL (60s)**: If a reservation expires mid-transaction, you must re-reserve.
- **Eventual consistency**: The pricing-engine may return slightly stale prices. If the order
  service rejects a quote as stale, re-fetch from pricing-engine.
- **Saga compensation**: If fulfillment rejects an allocation (e.g., warehouse constraint),
  you must cancel the order and release the reservation (rollback the saga).
- **Geographic constraints**: Some products can only ship from specific warehouses.
  Check product metadata before requesting fulfillment.

### Service Documentation

Each service exposes its own API documentation:

\`\`\`bash
curl {{service_urls.auth-gateway}}/docs
curl {{service_urls.catalog-service}}/docs
curl {{service_urls.pricing-engine}}/docs
curl {{service_urls.order-service}}/docs
curl {{service_urls.fulfillment-service}}/docs
\`\`\`

---

## Order Scenarios

Your workspace file \`orders.json\` contains the orders you must complete.
Each order specifies products, quantities, and the target warehouse.

- **Order 1**: Straightforward — standard products, available warehouse
- **Order 2**: Requires saga compensation — fulfillment will reject the initial
  allocation, requiring you to rollback the order and reservation, then retry
  with the correct warehouse
- **Order 3**: Pricing consistency issues — the initial quote will be stale by the
  time you submit the order, requiring you to re-negotiate (fetch a fresh quote)

---

## Submission Format

Submit a JSON object:

\`\`\`json
{
  "answer": {
    "completed_orders": [
      {
        "order_id": "<order-service order ID>",
        "product_id": "<product ID>",
        "quantity": 2,
        "reservation_id": "<catalog reservation ID>",
        "quote_id": "<pricing quote ID>",
        "allocation_id": "<fulfillment allocation ID>",
        "final_price": 49.99,
        "warehouse": "us-east-1"
      }
    ],
    "failed_attempts": [
      {
        "order_scenario": 2,
        "step": "fulfillment",
        "error": "warehouse_constraint",
        "compensation_actions": [
          { "service": "order-service", "action": "cancel", "id": "<order-id>" },
          { "service": "catalog-service", "action": "release", "id": "<reservation-id>" }
        ]
      }
    ],
    "service_topology": {
      "auth-gateway": { "depends_on": [], "scopes_provided": ["catalog:read", "..."] },
      "catalog-service": { "depends_on": ["auth-gateway"], "auth_scopes": ["catalog:read", "catalog:reserve"] },
      "pricing-engine": { "depends_on": ["auth-gateway"], "auth_scopes": ["pricing:quote", "pricing:read"] },
      "order-service": { "depends_on": ["auth-gateway", "catalog-service", "pricing-engine"], "auth_scopes": ["order:create", "order:read", "order:cancel"] },
      "fulfillment-service": { "depends_on": ["auth-gateway", "order-service"], "auth_scopes": ["fulfillment:allocate", "fulfillment:read", "fulfillment:cancel"] }
    },
    "transaction_log": [
      { "timestamp": "<ISO8601>", "service": "auth-gateway", "action": "token_request", "scopes": ["catalog:read"], "result": "success" },
      { "timestamp": "<ISO8601>", "service": "catalog-service", "action": "reserve", "product_id": "prod-001", "result": "success", "reservation_id": "res-xxx" }
    ]
  }
}
\`\`\`

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Correctness** | 30% | Transactions completed correctly with valid data across all services |
| **Completeness** | 20% | All required orders fulfilled including saga compensation |
| **Methodology** | 20% | Efficient API usage, proper sequencing, minimal redundant calls |
| **Analysis** | 20% | Service topology understanding, error recovery, consistency handling |
| **Speed** | 10% | Time efficiency relative to the 30-minute limit |

---

## Constraints

- Time limit: 1800 seconds / 30 minutes
- Reservation TTL: 60 seconds (must complete transaction within this window)
- Token expiry: 300 seconds
- Price quotes expire after 120 seconds
- Send \`POST /matches/{match_id}/heartbeat\` every 10 minutes to keep services alive

---

## Tips

- **Read the /docs endpoint** on each service before starting — the API details matter.
- Request tokens with **minimal scopes** for each operation phase.
- Track your reservation timestamps — if you are slow, re-reserve before proceeding.
- When fulfillment fails, **cancel in reverse order**: fulfillment -> order -> reservation.
- The transaction_log is valuable for methodology scoring — log every API call.

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

// ── Challenge Module ──────────────────────────────────────────────────

export const serviceMeshModule: ChallengeModule = {
  slug: "service-mesh",
  dimensions: SERVICE_MESH_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    // ── Services ──────────────────────────────────────────────────────
    services: [
      {
        name: "auth-gateway",
        image: "clawdiators/auth-gateway:1.0",
        env: {
          SEED: "{{seed}}",
          SERVICE_TOKEN: "{{service_token}}",
          PORT: "4011",
        },
        ports: [{ container: 4011, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "catalog-service",
        image: "clawdiators/catalog-service:1.0",
        env: {
          SEED: "{{seed}}",
          SERVICE_TOKEN: "{{service_token}}",
          PORT: "4012",
        },
        ports: [{ container: 4012, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "pricing-engine",
        image: "clawdiators/pricing-engine:1.0",
        env: {
          SEED: "{{seed}}",
          SERVICE_TOKEN: "{{service_token}}",
          PORT: "4013",
        },
        ports: [{ container: 4013, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "order-service",
        image: "clawdiators/order-service:1.0",
        env: {
          SEED: "{{seed}}",
          SERVICE_TOKEN: "{{service_token}}",
          PORT: "4014",
        },
        ports: [{ container: 4014, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "fulfillment-service",
        image: "clawdiators/fulfillment-service:1.0",
        env: {
          SEED: "{{seed}}",
          SERVICE_TOKEN: "{{service_token}}",
          PORT: "4015",
        },
        ports: [{ container: 4015, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
    ],
  },

  submissionSpec: {
    type: "json",
    schema: {
      completed_orders: "array",
      failed_attempts: "array",
      service_topology: "object",
      transaction_log: "array",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: SERVICE_MESH_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateServiceMeshData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      orders: data.orders,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreServiceMesh(input);
  },

  validateSubmission(submission: Record<string, unknown>, _gt: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    // completed_orders validation
    if (!Array.isArray(submission.completed_orders) || submission.completed_orders.length === 0) {
      warnings.push({
        severity: "error",
        field: "completed_orders",
        message: `Missing or empty "completed_orders". Submit an array of completed order objects with order_id, product_id, quantity, reservation_id, quote_id, allocation_id, final_price, and warehouse.`,
      });
    } else {
      const orders = submission.completed_orders as Array<Record<string, unknown>>;
      const requiredKeys = ["order_id", "product_id", "reservation_id", "quote_id", "allocation_id"];
      for (let i = 0; i < orders.length; i++) {
        const missing = requiredKeys.filter((k) => !orders[i][k]);
        if (missing.length > 0) {
          warnings.push({
            severity: "warning",
            field: `completed_orders[${i}]`,
            message: `Order at index ${i} is missing keys: ${missing.join(", ")}. Each completed order needs all transaction IDs from the service mesh.`,
          });
        }
      }
    }

    // failed_attempts validation
    if (!Array.isArray(submission.failed_attempts)) {
      warnings.push({
        severity: "warning",
        field: "failed_attempts",
        message: `Missing "failed_attempts". Include any failed transaction attempts with compensation actions. This affects completeness and analysis scoring.`,
      });
    } else {
      const attempts = submission.failed_attempts as Array<Record<string, unknown>>;
      for (let i = 0; i < attempts.length; i++) {
        if (!attempts[i].compensation_actions) {
          warnings.push({
            severity: "warning",
            field: `failed_attempts[${i}]`,
            message: `Failed attempt at index ${i} missing "compensation_actions". Document the saga rollback steps you performed.`,
          });
        }
      }
    }

    // service_topology validation
    if (!submission.service_topology || typeof submission.service_topology !== "object") {
      warnings.push({
        severity: "warning",
        field: "service_topology",
        message: `Missing "service_topology". Provide a map of each service's dependencies and required auth scopes. This affects analysis scoring.`,
      });
    }

    // transaction_log validation
    if (!Array.isArray(submission.transaction_log) || submission.transaction_log.length === 0) {
      warnings.push({
        severity: "warning",
        field: "transaction_log",
        message: `Missing or empty "transaction_log". Log every API call with timestamp, service, action, and result. This affects methodology scoring.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateServiceMeshData(seed);
    return {
      "orders.json": JSON.stringify(data.orders, null, 2),
    };
  },
};
