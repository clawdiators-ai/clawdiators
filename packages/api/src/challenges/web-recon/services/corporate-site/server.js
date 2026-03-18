/**
 * Corporate Site — Web Recon Challenge Service
 *
 * Serves official company information: homepage, team, products, press releases.
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

const companyName = pick(COMPANY_NAMES, rand);
const industry = pick(INDUSTRIES, rand);
const hqCity = pick(CITIES, rand);
const foundedYear = randInt(2005, 2019, rand);
const employeeCount = pick(["150-300", "300-600", "600-1200", "1200-2500"], rand);

const coreProducts = pickN(
  ["DataForge", "ShieldOS", "StreamCore", "InsightPro", "FlowNet", "VaultDB", "NeuralOps", "EdgePulse"],
  randInt(2, 4, rand),
  rand,
);

const numEmployees = randInt(5, 8, rand);
const usedFirstNames = pickN(FIRST_NAMES, numEmployees, rand);
const usedLastNames = pickN(LAST_NAMES, numEmployees, rand);
const usedRoles = pickN(ROLES, numEmployees, rand);

const team = usedFirstNames.map((first, i) => ({
  name: `${first} ${usedLastNames[i]}`,
  role: i === 0 ? "CEO" : usedRoles[i],
  bio: `${first} ${usedLastNames[i]} brings extensive experience in ${industry} to ${companyName}.`,
}));

// ── Request Tracking ────────────────────────────────────────────────

let requestCount = 0;

// ── Routes ──────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "corporate-site" });
});

app.get("/__internal/metrics", (_req, res) => {
  res.json({ requests: requestCount, service: "corporate-site", uptime: process.uptime() });
});

app.get("/", (_req, res) => {
  requestCount++;
  res.json({
    company: companyName,
    tagline: `Leading innovation in ${industry}`,
    headquarters: hqCity,
    founded: foundedYear,
    employee_estimate: employeeCount,
    sections: ["/team", "/products", "/press", "/about"],
  });
});

app.get("/team", (_req, res) => {
  requestCount++;
  res.json({
    leadership: team.map((t) => ({
      name: t.name,
      role: t.role,
      bio: t.bio,
    })),
  });
});

app.get("/products", (_req, res) => {
  requestCount++;
  res.json({
    products: coreProducts.map((p) => ({
      name: p,
      status: "released",
      description: `${p} is ${companyName}'s ${industry} solution for enterprise customers.`,
    })),
  });
});

app.get("/press", (_req, res) => {
  requestCount++;
  res.json({
    press_releases: [
      {
        title: `${companyName} Announces Record Growth in ${industry}`,
        date: "2026-01-15",
        summary: `${companyName} reported strong growth driven by adoption of ${coreProducts[0]}.`,
      },
      {
        title: `${team[0].name} Keynotes at ${industry} Summit`,
        date: "2025-11-20",
        summary: `CEO ${team[0].name} presented ${companyName}'s vision for the future of ${industry}.`,
      },
    ],
  });
});

app.get("/about", (_req, res) => {
  requestCount++;
  res.json({
    name: companyName,
    founded: foundedYear,
    headquarters: hqCity,
    industry,
    mission: `${companyName} is dedicated to advancing ${industry} through innovative technology solutions.`,
    employee_estimate: employeeCount,
    ceo: team[0].name,
  });
});

// ── Start ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "4001", 10);
app.listen(PORT, () => {
  console.log(`corporate-site listening on :${PORT} (seed=${SEED})`);
});
