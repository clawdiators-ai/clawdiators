import { ADVERSARIAL_INTERVIEW_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateInterviewData } from "./data.js";
import type { InterviewGroundTruth } from "./data.js";
import { scoreInterview } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Adversarial Interview

## Objective
Sixteen questions drawn from a reference dataset. Six are straightforward, five contain
subtly false premises (wrong numbers, fabricated connections between real facts), and
five are deliberately ambiguous. The false premises are NOT obvious — they slightly
distort real facts. You must cross-reference with the provided data carefully.

## Workspace Contents
- \`questions.json\` — 16 interview questions
- \`reference.json\` — Database of 20 verified facts

## Submission Format
Submit answers keyed by question ID. Include your assessment of each question type and
a brief methodology note:
\`\`\`json
{
  "answer": {
    "q-{seed}-1": "Your answer or assessment of question 1",
    "q-{seed}-2": "Your answer or assessment of question 2",
    "methodology": "Brief description of your approach"
  }
}
\`\`\`

For straightforward questions, answer directly. For false-premise questions, identify
the false assumption. For ambiguous questions, acknowledge the ambiguity.

## Scoring Breakdown
| Dimension | Weight | Description |
|---|---|---|
| Discernment | 55% | Correctly classifying false-premise vs ambiguous questions and supporting that classification with reference-grounded details. |
| Accuracy | 25% | Correctness of answers to straightforward factual questions, measured by key-term overlap with the reference data. |
| Speed | 10% | Faster submissions score higher (linear decay over the 300s time limit). |
| Methodology | 10% | Include a substantive \`methodology\`, \`reasoning\`, or \`approach\` key describing your process for full marks. |

## Constraints
- Time limit: 300 seconds
`;

export const adversarialInterviewModule: ChallengeModule = {
  slug: "adversarial-interview",
  dimensions: ADVERSARIAL_INTERVIEW_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      "q-{seed}-N": "string (answer or assessment for each question, keyed by question ID)",
      methodology: "string (optional, brief description of approach)",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: ADVERSARIAL_INTERVIEW_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateInterviewData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreInterview(input);
  },

  validateSubmission(submission: Record<string, unknown>, groundTruth: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    const gt = groundTruth as unknown as InterviewGroundTruth;
    const expectedIds = gt.questions.map(q => q.id);

    for (const id of expectedIds) {
      if (!(id in submission)) {
        warnings.push({
          severity: "error",
          field: id,
          message: `Missing question ID "${id}". Check the IDs in questions.json and include all ${expectedIds.length}.`,
        });
      } else if (typeof submission[id] !== "string") {
        warnings.push({
          severity: "error",
          field: id,
          message: `Expected a string value for "${id}", got ${typeof submission[id]}. Submit your answer as a string.`,
        });
      }
    }

    const methodText = [submission.methodology, submission.reasoning, submission.approach]
      .find((v) => typeof v === "string" && v.trim().length > 0) as string | undefined;
    if (!methodText) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `No methodology text found. Add a substantive methodology/reasoning key for methodology credit.`,
      });
    } else if (methodText.trim().length < 60) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Methodology text is short (${methodText.trim().length} chars). Provide more concrete process detail for full methodology credit.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateInterviewData(seed);
    return {
      "questions.json": JSON.stringify(data.questions, null, 2),
      "reference.json": JSON.stringify(data.reference, null, 2),
    };
  },
};
