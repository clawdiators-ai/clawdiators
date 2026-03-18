/**
 * Job Board — Web Recon Challenge Service
 *
 * Industry job board with listings from the target company and decoys.
 * Job descriptions hint at unreleased products and strategic priorities.
 * Content is generated deterministically from the SEED env var.
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

// Consume the same random sequence as data.ts to stay in sync
const companyName = pick(COMPANY_NAMES, rand);
const industry = pick(INDUSTRIES, rand);
const hqCity = pick(CITIES, rand);
const _foundedYear = randInt(2005, 2019, rand);
const _employeeCount = pick(["150-300", "300-600", "600-1200", "1200-2500"], rand);
const _coreProducts = pickN(
  ["DataForge", "ShieldOS", "StreamCore", "InsightPro", "FlowNet", "VaultDB", "NeuralOps", "EdgePulse"],
  randInt(2, 4, rand),
  rand,
);

// Skip employee generation to stay in sync (same rand calls as data.ts)
const numEmployees = randInt(5, 8, rand);
for (let i = 0; i < numEmployees; i++) {
  // consume same rand calls as data.ts employee generation
  rand(); rand(); rand(); rand(); rand();
}

// Unreleased products
const numProducts = randInt(3, 5, rand);
const usedCodenames = pickN(PRODUCT_CODENAMES, numProducts, rand);
const usedCategories = pickN(PRODUCT_CATEGORIES, numProducts, rand);

const unreleasedProducts = usedCodenames.map((codename, i) => {
  // consume rand calls for evidence sources
  rand(); rand(); rand(); rand();
  return {
    codename,
    category: usedCategories[i],
  };
});

// Generate job listings
const listings = unreleasedProducts.map((product, i) => ({
  id: `job-${i + 1}`,
  company: companyName,
  title: `Senior ${product.category} Engineer`,
  description: `Join ${companyName} to work on cutting-edge ${product.category} technology. You will contribute to ${product.codename} and help shape the future of ${industry}.`,
  location: hqCity,
  posted: `2026-${String(randInt(1, 3, rand)).padStart(2, "0")}-${String(randInt(1, 28, rand)).padStart(2, "0")}`,
  tags: [industry, product.category, "engineering"],
}));

// Decoy listings
const numDecoys = randInt(3, 6, rand);
for (let i = 0; i < numDecoys; i++) {
  const decoyCompany = pick(COMPANY_NAMES.filter((n) => n !== companyName), rand);
  listings.push({
    id: `job-${listings.length + 1}`,
    company: decoyCompany,
    title: `${pick(["Senior", "Lead", "Staff"], rand)} ${pick(PRODUCT_CATEGORIES, rand)} Engineer`,
    description: `Join ${decoyCompany} to work on innovative solutions.`,
    location: pick(CITIES, rand),
    posted: `2026-${String(randInt(1, 3, rand)).padStart(2, "0")}-${String(randInt(1, 28, rand)).padStart(2, "0")}`,
    tags: [pick(INDUSTRIES, rand), "engineering"],
  });
}

// ── Request Tracking ────────────────────────────────────────────────

let requestCount = 0;

// ── Routes ──────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "job-board" });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({ requests: requestCount, service: "job-board", uptime: process.uptime() });
});

app.get("/listings", (req, res) => {
  requestCount++;
  const company = req.query.company;
  const filtered = company
    ? listings.filter((l) => l.company.toLowerCase().includes(String(company).toLowerCase()))
    : listings;
  res.json({ listings: filtered, total: filtered.length });
});

app.get("/listings/:id", (req, res) => {
  requestCount++;
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: "Listing not found" });
  res.json(listing);
});

app.get("/companies", (_req, res) => {
  requestCount++;
  const companies = [...new Set(listings.map((l) => l.company))];
  res.json({ companies: companies.map((c) => ({ name: c, listing_count: listings.filter((l) => l.company === c).length })) });
});

// ── Start ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "4002", 10);
app.listen(PORT, () => {
  console.log(`job-board listening on :${PORT} (seed=${SEED})`);
});
