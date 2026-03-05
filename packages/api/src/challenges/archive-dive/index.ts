import { ARCHIVE_DIVE_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateArchiveData } from "./data.js";
import { scoreArchive } from "./scorer.js";
import type { ArchiveGroundTruth } from "./data.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Archive Dive

## Objective
A corpus of 16 historical documents spanning history, trade, and politics of underwater
cities. Documents include formal chronicles, personal journals, official reports,
scholarly analyses, and oral testimonies — representing both primary and secondary
sources. Some documents contain partially contradictory accounts of the same events,
and some events are referenced under different names across documents.

Ten cross-document synthesis questions require deep reading, cross-referencing,
contradiction detection, and source evaluation.

## Workspace Contents
- \`documents/\` — 16 multi-page text documents (named \`doc-{seed}-1.txt\` through \`doc-{seed}-16.txt\`)
- \`questions.json\` — 10 synthesis questions with IDs \`"q-{seed}-1"\` through \`"q-{seed}-10"\`

Each document header includes its source type (primary or secondary).

## Question Types
| Type | Description |
|------|-------------|
| comparison | Compare events across multiple documents |
| timeline | Order events chronologically from scattered sources |
| cause_effect | Trace causal chains across documents |
| entity_tracking | Track a figure's role across multiple documents |
| contradiction | Identify where documents disagree on facts |
| cross_reference | Find the same event referenced under different names |
| source_classification | Distinguish primary from secondary sources |
| synthesis | Combine information from 3+ documents |
| source_evaluation | Assess reliability of different source types |

## Submission Format

Use flat keys matching the question IDs from \`questions.json\`. Each answer is a
string value keyed by its question ID. Optionally include structured evidence
citations using \`_evidence\` suffixed keys.

\`\`\`json
{
  "answer": {
    "q-{seed}-1": "Your synthesis answer to question 1...",
    "q-{seed}-2": "Your synthesis answer to question 2...",
    "q-{seed}-1_evidence": [
      { "doc_id": "doc-{seed}-1", "page": 0 },
      { "doc_id": "doc-{seed}-3", "page": 2 }
    ]
  }
}
\`\`\`

Evidence arrays are optional but earn you points on the **comprehensiveness** and
**citations** dimensions. If you omit \`_evidence\` keys, the scorer will still give
partial credit if your answer text mentions document IDs (e.g. "doc-{seed}-1").

## Scoring Breakdown

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| **Correctness** | 45% | Word overlap + key-term coverage against ground truth answers |
| **Methodology** | 25% | Structured evidence citations (\`_evidence\` keys) or doc ID mentions |
| **Speed** | 15% | Time to submission relative to 420 s limit |
| **Analysis** | 15% | Quality and correctness of evidence citations (\`doc_id\` + page), with minor credit for unstructured doc mentions |

## Constraints
- Time limit: 420 seconds
- Include source document IDs for citation credit
`;

export const archiveDiveModule: ChallengeModule = {
  slug: "archive-dive",
  dimensions: ARCHIVE_DIVE_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      "q-{seed}-N": "string (answer text for each question)",
      "q-{seed}-N_evidence": "[{ doc_id: string, page: number }] (optional)",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: ARCHIVE_DIVE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateArchiveData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreArchive(input);
  },

  validateSubmission(submission: Record<string, unknown>, groundTruth: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    const gt = groundTruth as unknown as ArchiveGroundTruth;
    const expectedIds = gt.answers.map(a => a.question_id);

    // Detect old array-based format
    if (Array.isArray(submission.answers)) {
      warnings.push({
        severity: "error",
        field: "answers",
        message: `Found an "answers" array, but the scorer expects flat keys like "${expectedIds[0]}". See CHALLENGE.md for the correct format: { "${expectedIds[0]}": "answer text", "${expectedIds[0]}_evidence": [...], ... }.`,
      });
    }

    // Check for missing question ID keys
    const found = expectedIds.filter(id => submission[id] !== undefined);
    const missing = expectedIds.filter(id => submission[id] === undefined);
    if (found.length === 0) {
      warnings.push({
        severity: "error",
        field: "answer",
        message: `No question IDs found in submission. Expected keys like "${expectedIds[0]}", "${expectedIds[1]}", etc. Found keys: [${Object.keys(submission).join(", ")}].`,
      });
    } else if (missing.length > 0) {
      warnings.push({
        severity: "warning",
        field: "coverage",
        message: `Missing ${missing.length} of ${expectedIds.length} question IDs: ${missing.join(", ")}.`,
      });
    }

    // Suggest evidence keys for better scores
    const answeredWithoutEvidence = found.filter(id => !Array.isArray(submission[`${id}_evidence`]));
    if (answeredWithoutEvidence.length > 0 && found.length > 0) {
      warnings.push({
        severity: "warning",
        field: "evidence",
        message: `${answeredWithoutEvidence.length} answered question(s) have no "_evidence" key. Add "${found[0]}_evidence": [{ "doc_id": "...", "page": N }] for higher comprehensiveness and citations scores.`,
      });
    }

    // Check answer value types for common nesting mistakes
    for (const id of found) {
      const value = submission[id];
      if (value !== null && typeof value === "object") {
        warnings.push({
          severity: "error",
          field: id,
          message: `Value for "${id}" is an object, but expected a flat string answer. Submit plain text directly, e.g. "${id}": "your synthesis answer".`,
        });
      }
    }

    // Validate evidence shape when provided
    for (const id of found) {
      const evidenceKey = `${id}_evidence`;
      const evidence = submission[evidenceKey];
      if (evidence === undefined) continue;
      if (!Array.isArray(evidence)) {
        warnings.push({
          severity: "error",
          field: evidenceKey,
          message: `Value for "${evidenceKey}" must be an array like [{ "doc_id": "doc-...", "page": 0 }].`,
        });
        continue;
      }
      const badEvidenceItem = evidence.find((item) => {
        if (!item || typeof item !== "object") return true;
        const cite = item as Record<string, unknown>;
        return typeof cite.doc_id !== "string" || typeof cite.page !== "number";
      });
      if (badEvidenceItem !== undefined) {
        warnings.push({
          severity: "warning",
          field: evidenceKey,
          message: `Some items in "${evidenceKey}" are missing "doc_id" (string) or "page" (number). Invalid citations won't earn citation credit.`,
        });
      }
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateArchiveData(seed);
    const files: Record<string, string> = {};
    for (const doc of data.documents) {
      const content = doc.pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join("\n\n");
      const header = `# ${doc.title}\nAuthor: ${doc.author}\nSource Type: ${doc.sourceType}\n`;
      files[`documents/${doc.id}.txt`] = `${header}\n${content}`;
    }
    files["questions.json"] = JSON.stringify(data.questions, null, 2);
    return files;
  },
};
