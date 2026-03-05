import { CODEBASE_ARCHAEOLOGY_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateArchaeologyData } from "./data.js";
import { scoreArchaeology } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: Codebase Archaeology

## Objective
A regression was reported in a multi-file TypeScript codebase. A function is
producing incorrect results and the test suite has failing tests. The bug was
introduced in a recent commit, but **no diffs are available** — you must read
the source code and tests to identify and fix the regression.

## Your Task
1. Review the commit history in COMMIT_HISTORY.md and GIT_LOG.txt
2. Identify which commits touched the buggy file (multiple commits may have)
3. Read the source code carefully — the bug is subtle (boundary condition, missing logic, etc.)
4. Cross-reference with the test file to understand expected behavior
5. Identify the buggy commit, explain the root cause, and write the fix

## Workspace Contents
- \`src/\` — Multi-file application source (the buggy function calls/imports other modules)
- \`tests/\` — Test suite with failing tests that demonstrate the regression
- \`GIT_LOG.txt\` — Full git log with file lists per commit
- \`COMMIT_HISTORY.md\` — Commit history highlighting which commits modified the buggy file

## Submission Format
\`\`\`json
{
  "answer": {
    "buggy_commit": "commit message that introduced the bug",
    "bug_description": "precise explanation of the root cause",
    "fixed_code": "the corrected function (full body with export keyword)",
    "methodology": "how you identified and fixed the bug"
  }
}
\`\`\`

## Scoring
| Dimension | Weight | Description |
|---|---|---|
| Correctness | 35% | Correctly identifying the buggy commit and root cause |
| Code Quality | 30% | Correctness of the code fix |
| Speed | 15% | Time to submission relative to 600s limit |
| Methodology | 20% | Structured debugging approach |

## Constraints
- Time limit: 600 seconds
- No diffs available — read the code

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const codebaseArchaeologyModule: ChallengeModule = {
  slug: "codebase-archaeology",
  dimensions: CODEBASE_ARCHAEOLOGY_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      buggy_commit: "string",
      bug_description: "string",
      fixed_code: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CODEBASE_ARCHAEOLOGY_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateArchaeologyData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreArchaeology(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    if (!submission.buggy_commit && !submission.commit) {
      warnings.push({
        severity: "error",
        field: "buggy_commit",
        message: `Missing "buggy_commit" key. Submit the commit message (as shown in GIT_LOG.txt) that introduced the bug.`,
      });
    } else if (typeof (submission.buggy_commit ?? submission.commit) !== "string") {
      warnings.push({
        severity: "error",
        field: "buggy_commit",
        message: `Expected a string value for "buggy_commit", got ${typeof (submission.buggy_commit ?? submission.commit)}. Submit the commit message as a string.`,
      });
    }

    if (!submission.bug_description && !submission.root_cause) {
      warnings.push({
        severity: "error",
        field: "bug_description",
        message: `Missing "bug_description" key. Describe what the bug is and why it causes incorrect results.`,
      });
    }

    if (!submission.fixed_code && !submission.fix) {
      warnings.push({
        severity: "error",
        field: "fixed_code",
        message: `Missing "fixed_code" key. Submit the corrected function body including the export keyword.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateArchaeologyData(seed);
    return data.files;
  },
};
