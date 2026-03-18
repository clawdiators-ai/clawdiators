/**
 * Patent Database — Web Recon Challenge Service
 *
 * Public patent filing database. Patents reference employees as inventors
 * and hint at unreleased products. Content is deterministic from SEED.
 */

import express from "express";

const app = express();
app.use(express.json());

// ── Seeded PRNG ─────────────────────────────────────────────────────

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickN(arr, n, rand) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

function randInt(min, max, rand) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

// ── Data Generation ─────────────────────────────────────────────────

const SEED = parseInt(process.env.SEED ?? "42", 10);
const rand = rng(SEED);

const COMPANY_NAMES = [
  "Nexara Technologies", "Veridian Systems", "Crestpoint Labs",
  "Solari Dynamics", "Arcturus Innovations", "Luminos Corp",
  "Tessera Analytics", "Palanthos Group", "Quorum Biosystems",
  "Helix Foundry", "Cygnova Research", "Stratosync Inc",
];

const INDUSTRIES = [
  "enterprise AI", "autonomous vehicles", "quantum computing",
  "synthetic biology", "advanced materials", "cybersecurity",
  "space technology", "green energy", "healthcare AI",
  "robotics", "fintech infrastructure", "edge computing",
];

const CITIES = [
  "San Francisco", "Austin", "Boston", "Seattle", "New York",
  "Denver", "Toronto", "London", "Berlin", "Singapore",
  "Tel Aviv", "Bangalore",
];

const FIRST_NAMES = [
  "Alexandra", "Marcus", "Elena", "David", "Sophia",
  "James", "Priya", "Michael", "Yuki", "Carlos",
  "Nadia", "Thomas", "Lin", "Robert", "Amara",
  "Viktor", "Sarah", "Omar", "Rachel", "Jun",
];

const LAST_NAMES = [
  "Chen", "Patel", "Morrison", "Johansson", "Reeves",
  "Nakamura", "Okafor", "Fischer", "Alvarez", "Kim",
  "Thornton", "Gupta", "Larsen", "Santos", "Volkov",
  "Brennan", "Tanaka", "Al-Rashid", "Mueller", "Osei",
];

const ROLES = [
  "CEO", "CTO", "VP of Engineering", "VP of Product",
  "Chief Scientist", "Head of Research", "Director of AI",
  "VP of Business Development", "Head of Patents", "Lead Architect",
  "Director of Operations", "VP of Strategy",
];

const PRODUCT_CODENAMES = [
  "Project Aurora", "Project Meridian", "Project Catalyst",
  "Project Nexus", "Project Horizon", "Project Vertex",
  "Project Quantum Leap", "Project Sentinel", "Project Helix",
  "Project Obsidian", "Project Prism", "Project Zenith",
];

const PRODUCT_CATEGORIES = [
  "enterprise platform", "developer tools", "analytics engine",
  "security suite", "infrastructure service", "automation platform",
  "data pipeline", "monitoring solution", "API gateway",
];

const PATENT_TITLES_PREFIX = [
  "Method and System for", "Apparatus for", "System for Automated",
  "Distributed Framework for", "Novel Approach to",
  "Scalable Architecture for", "Real-time Processing of",
  "Machine Learning Based", "Secure Protocol for",
];

const PATENT_TITLES_SUFFIX = [
  "Multi-dimensional Data Aggregation", "Predictive Resource Allocation",
  "Cross-network Anomaly Detection", "Federated Model Training",
  "Dynamic Load Balancing in Distributed Systems",
  "Encrypted State Synchronization", "Adaptive Query Optimization",
  "Context-aware Decision Routing", "Low-latency Stream Processing",
  "Autonomous System Recovery", "Hierarchical Feature Extraction",
  "Privacy-preserving Data Fusion",
];

// Consume the same random sequence as data.ts
const companyName = pick(COMPANY_NAMES, rand);
const industry = pick(INDUSTRIES, rand);
const _hqCity = pick(CITIES, rand);
const _foundedYear = randInt(2005, 2019, rand);
const _employeeCount = pick(["150-300", "300-600", "600-1200", "1200-2500"], rand);
const coreProducts = pickN(
  ["DataForge", "ShieldOS", "StreamCore", "InsightPro", "FlowNet", "VaultDB", "NeuralOps", "EdgePulse"],
  randInt(2, 4, rand),
  rand,
);

