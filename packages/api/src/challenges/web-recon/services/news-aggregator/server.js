/**
 * News Aggregator — Web Recon Challenge Service
 *
 * Industry news with articles from multiple outlets. Some articles contain
 * red herrings (outdated info, unsubstantiated rumors, misattributions).
 * Content is deterministic from SEED.
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
// Must consume PRNG in the exact same sequence as data.ts up to the
// article generation point to produce matching content.

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

const NEWS_OUTLETS = [
  "TechCrunch Insider", "The Protocol", "Wired Enterprise",
  "Ars Technical", "VentureBeat", "The Information",
  "Bloomberg Tech", "MIT Technology Review",
];

// Consume PRNG in same order as data.ts
const companyName = pick(COMPANY_NAMES, rand);
const industry = pick(INDUSTRIES, rand);
const hqCity = pick(CITIES, rand);
const _foundedYear = randInt(2005, 2019, rand);
const _employeeCount = pick(["150-300", "300-600", "600-1200", "1200-2500"], rand);
const coreProducts = pickN(
  ["DataForge", "ShieldOS", "StreamCore", "InsightPro", "FlowNet", "VaultDB", "NeuralOps", "EdgePulse"],
  randInt(2, 4, rand),
  rand,
);

// Employees
const numEmployees = randInt(5, 8, rand);
const usedFirstNames = pickN(FIRST_NAMES, numEmployees, rand);
const usedLastNames = pickN(LAST_NAMES, numEmployees, rand);
const _usedRoles = pickN(ROLES, numEmployees, rand);

const employees = usedFirstNames.map((first, i) => {
  rand(); rand(); rand(); rand(); rand(); // consume service assignment rands
  return { name: `${first} ${usedLastNames[i]}` };
});
employees[0].role = "CEO";

const ceoName = employees[0].name;

// Unreleased products
const numProducts = randInt(3, 5, rand);
const _usedCodenames = pickN(PRODUCT_CODENAMES, numProducts, rand);
const _usedCats = pickN(PRODUCT_CATEGORIES, numProducts, rand);
for (let i = 0; i < numProducts; i++) { rand(); rand(); rand(); rand(); }

// Patents (consume same rand sequence)
const numPatents = randInt(8, 12, rand);
const inventorEmployees = employees.filter(() => true); // simplified
for (let i = 0; i < numPatents; i++) {
  pick(PATENT_TITLES_PREFIX, rand);
  pick(PATENT_TITLES_SUFFIX, rand);
  pick(inventorEmployees, rand);
  const hasSecond = rand() > 0.5;
  if (hasSecond && inventorEmployees.length > 1) pick(inventorEmployees, rand);
  rand(); // relatedProduct check
  if (rand() < 0.5) {} // pick unreleased product (may or may not happen)
  randInt(2023, 2026, rand);
  randInt(1, 12, rand);
  randInt(1, 28, rand);
  pick(coreProducts, rand); // for abstract
}

// Now generate articles (matching data.ts sequence)
const numArticles = randInt(10, 15, rand);
const articles = [];

for (let i = 0; i < numArticles; i++) {
  const isRedHerring = rand() > 0.7;
  const articleYear = randInt(2024, 2026, rand);
  const articleMonth = String(randInt(1, 12, rand)).padStart(2, "0");
  const articleDay = String(randInt(1, 28, rand)).padStart(2, "0");

  let title;
  let summary;
  const mentions = [companyName];

  if (isRedHerring) {
    const herringType = pick(["outdated", "rumor", "misattribution"], rand);
    if (herringType === "outdated") {
      title = `${companyName} Reportedly Planning Major ${pick(["Layoffs", "Pivot", "Acquisition"], rand)}`;
      summary = `Sources close to ${companyName} suggest the company was considering a major strategic shift earlier this year. However, recent developments indicate this plan was shelved.`;
    } else if (herringType === "rumor") {
      title = `Rumor: ${companyName} in Talks to ${pick(["Acquire", "Merge With", "Partner With"], rand)} ${pick(COMPANY_NAMES.filter((n) => n !== companyName), rand)}`;
      summary = `Unconfirmed reports suggest ${companyName} may be exploring a major deal. Industry analysts are skeptical of these claims.`;
    } else {
      const otherCompany = pick(COMPANY_NAMES.filter((n) => n !== companyName), rand);
      title = `${otherCompany} Innovation Attributed to ${companyName} Partnership`;
      summary = `A recent breakthrough was mistakenly attributed to a ${companyName} collaboration. The companies have no formal partnership.`;
      mentions.push(otherCompany);
    }
  } else {
    const articleType = pick(["funding", "product", "hire", "strategy", "patent"], rand);
    if (articleType === "funding") {
      title = `${companyName} Secures New Funding for ${industry} Expansion`;
      summary = `${companyName}, headquartered in ${hqCity}, has raised additional capital to accelerate its ${industry} initiatives under CEO ${ceoName}.`;
    } else if (articleType === "product") {
      const prod = pick(coreProducts, rand);
      title = `${companyName}'s ${prod} Gains Traction in ${industry} Market`;
      summary = `${companyName}'s ${prod} platform is seeing growing adoption among enterprise customers.`;
    } else if (articleType === "hire") {
      const emp = pick(employees.slice(1), rand);
      title = `${companyName} Appoints ${emp.name}`;
      summary = `${companyName} has strengthened its leadership team with the appointment of ${emp.name}.`;
      mentions.push(emp.name);
    } else if (articleType === "strategy") {
      const move = pick(["acquisition", "partnership", "market_expansion", "product_launch", "restructuring"], rand);
      title = `${companyName} Eyes ${move === "market_expansion" ? "New Markets" : "Strategic Opportunities"}`;
      summary = `Industry observers note ${companyName} is pursuing ${move} opportunities.`;
    } else {
      title = `${companyName} Patent Filing Reveals ${industry} Ambitions`;
      summary = `A recent patent filing by ${companyName} suggests the company is developing new capabilities in ${industry}.`;
    }
  }

  articles.push({
    id: `article-${i + 1}`,
    title,
    outlet: pick(NEWS_OUTLETS, rand),
    date: `${articleYear}-${articleMonth}-${articleDay}`,
    summary,
    mentions,
  });
}

// ── Request Tracking ────────────────────────────────────────────────

let requestCount = 0;

// ── Routes ──────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "news-aggregator" });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({ requests: requestCount, service: "news-aggregator", uptime: process.uptime() });
});

app.get("/articles", (req, res) => {
  requestCount++;
  let filtered = articles;
  if (req.query.company) {
    filtered = filtered.filter((a) =>
      a.mentions.some((m) => m.toLowerCase().includes(String(req.query.company).toLowerCase()))
    );
  }
  if (req.query.topic) {
    const topic = String(req.query.topic).toLowerCase();
    filtered = filtered.filter((a) =>
      a.title.toLowerCase().includes(topic) || a.summary.toLowerCase().includes(topic)
    );
  }
  // Sort newest first
  filtered.sort((a, b) => b.date.localeCompare(a.date));
  res.json({ articles: filtered, total: filtered.length });
});

app.get("/articles/:id", (req, res) => {
  requestCount++;
  const article = articles.find((a) => a.id === req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });
  res.json(article);
});

app.get("/trending", (_req, res) => {
  requestCount++;
  res.json({
    trending: [
      { topic: industry, article_count: articles.length },
      { topic: companyName, article_count: articles.filter((a) => a.mentions.includes(companyName)).length },
      { topic: "M&A", article_count: articles.filter((a) => a.title.toLowerCase().includes("acqui") || a.title.toLowerCase().includes("merge")).length },
    ],
  });
});

// ── Start ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "4004", 10);
app.listen(PORT, () => {
  console.log(`news-aggregator listening on :${PORT} (seed=${SEED})`);
});
