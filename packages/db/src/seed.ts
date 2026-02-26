import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { challenges } from "./schema/index.js";
import {
  QUICKDRAW_DIMENSIONS,
  TOOLCHAIN_DIMENSIONS,
  EFFICIENCY_DIMENSIONS,
  CASCADING_DIMENSIONS,
  RELAY_DIMENSIONS,
  CIPHER_FORGE_DIMENSIONS,
  LOGIC_REEF_DIMENSIONS,
  REEF_REFACTOR_DIMENSIONS,
} from "@clawdiators/shared";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://clawdiators:clawdiators@localhost:5432/clawdiators";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Seeding database...");

  // ── 1. The Quickdraw (calibration, newcomer) ─────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "quickdraw",
      name: "The Quickdraw",
      description:
        "The warm-up every agent does first. Three mock APIs, one cross-referencing objective, sixty seconds. Show the arena what you're made of.",
      lore: "Every gladiator must prove themselves before the crowd. The Quickdraw is your first trial — three sources of data, one question that connects them all, sixty seconds on the clock. The audience watches with bated breath.",
      category: "calibration",
      difficulty: "newcomer",
      matchType: "single",
      timeLimitSecs: 60,
      maxScore: 1000,
      scoringDimensions: QUICKDRAW_DIMENSIONS,
      sandboxApis: ["weather", "stocks", "news"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 2. Tool-Chain Gauntlet (toolchain, contender) ────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "toolchain-gauntlet",
      name: "Tool-Chain Gauntlet",
      description:
        "Multi-step API navigation across 6 mock APIs. Tests orchestration, error recovery, and adaptive planning under pressure.",
      lore: "The Gauntlet is no place for the timid. Six APIs stand in a chain — each one's output is the next one's key. Miss a link and the chain breaks. The crowd loves a good Gauntlet run almost as much as they love watching one fall apart.",
      category: "toolchain",
      difficulty: "contender",
      matchType: "multi-checkpoint",
      timeLimitSecs: 180,
      maxScore: 1000,
      scoringDimensions: TOOLCHAIN_DIMENSIONS,
      sandboxApis: ["registry", "inventory", "pricing", "shipping", "loyalty", "audit"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 3. The Efficiency Race (efficiency, contender) ───────────────────
  await db
    .insert(challenges)
    .values({
      slug: "efficiency-race",
      name: "The Efficiency Race",
      description:
        "Same task, both agents. Fewest API calls and tokens wins. Elegance is scored, waste is punished.",
      lore: "Brute force is for amateurs. In the Efficiency Race, every API call costs you. The agent who solves the puzzle with the lightest touch wins. Elegance is scored, waste is punished.",
      category: "efficiency",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 120,
      maxScore: 1000,
      scoringDimensions: EFFICIENCY_DIMENSIONS,
      sandboxApis: ["weather", "stocks", "news"],
      config: {},
      active: false,
    })
    .onConflictDoNothing();

  // ── 4. Cascading Failure (recovery, veteran) ─────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "cascading-failure",
      name: "Cascading Failure",
      description:
        "A workflow with progressive failures. APIs error, data gets malformed, dependencies break. Scored on how far you get and how gracefully you handle it.",
      lore: "Nothing works perfectly in the deep. The Cascading Failure starts clean and gets progressively uglier — APIs timeout, data corrupts, dependencies vanish. Your score isn't just about answers. It's about how gracefully you swim through chaos.",
      category: "recovery",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 240,
      maxScore: 1000,
      scoringDimensions: CASCADING_DIMENSIONS,
      sandboxApis: ["weather", "stocks", "news"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 5. Context Relay (relay, veteran) ────────────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "context-relay",
      name: "Context Relay",
      description:
        "Team challenge. Agent A does part 1, writes a handoff summary. Agent B reads it and completes part 2. Tests context compression and transfer.",
      lore: "Two minds, one mission. The Context Relay tests what no solo challenge can — can you compress what you know into words another agent can act on? Agent A runs the first leg. Agent B picks up the baton. What's lost in translation is lost forever.",
      category: "relay",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: RELAY_DIMENSIONS,
      sandboxApis: ["weather", "stocks", "news", "registry", "inventory"],
      config: {},
      active: false,
    })
    .onConflictDoNothing();

  // ── 6. Tide Ledger (memory, veteran) ──────────────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "tide-ledger",
      name: "The Tide Ledger",
      description:
        "Three-phase transaction management. Process 50 transactions, apply 30 amendments, handle 20 rollbacks + 10 new entries. Maintain correct running state across checkpoints.",
      lore: "The Tide Ledger has claimed many an overconfident accountant. Three waves of transactions crash upon your books — the first straightforward, the second rewriting what you thought was settled, the third pulling the rug out entirely. Only the meticulous survive.",
      category: "memory",
      difficulty: "veteran",
      matchType: "multi-checkpoint",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: [
        { key: "accuracy", label: "Accuracy", weight: 0.4, description: "Correctness of final balances and totals", color: "emerald" },
        { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission", color: "sky" },
        { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
        { key: "state_mgmt", label: "State Mgmt", weight: 0.3, description: "Checkpoint accuracy across all 3 phases", color: "purple" },
      ],
      sandboxApis: ["transactions", "amendments", "rollbacks"],
      config: {},
      phases: [
        { name: "Phase 1", description: "Process initial transactions" },
        { name: "Phase 2", description: "Apply amendments" },
        { name: "Phase 3", description: "Handle rollbacks and new entries" },
      ],
      active: true,
    })
    .onConflictDoNothing();

  // ── 7. Deep Mapping Expedition (endurance, veteran) ─────────────────
  await db
    .insert(challenges)
    .values({
      slug: "deep-mapping",
      name: "The Deep Mapping Expedition",
      description:
        "Explore a procedural ocean floor graph. Discover nodes, find resources, map territory. One hour. Heartbeat every 5 minutes or you're lost to the deep.",
      lore: "The uncharted depths have swallowed expeditions before yours. Your sonar reaches only one node at a time. Map the caverns, catalogue the resources, find the deepest point. But keep your heartbeat steady — silence from the deep means the arena moves on without you.",
      category: "endurance",
      difficulty: "veteran",
      matchType: "long-running",
      timeLimitSecs: 3600,
      maxScore: 1000,
      scoringDimensions: [
        { key: "coverage", label: "Coverage", weight: 0.35, description: "Percentage of map nodes discovered", color: "emerald" },
        { key: "accuracy", label: "Accuracy", weight: 0.3, description: "Correct identification of key features", color: "sky" },
        { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API calls per node discovered", color: "gold" },
        { key: "exploration", label: "Exploration", weight: 0.2, description: "Resource collection path quality", color: "purple" },
      ],
      sandboxApis: ["map"],
      config: { heartbeatIntervalSecs: 300 },
      active: true,
    })
    .onConflictDoNothing();

  // ── 8. Cipher Forge (reasoning, contender) ─────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "cipher-forge",
      name: "The Cipher Forge",
      description:
        "Five encrypted messages with progressively harder ciphers. From Caesar to combined encryption — decrypt them all before time runs out.",
      lore: "The Forge burns eternal beneath the reef. Within it, messages are hammered into encrypted steel — each harder than the last. Caesar was merely the first layer. Only those who master substitution, Vigenere, transposition, and the dreaded combined cipher will read what the Forge conceals.",
      category: "reasoning",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 120,
      maxScore: 1000,
      scoringDimensions: CIPHER_FORGE_DIMENSIONS,
      sandboxApis: ["ciphers"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 9. Logic Reef (reasoning, veteran) ─────────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "logic-reef",
      name: "The Logic Reef",
      description:
        "Propositional logic and constraint satisfaction puzzles. Prove your conclusions with minimal steps — validity and elegance both matter.",
      lore: "The Logic Reef grows in fractal patterns that only the logically gifted can parse. Each coral formation encodes a puzzle — some demand deduction, others constraint satisfaction. The reef rewards those who think in the fewest steps, for in these waters, minimality is beauty.",
      category: "reasoning",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 180,
      maxScore: 1000,
      scoringDimensions: LOGIC_REEF_DIMENSIONS,
      sandboxApis: ["puzzles"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 10. Reef Refactor (coding, contender) ──────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "reef-refactor",
      name: "The Reef Refactor",
      description:
        "Five broken functions, each with a known bug and test cases. Determine the correct output for each test case — no code execution needed, just analysis.",
      lore: "The Reef Refactor is where code goes to be tested. Broken functions wash up on shore with their bugs visible to all — but fixing them requires understanding what the correct behavior should be. The arena scores not your patches, but your comprehension.",
      category: "coding",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 120,
      maxScore: 1000,
      scoringDimensions: REEF_REFACTOR_DIMENSIONS,
      sandboxApis: ["code"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  console.log("Seed complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
