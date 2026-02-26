import type { ScoringDimension } from "./types";

// Elo system
export const ELO_DEFAULT = 1000;
export const ELO_K_NEW = 32; // K-factor for <30 matches
export const ELO_K_ESTABLISHED = 16; // K-factor for 30+ matches
export const ELO_K_THRESHOLD = 30; // matches before K drops
export const ELO_FLOOR = 100;

// Scoring
export const MAX_SCORE = 1000;
export const QUICKDRAW_TIME_LIMIT_SECS = 60;

// Legacy scoring weights (kept for backward compat)
export const QUICKDRAW_WEIGHTS = {
  accuracy: 0.4,
  speed: 0.25,
  efficiency: 0.2,
  style: 0.15,
} as const;

export const TOOLCHAIN_WEIGHTS = {
  accuracy: 0.35,
  speed: 0.15,
  efficiency: 0.25,
  style: 0.25,
} as const;

export const EFFICIENCY_WEIGHTS = {
  accuracy: 0.3,
  speed: 0.1,
  efficiency: 0.45,
  style: 0.15,
} as const;

export const CASCADING_WEIGHTS = {
  accuracy: 0.3,
  speed: 0.1,
  efficiency: 0.15,
  style: 0.45,
} as const;

export const RELAY_WEIGHTS = {
  accuracy: 0.4,
  speed: 0.1,
  efficiency: 0.15,
  style: 0.35,
} as const;

// ── Scoring Dimensions (flexible per-challenge) ──────────────────────

export const QUICKDRAW_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.4, description: "Correctness of submitted answers vs ground truth", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.25, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.2, description: "Fewest API calls to solve the puzzle", color: "gold" },
  { key: "style", label: "Style", weight: 0.15, description: "Structured, clean submission format", color: "purple" },
];

export const TOOLCHAIN_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.35, description: "Correctness of final answer across chained APIs", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.25, description: "Optimal API call sequencing", color: "gold" },
  { key: "style", label: "Style", weight: 0.25, description: "Chain orchestration quality", color: "purple" },
];

export const EFFICIENCY_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.3, description: "Correctness of submitted answers", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.1, description: "Time to submission", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.45, description: "Minimal API calls and resource use", color: "gold" },
  { key: "style", label: "Style", weight: 0.15, description: "Submission structure quality", color: "purple" },
];

export const CASCADING_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.3, description: "Correctness despite failures", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.1, description: "Time to submission", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "resilience", label: "Resilience", weight: 0.45, description: "Graceful failure handling and recovery", color: "coral" },
];

export const RELAY_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.4, description: "Correctness of final combined answer", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.1, description: "Time to submission", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "handoff", label: "Handoff", weight: 0.35, description: "Context compression and transfer quality", color: "purple" },
];

export const CIPHER_FORGE_DIMENSIONS: ScoringDimension[] = [
  { key: "decryption_accuracy", label: "Decryption", weight: 0.5, description: "Correctness of decrypted messages", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.2, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "difficulty_bonus", label: "Difficulty", weight: 0.15, description: "Bonus for solving harder ciphers", color: "purple" },
];

export const LOGIC_REEF_DIMENSIONS: ScoringDimension[] = [
  { key: "validity", label: "Validity", weight: 0.45, description: "Correctness of logical conclusions", color: "emerald" },
  { key: "minimality", label: "Minimality", weight: 0.25, description: "Concise, minimal reasoning steps", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const REEF_REFACTOR_DIMENSIONS: ScoringDimension[] = [
  { key: "correctness", label: "Correctness", weight: 0.5, description: "Correct outputs for all test cases", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.2, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "coverage", label: "Coverage", weight: 0.15, description: "Percentage of functions attempted", color: "purple" },
];

// Category color map for web UI
export const CATEGORY_COLORS: Record<string, string> = {
  calibration: "emerald",
  toolchain: "sky",
  efficiency: "gold",
  recovery: "purple",
  relay: "coral",
  coding: "emerald",
  reasoning: "sky",
  context: "gold",
  memory: "purple",
  endurance: "coral",
  adversarial: "coral",
  multimodal: "sky",
};

// Solo calibration thresholds
export const SOLO_WIN_THRESHOLD = 700;
export const SOLO_DRAW_THRESHOLD = 400;

// API key
export const API_KEY_PREFIX = "clw_";
export const API_KEY_BYTES = 32;

// Agent name constraints
export const AGENT_NAME_MIN = 3;
export const AGENT_NAME_MAX = 40;
export const AGENT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

// Memory limits
export const MEMORY_MAX_REFLECTIONS = 20;
export const MEMORY_MAX_STRATEGIES = 10;
export const MEMORY_MAX_RIVALS = 10;

// Rivalry threshold
export const RIVALRY_BOUT_THRESHOLD = 3;

// Quickdraw sandbox API sizes
export const WEATHER_CITY_COUNT = 20;
export const STOCK_TICKER_COUNT = 10;
export const STOCK_HISTORY_DAYS = 30;
export const NEWS_TOPIC_COUNT = 5;
export const NEWS_ARTICLES_PER_TOPIC = 4;

// Heartbeat and checkpoint config
export const HEARTBEAT_GRACE_PERIOD_MS = 60_000; // 1 min grace after missed heartbeat
