import { CONTRACT_REVIEW_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateContractData } from "./data.js";
import { scoreContract } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Contract Review

## Objective
A 30-section fictional deep-sea trade contract with planted issues: inconsistencies,
undefined terms, contradictions, and missing cross-references. Find them all.

## Workspace Contents
- \`contract/\` — 30 section files (one per contract section)
- \`definitions.json\` — Defined terms and their meanings

## Submission Format
\`\`\`json
{
  "answer": {
    "issues": [
      {
        "section_ids": ["section-1", "section-5"],
        "type": "inconsistency|undefined_term|contradiction|missing_cross_reference|ambiguous_clause",
        "description": "explanation of the issue"
      }
    ]
  }
}
\`\`\`

### Field Details
- **section_ids** — Array of section IDs involved in the issue (e.g. \`["section-3"]\` or \`["section-3", "section-12"]\`). Use multiple IDs for issues that span sections (inconsistencies, contradictions).
- **type** — One of: \`inconsistency\`, \`undefined_term\`, \`contradiction\`, \`missing_cross_reference\`, \`ambiguous_clause\`.
- **description** — Free-text explanation of the issue found.

## Scoring Breakdown
| Dimension | Weight | How it's scored |
|-----------|--------|-----------------|
| Precision | 35% | Of the issues you report, how many match a ground-truth issue? (type + overlapping section_id) |
| Completeness | 35% | Of the ground-truth issues, how many did you find? |
| Speed | 15% | Linear decay from full marks at 0 s to zero at 480 s |
| Methodology | 15% | Include a \`methodology\`, \`reasoning\`, or \`approach\` key for full marks |

A match requires **same type** AND **at least one overlapping section_id**.

## Constraints
- Time limit: 480 seconds
- Review all 30 sections

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const contractReviewModule: ChallengeModule = {
  slug: "contract-review",
  dimensions: CONTRACT_REVIEW_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      issues: "[{ section_ids: string[], type: string, description: string }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CONTRACT_REVIEW_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateContractData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreContract(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    const VALID_TYPES = ["inconsistency", "undefined_term", "contradiction", "missing_cross_reference", "ambiguous_clause"];

    if (submission.issues === undefined || !Array.isArray(submission.issues)) {
      warnings.push({
        severity: "error",
        field: "issues",
        message: `Submission must contain an "issues" array. Found keys: [${Object.keys(submission).join(", ")}].`,
      });
      return warnings;
    }

    const issues = submission.issues as Record<string, unknown>[];
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];

      // Check for section (string) instead of section_ids (array)
      if (issue.section !== undefined && issue.section_ids === undefined) {
        warnings.push({
          severity: "error",
          field: `issues[${i}].section`,
          message: `Found "section" (a string) but the scorer expects "section_ids" (an array of strings). Use "section_ids": ["${issue.section}"] instead.`,
        });
      } else if (issue.section_ids === undefined || !Array.isArray(issue.section_ids)) {
        warnings.push({
          severity: "error",
          field: `issues[${i}].section_ids`,
          message: `Each issue must have a "section_ids" array (e.g. ["section-1"]). Got: ${JSON.stringify(issue.section_ids)}.`,
        });
      }

      // Check for invalid type values
      if (typeof issue.type === "string" && !VALID_TYPES.includes(issue.type)) {
        warnings.push({
          severity: "error",
          field: `issues[${i}].type`,
          message: `Invalid type "${issue.type}". Valid values: ${VALID_TYPES.join(", ")}.`,
        });
      }
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateContractData(seed);
    const files: Record<string, string> = {};
    for (const section of data.sections) {
      const s = section as { id: string; title: string; clauses: string[] };
      const content = s.clauses.map((c, i) => `${i + 1}. ${c}`).join("\n\n");
      files[`contract/${s.id}.txt`] = `# ${s.title}\n\n${content}`;
    }
    files["definitions.json"] = JSON.stringify(data.definitions, null, 2);
    return files;
  },
};
