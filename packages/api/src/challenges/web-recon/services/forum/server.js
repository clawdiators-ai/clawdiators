/**
 * Forum — Web Recon Challenge Service
 *
 * Industry discussion forum where employees post under pseudonyms,
 * sometimes revealing internal strategies and unreleased products.
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

const PSEUDO_PREFIXES = [
  "tech", "code", "data", "sys", "dev", "net", "cloud",
  "quantum", "cyber", "neural", "pixel", "byte",
];

const PSEUDO_SUFFIXES = [
  "wizard", "ninja", "guru", "master", "hawk", "wolf",
  "fox", "sage", "monk", "pilot", "rider", "smith",
];

const FORUM_TAGS = [
  "industry", "tech", "career", "strategy", "products",
  "rumors", "hiring", "patents", "M&A", "leadership",
];

function generatePseudonym() {
  return pick(PSEUDO_PREFIXES, rand) + "_" + pick(PSEUDO_SUFFIXES, rand) + randInt(10, 99, rand);
}

// Consume PRNG in same order as data.ts
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

// Employees
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
  return {
    name: `${first} ${usedLastNames[i]}`,
    pseudonym: generatePseudonym(),
    isForumPoster: services.includes("forum"),
  };
});

// Unreleased products
const numProducts = randInt(3, 5, rand);
const usedCodenames = pickN(PRODUCT_CODENAMES, numProducts, rand);
const usedCategories = pickN(PRODUCT_CATEGORIES, numProducts, rand);
const quarters = ["Q1", "Q2", "Q3", "Q4"];
const years = ["2026", "2027"];

const unreleasedProducts = usedCodenames.map((codename, i) => {
  rand(); rand(); rand(); rand(); // consume evidence source rands
  return {
    codename,
    category: usedCategories[i],
    estimatedRelease: `${pick(quarters, rand)} ${pick(years, rand)}`,
  };
});

// Skip patents and articles PRNG consumption (simplified for forum service)
// In production, this would need exact PRNG sync with data.ts

// Generate forum posts
const forumPosters = employees.filter((e) => e.isForumPoster);
const numPosts = randInt(8, 12, rand);
const threads = [];

for (let i = 0; i < numPosts; i++) {
  const isEmployeePost = rand() > 0.4 && forumPosters.length > 0;
  const poster = isEmployeePost ? pick(forumPosters, rand) : null;
  const revealsStrategy = isEmployeePost && rand() > 0.5;

  const postYear = randInt(2025, 2026, rand);
  const postMonth = String(randInt(1, 12, rand)).padStart(2, "0");
  const postDay = String(randInt(1, 28, rand)).padStart(2, "0");

  let threadTitle;
  let content;

  if (revealsStrategy && poster) {
    const product = unreleasedProducts.length > 0 ? pick(unreleasedProducts, rand) : null;
    if (product) {
      threadTitle = `Anyone heard about new ${product.category} developments?`;
      content = `I work in ${industry} and have been hearing whispers about a project codenamed "${product.codename}" from a major player. Sounds like it could be a ${product.category} that ships around ${product.estimatedRelease}. Can't say more but it's exciting.`;
    } else {
      threadTitle = `${industry} industry shifts coming?`;
      content = `Working in the space and seeing some interesting moves. ${companyName} seems to be gearing up for something big. Their ${pick(coreProducts, rand)} team has been growing fast.`;
    }
  } else if (poster) {
    threadTitle = pick([
      `Best practices for ${industry} tooling?`,
      `Career advice: ${industry} vs traditional tech`,
      `What's your ${industry} tech stack?`,
      `Thoughts on ${industry} market trends`,
    ], rand);
    content = `Been working in ${industry} for a while now. The space is evolving quickly. Anyone else finding that ${pick(coreProducts, rand)}-style solutions are becoming table stakes?`;
  } else {
    threadTitle = pick([
      `${companyName} - worth working at?`,
      `${industry} company comparison thread`,
      `Anyone interview at ${companyName}?`,
      `${companyName} product reviews`,
    ], rand);
    content = `Looking into ${companyName} - they seem to be doing interesting work in ${industry}. Anyone have experience with their products or culture?`;
  }

  threads.push({
    id: `thread-${i + 1}`,
    title: threadTitle,
    username: poster ? poster.pseudonym : `anon_${randInt(1000, 9999, rand)}`,
    content,
    tags: pickN(FORUM_TAGS, randInt(1, 3, rand), rand),
    date: `${postYear}-${postMonth}-${postDay}`,
    replies: randInt(0, 8, rand),
  });
}

// User profiles
const users = {};
for (const thread of threads) {
  if (!users[thread.username]) {
    users[thread.username] = {
      username: thread.username,
      join_date: `2024-${String(randInt(1, 12, rand)).padStart(2, "0")}-01`,
      post_count: randInt(5, 50, rand),
    };
  }
}

// ── Request Tracking ────────────────────────────────────────────────

let requestCount = 0;

// ── Routes ──────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "forum" });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({ requests: requestCount, service: "forum", uptime: process.uptime() });
});

app.get("/threads", (req, res) => {
  requestCount++;
  let filtered = threads;
  if (req.query.tag) {
    filtered = filtered.filter((t) => t.tags.includes(String(req.query.tag)));
  }
  res.json({ threads: filtered, total: filtered.length });
});

app.get("/threads/:id", (req, res) => {
  requestCount++;
  const thread = threads.find((t) => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  res.json(thread);
});

app.get("/users/:username", (req, res) => {
  requestCount++;
  const user = users[req.params.username];
  if (!user) return res.status(404).json({ error: "User not found" });
  const userThreads = threads.filter((t) => t.username === req.params.username);
  res.json({ ...user, threads: userThreads });
});

app.get("/search", (req, res) => {
  requestCount++;
  const q = String(req.query.q ?? "").toLowerCase();
  if (!q) return res.json({ results: [], total: 0 });
  const results = threads.filter((t) =>
    t.title.toLowerCase().includes(q) ||
    t.content.toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q))
  );
  res.json({ results, total: results.length });
});

// ── Start ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "4005", 10);
app.listen(PORT, () => {
  console.log(`forum listening on :${PORT} (seed=${SEED})`);
});
