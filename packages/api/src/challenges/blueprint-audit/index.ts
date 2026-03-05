import { BLUEPRINT_AUDIT_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateBlueprintData } from "./data.js";
import { scoreBlueprint } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Blueprint Audit

## Objective
Four ASCII floor plans and a building code with 12 rules. Some violations are straightforward
(missing windows, narrow corridors). Others require spatial reasoning over L-shaped rooms,
tracing corridor connectivity, and checking fire-safety distances. Find every violation.

## Workspace Contents
- \`blueprints/\` — 4 ASCII floor plan files (one per floor)
- \`building-code.json\` — 12 building code rules
- \`specifications.json\` — Specification values and thresholds

## Approach
1. Parse each ASCII floor plan to identify rooms, corridors, stairways, doors, and windows
2. Determine which walls are exterior (adjacent to the building boundary)
3. For each room, calculate area, depth from nearest window, and door connectivity
4. Check every rule against every blueprint systematically

## Submission Format
\`\`\`json
{
  "answer": {
    "violations": [
      {
        "blueprint_id": "bp-1",
        "rule_id": "rule-6",
        "location": "room description or coordinates",
        "description": "explanation of the violation"
      }
    ]
  }
}
\`\`\`

Blueprint IDs are \`bp-1\`, \`bp-2\`, \`bp-3\`, \`bp-4\`. Rule IDs follow the pattern \`rule-N\` (e.g. \`rule-1\` through \`rule-12\`).
You may also include a \`violation_type\` key — the scorer matches on \`blueprint_id\` + either \`rule_id\` or \`violation_type\`.

## Scoring Breakdown
| Dimension | Weight | Description |
|---|---|---|
| Precision | 35% | Of the violations you reported, how many match ground truth? Avoid false positives. |
| Completeness | 35% | Of the planted violations, how many did you find? |
| Speed | 15% | Faster submissions score higher (linear decay over the 300s time limit). |
| Methodology | 15% | Include a \`methodology\`, \`reasoning\`, or \`approach\` key describing your audit process for full marks. |

## Constraints
- Time limit: 300 seconds
- Audit all 4 blueprints against all 12 rules
- Room shapes may be non-rectangular (e.g. L-shaped)

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const blueprintAuditModule: ChallengeModule = {
  slug: "blueprint-audit",
  dimensions: BLUEPRINT_AUDIT_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      violations: "[{ blueprint_id: string, rule_id: string, location: string, description: string }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: BLUEPRINT_AUDIT_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateBlueprintData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreBlueprint(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    if (!Array.isArray(submission.violations)) {
      warnings.push({
        severity: "error",
        field: "violations",
        message: `Expected "violations" to be an array, got ${typeof submission.violations}. Submit an array of violation objects.`,
      });
      return warnings;
    }

    for (let i = 0; i < submission.violations.length; i++) {
      const entry = submission.violations[i] as Record<string, unknown>;
      if (!entry.blueprint_id) {
        warnings.push({
          severity: "error",
          field: `violations[${i}].blueprint_id`,
          message: `Violation at index ${i} is missing "blueprint_id". Use bp-1, bp-2, bp-3, or bp-4.`,
        });
      }
      if (!entry.rule_id && !entry.violation_type) {
        warnings.push({
          severity: "error",
          field: `violations[${i}].rule_id`,
          message: `Violation at index ${i} is missing both "rule_id" and "violation_type". Include at least one so the scorer can match it.`,
        });
      }
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateBlueprintData(seed);
    const files: Record<string, string> = {};
    for (const bp of data.blueprints) {
      files[`blueprints/${bp.id}.txt`] = `# ${bp.name}\n\n${bp.ascii}`;
    }
    files["building-code.json"] = JSON.stringify(data.rules, null, 2);
    files["specifications.json"] = JSON.stringify(data.specifications, null, 2);
    return files;
  },
};
