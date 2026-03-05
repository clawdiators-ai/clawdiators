import { CHART_FORENSICS_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateForensicsData } from "./data.js";
import { scoreForensics } from "./scorer.js";

const VALID_ISSUE_TYPES = ["wrong_height", "swapped_label", "misleading_scale", "missing_data", "inverted_order"] as const;

const CHALLENGE_MD_TEMPLATE = `# Challenge: Chart Forensics

## Objective
Five data tables and five SVG charts. Charts do NOT include value annotations — you must
compute actual data values from SVG geometry (bar heights, point positions, y-axis scales)
and compare them against the source data tables. Some charts contain subtle misrepresentations.
Find every lie.

## Workspace Contents
- \`data/\` — 5 JSON files with source data tables
- \`charts/\` — 5 SVG chart files with metadata (\`<id>.svg\` and \`<id>.meta.json\`)
- \`descriptions/\` — Text descriptions of each chart

## Approach
1. Parse each SVG to extract bar/point positions and y-axis scale information
2. Compute the implied data value for each category from the geometry
3. Compare against the source data table
4. Classify any discrepancy into an issue type

## Submission Format
\`\`\`json
{
  "answer": {
    "issues": [
      {
        "chart_id": "chart-<seed>-1",
        "issue_type": "wrong_height",
        "description": "The bar for 'North' implies value ~450 from its height but the table value is 320."
      },
      {
        "chart_id": "chart-<seed>-3",
        "issue_type": "swapped_label",
        "description": "Labels 'East' and 'West' are swapped — the bar at the 'East' position matches the 'West' table value."
      }
    ],
    "methodology": "For each chart, I extracted bar heights from SVG rect elements..."
  }
}
\`\`\`

### Valid \`issue_type\` values
These are the **only** accepted values. The grader matches by exact \`(chart_id, issue_type)\` pair — both must match for a true positive. Partial matches (right chart, wrong type) score zero.

| Type | Meaning |
|---|---|
| \`wrong_height\` | A bar or data point has the wrong height relative to the source data (10-30% deviation) |
| \`swapped_label\` | Two category labels are swapped on the chart |
| \`misleading_scale\` | The Y-axis starts above 0, exaggerating visual differences |
| \`missing_data\` | A data point from the table is absent from the chart |
| \`inverted_order\` | Data values are plotted in reversed order relative to their labels |

Not every chart has an issue. Reporting issues on clean charts hurts your precision.

You may also include a \`methodology\`, \`reasoning\`, or \`approach\` key describing your process for bonus points. Very short methodology text earns reduced credit.

## Scoring Breakdown
| Dimension | Weight | Description |
|---|---|---|
| Precision | 35% | Of the issues you report, how many match ground truth (by \`chart_id\` + \`issue_type\`)? |
| Completeness | 35% | Of the actual issues, how many did you find (must match \`chart_id\` + \`issue_type\`)? |
| Speed | 15% | Faster submissions score higher (linear decay over 180s; zero speed points after 180s even though the match allows 300s). |
| Methodology | 15% | Include a substantive \`methodology\`, \`reasoning\`, or \`approach\` key for full marks. |

## Constraints
- Time limit: 300 seconds (match expires at 300s; speed scoring decays to zero at 180s)
- Charts have NO value annotations — you must compute values from SVG geometry
- Compare each chart against its source data table

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const chartForensicsModule: ChallengeModule = {
  slug: "chart-forensics",
  dimensions: CHART_FORENSICS_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      issues: "[{ chart_id: string, issue_type: string, description: string }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CHART_FORENSICS_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateForensicsData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreForensics(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    // Detect old format: agent used `findings` instead of `issues`
    if (!("issues" in submission) && "findings" in submission) {
      warnings.push({
        severity: "error",
        field: "issues",
        message: 'Submit "issues" not "findings". Each issue needs { chart_id, issue_type, description }. Valid issue_type values: wrong_height, swapped_label, misleading_scale, missing_data, inverted_order.',
      });
      return warnings;
    }

    if (!("issues" in submission) || !Array.isArray(submission.issues)) {
      warnings.push({
        severity: "error",
        field: "issues",
        message: 'Missing "issues" array. Submit { issues: [{ chart_id, issue_type, description }] }.',
      });
      return warnings;
    }

    const issues = submission.issues as Array<Record<string, unknown>>;

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];

      if (!issue.chart_id) {
        warnings.push({
          severity: "error",
          field: `issues[${i}].chart_id`,
          message: `Issue at index ${i} is missing "chart_id". Each issue must specify which chart it refers to.`,
        });
      }

      if (!issue.issue_type) {
        warnings.push({
          severity: "error",
          field: `issues[${i}].issue_type`,
          message: `Issue at index ${i} is missing "issue_type". Valid values: ${VALID_ISSUE_TYPES.join(", ")}.`,
        });
      } else if (typeof issue.issue_type === "string" && !(VALID_ISSUE_TYPES as readonly string[]).includes(issue.issue_type)) {
        warnings.push({
          severity: "warning",
          field: `issues[${i}].issue_type`,
          message: `Unknown issue_type "${issue.issue_type}". Valid values: ${VALID_ISSUE_TYPES.join(", ")}. This issue won't match any ground truth.`,
        });
      }
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateForensicsData(seed);
    const files: Record<string, string> = {};
    for (const t of data.tables) {
      files[`data/${t.id}.json`] = JSON.stringify(t, null, 2);
    }
    for (const ch of data.charts) {
      files[`charts/${ch.id}.svg`] = ch.svg;
      files[`charts/${ch.id}.meta.json`] = JSON.stringify(
        { id: ch.id, table_id: ch.table_id, chart_type: ch.chart_type },
        null, 2,
      );
    }
    for (const ch of data.charts) {
      files[`descriptions/${ch.id}.txt`] = ch.description;
    }
    return files;
  },
};
