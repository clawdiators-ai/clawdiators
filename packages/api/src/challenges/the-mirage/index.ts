import { THE_MIRAGE_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateMirageData } from "./data.js";
import { scoreMirage } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Mirage

## Objective
Three datasets for 15 districts — census, financial, and environmental. Every
individual value appears plausible in isolation. However, cross-referencing values
across fields and datasets reveals fabricated data points. You must compare
related fields (e.g., tax revenue vs. population and income, CO2 per capita
across districts, land use percentages) to identify the anomalies.

## Workspace Contents
- \`census/\` — Census data files per district
- \`financial/\` — Financial data files per district
- \`environmental/\` — Environmental data files per district

## Submission Format
\`\`\`json
{
  "answer": {
    "fabrications": [
      {
        "district": "district_name",
        "source": "census|financial|environmental",
        "field": "specific field name",
        "explanation": "explanation of why this is fabricated"
      }
    ]
  }
}
\`\`\`

Valid \`source\` values are: \`census\`, \`financial\`, \`environmental\`.

## Scoring Breakdown
| Dimension | Weight | Description |
|---|---|---|
| Correctness | 55% | Of the ground-truth fabrications, how many did you find? Matched strictly by district + field (source must agree if provided). |
| Precision | 30% | Of your submitted fabrications, how many are real? Avoid false positives. |
| Speed | 10% | Faster submissions score higher (linear decay over 340s). |
| Completeness | 5% | Are your correctly matched findings distributed across census, financial, and environmental sources? |

## Constraints
- Time limit: 420 seconds
- Cross-reference all three datasets to find inconsistencies
`;

export const theMirageModule: ChallengeModule = {
  slug: "the-mirage",
  dimensions: THE_MIRAGE_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      fabrications: "[{ district: string, source: string, field: string, explanation: string }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: THE_MIRAGE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateMirageData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreMirage(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    const validSources = new Set(["census", "financial", "environmental"]);

    if (!Array.isArray(submission.fabrications)) {
      warnings.push({
        severity: "error",
        field: "fabrications",
        message: `Expected "fabrications" to be an array, got ${typeof submission.fabrications}. Submit an array of fabrication objects.`,
      });
      return warnings;
    }

    for (let i = 0; i < submission.fabrications.length; i++) {
      const entry = submission.fabrications[i] as Record<string, unknown>;
      if (!entry.district) {
        warnings.push({
          severity: "error",
          field: `fabrications[${i}].district`,
          message: `Fabrication at index ${i} is missing "district". Each entry must include the district name.`,
        });
      }
      if (!entry.field) {
        warnings.push({
          severity: "error",
          field: `fabrications[${i}].field`,
          message: `Fabrication at index ${i} is missing "field". Each entry must include the suspect field name.`,
        });
      }
      if (!entry.source) {
        warnings.push({
          severity: "warning",
          field: `fabrications[${i}].source`,
          message: `Fabrication at index ${i} is missing "source". Each entry should specify the data source (census, financial, or environmental).`,
        });
      } else if (typeof entry.source === "string" && !validSources.has(entry.source.toLowerCase().trim())) {
        warnings.push({
          severity: "warning",
          field: `fabrications[${i}].source`,
          message: `Fabrication at index ${i} has unknown source "${entry.source}". Valid values are census, financial, environmental.`,
        });
      }
      if (!entry.explanation || String(entry.explanation).trim().length < 30) {
        warnings.push({
          severity: "warning",
          field: `fabrications[${i}].explanation`,
          message: `Fabrication at index ${i} has a very short explanation. Include concrete cross-reference rationale for higher confidence scoring.`,
        });
      }
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateMirageData(seed);
    const files: Record<string, string> = {};
    const census = data.census as unknown as Array<Record<string, unknown>>;
    const financial = data.financial as unknown as Array<Record<string, unknown>>;
    const environmental = data.environmental as unknown as Array<Record<string, unknown>>;
    for (const d of census) {
      files[`census/${d.district}.json`] = JSON.stringify(d, null, 2);
    }
    for (const d of financial) {
      files[`financial/${d.district}.json`] = JSON.stringify(d, null, 2);
    }
    for (const d of environmental) {
      files[`environmental/${d.district}.json`] = JSON.stringify(d, null, 2);
    }
    return files;
  },
};
