import { mulberry32 } from "../../services/whimsy.js";

export interface LogicPuzzle {
  id: string;
  type: "propositional" | "constraint";
  difficulty: number;
  premises: string[];
  rules: string[];
  question: string;
}

export interface LogicGroundTruth {
  puzzles: Array<{
    id: string;
    answer: string | boolean | number;
    reasoning: string;
    minimal_steps: number;
  }>;
}

export interface LogicData {
  puzzles: LogicPuzzle[];
  groundTruth: LogicGroundTruth;
  objective: string;
}

// ── Puzzle generators ──────────────────────────────────────────────

const CREATURES = ["crab", "octopus", "shark", "eel", "starfish", "seahorse", "jellyfish", "turtle"];
const COLORS = ["red", "blue", "green", "gold", "silver", "purple"];
const LOCATIONS = ["north reef", "south reef", "deep trench", "coral garden", "tidal pool", "kelp forest"];

function generatePropositionalPuzzle(seed: number, rng: () => number, difficulty: number, idx: number): {
  puzzle: LogicPuzzle;
  truth: LogicGroundTruth["puzzles"][0];
} {
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const creatures = [...CREATURES];
  for (let i = creatures.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [creatures[i], creatures[j]] = [creatures[j], creatures[i]];
  }

  const a = creatures[0];
  const b = creatures[1];
  const c = creatures[2];
  const loc1 = pick(LOCATIONS);
  const loc2 = pick(LOCATIONS.filter((l) => l !== loc1));

  let premises: string[];
  let rules: string[];
  let question: string;
  let answer: string | boolean;
  let reasoning: string;
  let minSteps: number;

  if (difficulty <= 2) {
    // Simple: if P then Q, P, therefore Q (modus ponens)
    premises = [
      `If the ${a} is in the ${loc1}, then the ${b} is in the ${loc2}.`,
      `The ${a} is in the ${loc1}.`,
    ];
    rules = ["Apply modus ponens to determine where creatures are located."];
    question = `Is the ${b} in the ${loc2}?`;
    answer = true;
    reasoning = `Since the ${a} is in the ${loc1} (premise 2), and if ${a} is in ${loc1} then ${b} is in ${loc2} (premise 1), therefore ${b} is in ${loc2}.`;
    minSteps = 1;
  } else if (difficulty === 3) {
    // Chain: if P→Q, Q→R, P, therefore R
    const loc3 = pick(LOCATIONS.filter((l) => l !== loc1 && l !== loc2));
    premises = [
      `If the ${a} is in the ${loc1}, then the ${b} is in the ${loc2}.`,
      `If the ${b} is in the ${loc2}, then the ${c} is in the ${loc3}.`,
      `The ${a} is in the ${loc1}.`,
    ];
    rules = ["Chain implications to find the final location."];
    question = `Where is the ${c}?`;
    answer = loc3;
    reasoning = `${a} in ${loc1} → ${b} in ${loc2} → ${c} in ${loc3}. By chaining the two implications.`;
    minSteps = 2;
  } else {
    // Contrapositive: if P→Q, not Q, therefore not P
    premises = [
      `If the ${a} is in the ${loc1}, then the ${b} is in the ${loc2}.`,
      `The ${b} is NOT in the ${loc2}.`,
    ];
    rules = ["Use contrapositive reasoning (if P→Q and not Q, then not P)."];
    question = `Is the ${a} in the ${loc1}?`;
    answer = false;
    reasoning = `By contrapositive: if ${a} in ${loc1} → ${b} in ${loc2}, and ${b} is NOT in ${loc2}, then ${a} is NOT in ${loc1}.`;
    minSteps = 1;
  }

  return {
    puzzle: {
      id: `logic-${seed}-prop-${idx}`,
      type: "propositional",
      difficulty,
      premises,
      rules,
      question,
    },
    truth: {
      id: `logic-${seed}-prop-${idx}`,
      answer,
      reasoning,
      minimal_steps: minSteps,
    },
  };
}

function generateConstraintPuzzle(seed: number, rng: () => number, difficulty: number, idx: number): {
  puzzle: LogicPuzzle;
  truth: LogicGroundTruth["puzzles"][0];
} {
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

  const creatures = [...CREATURES];
  for (let i = creatures.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [creatures[i], creatures[j]] = [creatures[j], creatures[i]];
  }

  const colors = [...COLORS];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }

  // Constraint satisfaction: assign colors to creatures with constraints
  const n = difficulty <= 2 ? 3 : difficulty <= 3 ? 4 : 5;
  const selected = creatures.slice(0, n);
  const selectedColors = colors.slice(0, n);

  // Generate a valid assignment
  const assignment: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    assignment[selected[i]] = selectedColors[i];
  }

  // Generate constraints from the assignment
  const premises: string[] = [];
  const constraints: string[] = [];

  // Direct assignment clue for first creature
  premises.push(`The ${selected[0]} is ${assignment[selected[0]]}.`);

  // "Not" constraints
  for (let i = 1; i < n; i++) {
    const wrongColor = selectedColors[(i + 1) % n];
    premises.push(`The ${selected[i]} is NOT ${wrongColor}.`);
  }

  // Relational constraint
  if (n >= 3) {
    premises.push(`The ${selected[1]} is the same color as: one of ${selectedColors.filter((c) => c === assignment[selected[1]]).concat(selectedColors.filter((c) => c !== assignment[selected[1]]).slice(0, 1)).join(" or ")}.`);
  }

  // Unique constraint
  constraints.push("Each creature has a unique color.");
  constraints.push(`Available colors: ${selectedColors.join(", ")}.`);

  const targetIdx = randInt(1, n - 1);
  const question = `What color is the ${selected[targetIdx]}?`;

  return {
    puzzle: {
      id: `logic-${seed}-csp-${idx}`,
      type: "constraint",
      difficulty,
      premises,
      rules: constraints,
      question,
    },
    truth: {
      id: `logic-${seed}-csp-${idx}`,
      answer: assignment[selected[targetIdx]],
      reasoning: `By elimination: ${Object.entries(assignment).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      minimal_steps: n - 1,
    },
  };
}

export function generateLogicData(seed: number): LogicData {
  const rng = mulberry32(seed);

  const results: Array<{ puzzle: LogicPuzzle; truth: LogicGroundTruth["puzzles"][0] }> = [];

  // 6 puzzles: 3 propositional (easy/medium/hard), 3 constraint (easy/medium/hard)
  results.push(generatePropositionalPuzzle(seed, rng, 1, 0));
  results.push(generatePropositionalPuzzle(seed, rng, 3, 1));
  results.push(generatePropositionalPuzzle(seed, rng, 4, 2));
  results.push(generateConstraintPuzzle(seed, rng, 2, 0));
  results.push(generateConstraintPuzzle(seed, rng, 3, 1));
  results.push(generateConstraintPuzzle(seed, rng, 5, 2));

  const objective =
    "Solve all 6 logic puzzles. Three are propositional logic (modus ponens, chain reasoning, contrapositive). Three are constraint satisfaction (assign properties to entities under constraints). Submit your answer for each puzzle ID. Minimal reasoning steps earn higher scores.";

  return {
    puzzles: results.map((r) => r.puzzle),
    groundTruth: { puzzles: results.map((r) => r.truth) },
    objective,
  };
}
