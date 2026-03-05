import { DEPTH_FIRST_GEN_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateDepthFirstData } from "./data.js";
import { scoreDepthFirst } from "./scorer.js";
import type { DepthFirstGroundTruth } from "./data.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: Depth-First Generation

## Objective
You are given 6 worked examples showing an input-output transformation. The rule
is NOT described — you must infer it purely from the examples. The transformation
may involve multiple steps, position-dependent operations, conditional logic, or
structural changes (grids, records). Carefully examine ALL examples before
forming a hypothesis, as naive single-example interpretations will likely fail.

## Workspace Contents
- \`spec.json\` — Task category and 6 worked examples showing input → output
- \`test-inputs.json\` — 30 test inputs (each has an \`id\` and \`input\` field)

## Submission Format
Submit a JSON object mapping each **test ID** to its computed output:
\`\`\`json
{
  "answer": {
    "test-{seed}-0": <output for test 0>,
    "test-{seed}-1": <output for test 1>,
    ...
    "test-{seed}-29": <output for test 29>,
    "methodology": "Description of the rule you inferred and how you applied it"
  }
}
\`\`\`

Use the exact test IDs from \`test-inputs.json\`. Each output should match the
type shown in the examples (string, number, array, etc.).

## Scoring
| Dimension | Weight | Description |
|---|---|---|
| Correctness | 70% | Fraction of test outputs that exactly match |
| Speed | 15% | Faster submissions score higher (linear decay over 180s; zero speed points after 180s) |
| Completeness | 5% | Fraction of test cases you attempted |
| Methodology | 10% | Include a substantive \`methodology\` key describing the inferred rule |

## Constraints
- Time limit: 300 seconds
`;

export const depthFirstGenModule: ChallengeModule = {
  slug: "depth-first-gen",
  dimensions: DEPTH_FIRST_GEN_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      "test-{seed}-N": "output value (string, number, or array — matching example type)",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: DEPTH_FIRST_GEN_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateDepthFirstData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreDepthFirst(input);
  },

  validateSubmission(submission: Record<string, unknown>, groundTruth: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    const gt = groundTruth as unknown as DepthFirstGroundTruth;
    const expectedIds = gt.test_outputs.map(t => t.id);

    // Check for the common mistake: using { outputs: [...] } instead of { test_id: output }
    if (submission.outputs !== undefined && Array.isArray(submission.outputs)) {
      warnings.push({
        severity: "error",
        field: "outputs",
        message: `Found an "outputs" array, but the scorer expects individual keys like "${expectedIds[0]}". See CHALLENGE.md for the correct format: { "${expectedIds[0]}": <output>, "${expectedIds[1]}": <output>, ... }.`,
      });
    }

    // Check for missing test IDs
    const found = expectedIds.filter(id => submission[id] !== undefined);
    const missing = expectedIds.filter(id => submission[id] === undefined);
    if (missing.length > 0 && found.length === 0) {
      warnings.push({
        severity: "error",
        field: "answer",
        message: `No expected test IDs found in submission. Expected keys like "${expectedIds[0]}", "${expectedIds[1]}", etc. Found keys: [${Object.keys(submission).filter(k => k !== "methodology").join(", ")}].`,
      });
    } else if (missing.length > 0) {
      warnings.push({
        severity: "warning",
        field: "coverage",
        message: `Missing ${missing.length} of ${expectedIds.length} test IDs: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}.`,
      });
    }

    const methodText = [submission.methodology, submission.reasoning, submission.approach]
      .find((v) => typeof v === "string" && v.trim().length > 0) as string | undefined;
    if (!methodText) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `No methodology text found. Add a substantive "methodology" string to earn methodology points.`,
      });
    } else if (methodText.trim().length < 40) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Methodology text is very short (${methodText.trim().length} chars). Provide a concrete rule description for full methodology credit.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateDepthFirstData(seed);
    const specForAgent = {
      task_type: data.spec.task_type,
      examples: data.spec.examples,
    };
    return {
      "spec.json": JSON.stringify(specForAgent, null, 2),
      "test-inputs.json": JSON.stringify(data.test_inputs, null, 2),
    };
  },
};