// Generate employees (must match data.ts sequence)
const numEmployees = randInt(5, 8, rand);
const usedFirstNames = pickN(FIRST_NAMES, numEmployees, rand);
const usedLastNames = pickN(LAST_NAMES, numEmployees, rand);
const _usedRoles = pickN(ROLES, numEmployees, rand);

const employees = usedFirstNames.map((first, i) => {
  const services = ["corporate-site"];
  if (rand() > 0.3) services.push("patent-db");
  if (rand() > 0.4) services.push("forum");
  if (rand() > 0.5) services.push("news-aggregator");
  if (rand() > 0.6) services.push("job-board");
  return { name: `${first} ${usedLastNames[i]}`, isInventor: services.includes("patent-db") };
});

// Unreleased products
const numProducts = randInt(3, 5, rand);
const usedCodenames = pickN(PRODUCT_CODENAMES, numProducts, rand);
const _usedCategories = pickN(PRODUCT_CATEGORIES, numProducts, rand);

const unreleasedProducts = usedCodenames.map((codename) => {
  rand(); rand(); rand(); rand();
  return { codename };
});

// Generate patents
const numPatents = randInt(8, 12, rand);
const inventorEmployees = employees.filter((e) => e.isInventor);
const patents = [];

for (let i = 0; i < numPatents; i++) {
  const prefix = pick(PATENT_TITLES_PREFIX, rand);
  const suffix = pick(PATENT_TITLES_SUFFIX, rand);
  const inventor = inventorEmployees.length > 0
    ? pick(inventorEmployees, rand)
    : pick(employees, rand);
  const secondInventor = rand() > 0.5 && inventorEmployees.length > 1
    ? pick(inventorEmployees.filter((e) => e.name !== inventor.name), rand)
    : null;

  const relatedProduct = rand() > 0.5 && unreleasedProducts.length > 0
    ? pick(unreleasedProducts, rand).codename
    : null;

  const filingYear = randInt(2023, 2026, rand);
  const filingMonth = String(randInt(1, 12, rand)).padStart(2, "0");
  const filingDay = String(randInt(1, 28, rand)).padStart(2, "0");

  patents.push({
    id: `PAT-${String(SEED).padStart(4, "0")}-${String(i + 1).padStart(3, "0")}`,
    title: `${prefix} ${suffix}`,
    inventors: secondInventor
      ? [inventor.name, secondInventor.name]
      : [inventor.name],
    filing_date: `${filingYear}-${filingMonth}-${filingDay}`,
    assignee: companyName,
    abstract: `This patent describes ${suffix.toLowerCase()} techniques applicable to ${industry} systems. The invention enables improved performance in ${pick(coreProducts, rand)} and related ${industry} applications.`,
    related_product: relatedProduct,
    status: "filed",
  });
}

// ── Request Tracking ────────────────────────────────────────────────

let requestCount = 0;

// ── Routes ──────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "patent-db" });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({ requests: requestCount, service: "patent-db", uptime: process.uptime() });
});

app.get("/patents", (req, res) => {
  requestCount++;
  let filtered = patents;
  if (req.query.assignee) {
    filtered = filtered.filter((p) => p.assignee.toLowerCase().includes(String(req.query.assignee).toLowerCase()));
  }
  if (req.query.inventor) {
    filtered = filtered.filter((p) => p.inventors.some((inv) => inv.toLowerCase().includes(String(req.query.inventor).toLowerCase())));
  }
  res.json({ patents: filtered, total: filtered.length });
});

app.get("/patents/:id", (req, res) => {
  requestCount++;
  const patent = patents.find((p) => p.id === req.params.id);
  if (!patent) return res.status(404).json({ error: "Patent not found" });
  res.json(patent);
});

app.get("/search", (req, res) => {
  requestCount++;
  const q = String(req.query.q ?? "").toLowerCase();
  if (!q) return res.json({ results: [], total: 0 });
  const results = patents.filter((p) =>
    p.title.toLowerCase().includes(q) ||
    p.abstract.toLowerCase().includes(q) ||
    p.assignee.toLowerCase().includes(q) ||
    p.inventors.some((inv) => inv.toLowerCase().includes(q))
  );
  res.json({ results, total: results.length });
});

// ── Start ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "4003", 10);
app.listen(PORT, () => {
  console.log(`patent-db listening on :${PORT} (seed=${SEED})`);
});
