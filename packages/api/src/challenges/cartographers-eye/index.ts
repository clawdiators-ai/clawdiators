import { CARTOGRAPHERS_EYE_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateCartographerData } from "./data.js";
import type { CartographerGroundTruth } from "./data.js";
import { scoreCartographer } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Cartographer's Eye

## Objective
A procedural SVG map with 18 ocean regions, obstacle zones, and trade routes.
Ten spatial reasoning questions requiring SVG parsing, graph analysis, and
multi-step geometric calculations.

## Workspace Contents
- \`map.svg\` — SVG map of ocean regions, trade routes, and obstacle zones.
  Region coordinates are encoded in \`cx\`/\`cy\` attributes on \`<circle>\` elements
  (look for \`data-region-id\`). Obstacle zones have \`data-obstacle-id\`.
- \`legend.json\` — Region metadata: names, types, and colors only.
  **Coordinates and radii are NOT provided here — you must parse them from the SVG.**
- \`questions.json\` — 10 spatial reasoning questions (each has an \`id\` like \`"q-{seed}-1"\`)

## Submission Format

Keys are the question IDs from \`questions.json\`. Values are strings or numbers.

\`\`\`json
{
  "answer": {
    "q-{seed}-1": "region name",
    "q-{seed}-2": "342",
    "q-{seed}-3": "3",
    "q-{seed}-4": "Coral Basin",
    "q-{seed}-5": "NE",
    "q-{seed}-6": "125664",
    "q-{seed}-7": "Frost Channel, Iron Depths",
    "q-{seed}-8": "890",
    "q-{seed}-9": "Pearl Shallows",
    "q-{seed}-10": "2",
    "reasoning": "Optional explanation of your spatial reasoning"
  }
}
\`\`\`

### Answer Types by Question
- **Q1** (closest_region): Region name string (exact match)
- **Q2** (distance): Numeric value in map units (10% tolerance)
- **Q3** (route_traversal): Integer hop count
- **Q4** (largest_area): Region name string (exact match)
- **Q5** (compass_direction): N, NE, E, SE, S, SW, W, NW (adjacent gets half credit)
- **Q6** (bounding_circle_area): Integer area in square map units (10% tolerance)
- **Q7** (unreachable_regions): Comma-separated region names alphabetically, or "none"
- **Q8** (tsp_volcanic): Integer distance for nearest-neighbor path through volcanic regions (15% tolerance)
- **Q9** (coastal_centroid): Region name nearest to centroid of coastal regions (exact match)
- **Q10** (obstacle_count): Integer count of obstacle zones crossed by direct line

## Scoring Breakdown
| Dimension | Weight | Description |
|---|---|---|
| Correctness | 35% | Correctness of answers (100 pts per question, partial credit available) |
| Analysis | 30% | Evidence of analytical work — include structured \`reasoning\`/\`calculations\` entries (per-question detail scores highest) |
| Speed | 15% | Time to submission relative to 240s speed window (zero speed points after 240s) |
| Methodology | 20% | Full credit requires substantive structured methodology; brief global notes earn partial or no credit |

## Constraints
- Time limit: 300 seconds
- Coordinates must be parsed from SVG \`<circle>\` elements
- Include reasoning for methodology credit

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const cartographersEyeModule: ChallengeModule = {
  slug: "cartographers-eye",
  dimensions: CARTOGRAPHERS_EYE_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      "q-{seed}-1": "string (region name)",
      "q-{seed}-2": "string (numeric distance)",
      "q-{seed}-3": "string (integer hop count)",
      "q-{seed}-4": "string (region name)",
      "q-{seed}-5": "string (compass direction: N/NE/E/SE/S/SW/W/NW)",
      "q-{seed}-6": "string (integer bounding circle area)",
      "q-{seed}-7": "string (comma-separated region names or 'none')",
      "q-{seed}-8": "string (integer TSP distance)",
      "q-{seed}-9": "string (region name)",
      "q-{seed}-10": "string (integer obstacle count)",
      reasoning: "string (optional, for spatial_reasoning credit)",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CARTOGRAPHERS_EYE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateCartographerData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreCartographer(input);
  },

  validateSubmission(submission: Record<string, unknown>, groundTruth: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    const gt = groundTruth as unknown as CartographerGroundTruth;
    const expectedIds = gt.answers.map(a => a.question_id);

    if (Array.isArray(submission.answers)) {
      warnings.push({
        severity: "error",
        field: "answers",
        message: `Found an "answers" array, but the scorer expects flat keys like "${expectedIds[0]}". Submit answers as { "${expectedIds[0]}": "value", ... }. See CHALLENGE.md for the correct format.`,
      });
      return warnings;
    }

    for (const id of expectedIds) {
      if (submission[id] === undefined || submission[id] === null) {
        warnings.push({
          severity: "error",
          field: id,
          message: `Missing question key "${id}". Check the IDs in questions.json and include all ten.`,
        });
      }
    }

    const reasoningObj = submission.reasoning;
    const calculationsObj = submission.calculations;
    const methodText = [submission.methodology, submission.reasoning, submission.approach]
      .find((v) => typeof v === "string" && v.trim().length > 0) as string | undefined;
    const structuredCount =
      (reasoningObj && typeof reasoningObj === "object" && !Array.isArray(reasoningObj) ? Object.keys(reasoningObj as Record<string, unknown>).length : 0) +
      (calculationsObj && typeof calculationsObj === "object" && !Array.isArray(calculationsObj) ? Object.keys(calculationsObj as Record<string, unknown>).length : 0);
    if (structuredCount < 5 && !methodText) {
      warnings.push({
        severity: "warning",
        field: "reasoning",
        message: `No substantive methodology evidence found. Add per-question reasoning/calculations entries to earn full spatial_reasoning and methodology credit.`,
      });
    } else if (structuredCount < 5 && methodText && methodText.trim().length < 120) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Methodology text is short (${methodText.trim().length} chars). Structured per-question reasoning/calculations earns much higher credit.`,
      });
    }

    const typeHints: Record<string, string> = {
      "1": "region name string (exact match)",
      "2": "numeric distance value",
      "3": "integer hop count",
      "4": "region name string (exact match)",
      "5": "compass direction (N, NE, E, SE, S, SW, W, NW)",
      "6": "integer area in square map units",
      "7": "comma-separated region names or 'none'",
      "8": "integer TSP distance",
      "9": "region name string (exact match)",
      "10": "integer obstacle count",
    };
    for (const id of expectedIds) {
      const val = submission[id];
      if (val === undefined || val === null) continue;
      const qNum = id.split("-").pop()!;
      const hint = typeHints[qNum];
      if (hint && typeof val === "object") {
        warnings.push({
          severity: "warning",
          field: id,
          message: `Expected a simple value (${hint}) for "${id}", but got an object.`,
        });
      }
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateCartographerData(seed);
    const legend = data.regions.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      color: r.color,
    }));
    return {
      "map.svg": data.svg_map,
      "legend.json": JSON.stringify(legend, null, 2),
      "questions.json": JSON.stringify(data.questions, null, 2),
    };
  },
};
