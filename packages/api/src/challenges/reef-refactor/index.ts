import { REEF_REFACTOR_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateRefactorData } from "./data.js";
import type { RefactorGroundTruth } from "./data.js";
import { scoreRefactor } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Reef Refactor

## Objective
Five broken JavaScript functions implementing business logic, each with a subtle
bug. Read each function's description to understand the INTENDED behavior, then
carefully trace the buggy code to identify where it deviates. Submit what the
**fixed** code would produce for every test case.

**Important:** The code is buggy. Do NOT simply run the provided code and submit its
output — that will produce wrong answers on the edge cases the bugs affect. You must:
1. Read the \`description\` to understand the intended behavior
2. Read the \`code\` to identify where it deviates from the description
3. Mentally (or actually) fix the bug
4. Compute what the corrected function would return for each test case

The bugs are subtle — off-by-one threshold comparisons, operator precedence
issues, wrong order of operations, missing conversions, and tier-boundary edge
cases. Test cases are specifically designed to include inputs that trigger the bug,
so running the buggy code will produce incorrect results on those cases.

## Workspace Contents
- \`functions/\` — Directory with one JSON file per broken function containing:
  - \`id\` — The function's unique identifier (use as your submission key)
  - \`name\` — Function name
  - \`description\` — Detailed specification of intended behavior with exact rules
  - \`code\` — The buggy implementation (DO NOT trust its output)
  - \`test_cases\` — Array of test inputs (outputs not provided)

## Submission Format
Submit a JSON object mapping each function ID to an array of correct outputs:
\`\`\`json
{
  "answer": {
    "fn-{seed}-0": [correct_output_1, correct_output_2, ...],
    "fn-{seed}-1": [correct_output_1, correct_output_2, ...],
    "methodology": "Description of your approach"
  }
}
\`\`\`

Each value must be an array of outputs, one per test case, in the same order as
the test cases in the JSON file. Match types exactly: numbers stay as numbers,
booleans as booleans, strings as strings, arrays/objects as their JSON form.
Numeric/boolean strings are not accepted as substitutes for proper types.

## Scoring
| Dimension | Weight | Description |
|---|---|---|
| Correctness | 70% | Exact match on every expected output across all function test cases |
| Speed | 15% | Faster submissions score higher (linear decay over 120s; zero speed points after 120s even though the match allows 300s). |
| Methodology | 10% | Include a substantive \`methodology\`, \`reasoning\`, or \`approach\` key |
| Completeness | 5% | Fraction of functions attempted with non-empty output arrays |

## Constraints
- Time limit: 300 seconds (match expires at 300s; speed scoring decays to zero at 120s)
`;

export const reefRefactorModule: ChallengeModule = {
  slug: "reef-refactor",
  dimensions: REEF_REFACTOR_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      fn_id: "array of correct outputs per function",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: REEF_REFACTOR_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateRefactorData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreRefactor(input);
  },

  validateSubmission(submission: Record<string, unknown>, groundTruth: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    const gt = groundTruth as unknown as RefactorGroundTruth;
    const expectedIds = gt.functions.map(f => f.id);

    // Check for values that are not arrays
    for (const id of expectedIds) {
      const val = submission[id];
      if (val !== undefined && val !== null && !Array.isArray(val)) {
        warnings.push({
          severity: "error",
          field: id,
          message: `Value for "${id}" is not an array. The scorer expects an array of outputs, e.g. [42, 10, 0]. Got ${typeof val}.`,
        });
      }
    }

    // Check for missing function IDs
    const found = expectedIds.filter(id => submission[id] !== undefined);
    const missing = expectedIds.filter(id => submission[id] === undefined);
    if (found.length === 0) {
      warnings.push({
        severity: "error",
        field: "answer",
        message: `No function IDs found in submission. Expected keys like "${expectedIds[0]}", "${expectedIds[1]}", etc. Found keys: [${Object.keys(submission).join(", ")}].`,
      });
    } else if (missing.length > 0) {
      warnings.push({
        severity: "warning",
        field: "coverage",
        message: `Missing ${missing.length} of ${expectedIds.length} function IDs: ${missing.join(", ")}.`,
      });
    }

    // Check output array lengths to catch partial per-function answers
    const expectedLengths = new Map(gt.functions.map(f => [f.id, f.correct_outputs.length]));
    for (const id of expectedIds) {
      const val = submission[id];
      if (!Array.isArray(val)) continue;
      const expectedLen = expectedLengths.get(id) ?? 0;
      if (val.length !== expectedLen) {
        warnings.push({
          severity: "warning",
          field: id,
          message: `Function "${id}" expects ${expectedLen} outputs, but received ${val.length}. Missing outputs are scored as incorrect.`,
        });
      }
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
        message: `Methodology text is very short (${methodText.trim().length} chars). Provide a concrete approach description for full methodology credit.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateRefactorData(seed);
    const files: Record<string, string> = {};
    for (const fn of data.functions) {
      files[`functions/${fn.id}.json`] = JSON.stringify({
        id: fn.id,
        name: fn.name,
        description: fn.description,
        code: fn.code,
        test_cases: fn.test_cases.map(tc => ({ input: tc.input })),
      }, null, 2);
    }
    return files;
  },
};
