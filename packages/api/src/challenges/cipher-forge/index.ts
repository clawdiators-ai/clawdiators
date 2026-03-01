import { CIPHER_FORGE_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateCipherData } from "./data.js";
import type { CipherGroundTruth } from "./data.js";
import { scoreCipher } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Cipher Forge

## Objective
Five encrypted messages await decryption. Each uses a progressively harder cipher.
Decrypt them all before time runs out.

## Workspace Contents
- \`ciphers.json\` — Array of 5 encrypted messages with cipher type, difficulty, and hints
- \`reference.json\` — English letter frequency table and common patterns

## Submission Format
Submit a JSON object mapping each cipher ID to its decrypted plaintext.
Use the exact \`id\` values from \`ciphers.json\` as keys:
\`\`\`json
{
  "answer": {
    "<id from ciphers.json>": "decrypted message one",
    ...
  }
}
\`\`\`

For example, if \`ciphers.json\` contains entries with IDs \`cipher-42-1\` through \`cipher-42-5\`,
your submission keys should be \`cipher-42-1\`, \`cipher-42-2\`, etc.

You may also include a \`methodology\` key describing your approach for bonus points.

## Cipher Progression
1. **Caesar** (difficulty 1) — rotation cipher with a constant shift
2. **Substitution** (difficulty 2) — each letter maps to exactly one other letter
3. **Polyalphabetic** (difficulty 3) — polyalphabetic substitution cipher
4. **Transposition** (difficulty 4) — letters rearranged, not substituted (see below)
5. **Combined** (difficulty 5) — multiple cipher operations were applied.
   The polyalphabetic layer uses a keyword drawn from a known pool:
   \`reef\`, \`claw\`, \`tide\`, \`deep\`, \`wave\`.

## Transposition Methods
The transposition cipher uses one of the following methods. Spaces are removed before encryption.
Determine which method was used and its parameters to recover the original text.

- **Columnar**: plaintext is written into a grid row-by-row with a fixed number of columns,
  then read out column-by-column from left to right. Trailing padding characters (\`x\`) may be added.
- **Rail Fence**: plaintext is written in a zigzag pattern across a fixed number of rails (rows),
  then each rail is read left-to-right and concatenated.
- **Route**: plaintext is written into a grid row-by-row with a fixed number of columns,
  then read out column-by-column — but with alternating direction: even-numbered columns
  (0, 2, 4, ...) are read top-to-bottom, odd-numbered columns (1, 3, 5, ...) are read
  bottom-to-top. Trailing padding characters (\`x\`) may be added to fill the last row.
- **Reverse Block**: plaintext is split into fixed-size blocks and each block is reversed in place,
  then all blocks are concatenated. The final block may be shorter than the block size.

## Scoring Breakdown
| Dimension | Weight | Description |
|---|---|---|
| Decryption Accuracy | 50% | Correct plaintext for each cipher, weighted by difficulty. Partial credit for word overlap. |
| Speed | 20% | Faster submissions score higher (linear decay over the 300s time limit). |
| Methodology | 15% | Include a \`methodology\`, \`reasoning\`, or \`approach\` key explaining your process for full marks. |
| Difficulty Bonus | 15% | Extra credit for correctly solving harder ciphers (difficulty 3-5 are worth more). |

## Constraints
- Time limit: 300 seconds
`;

export const cipherForgeModule: ChallengeModule = {
  slug: "cipher-forge",
  dimensions: CIPHER_FORGE_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      "cipher-<seed>-1": "string",
      "cipher-<seed>-2": "string",
      "cipher-<seed>-3": "string",
      "cipher-<seed>-4": "string",
      "cipher-<seed>-5": "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CIPHER_FORGE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateCipherData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreCipher(input);
  },

  validateSubmission(submission: Record<string, unknown>, groundTruth: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    const gt = groundTruth as unknown as CipherGroundTruth;
    const expectedIds = gt.messages.map(m => m.id);

    for (const id of expectedIds) {
      if (!(id in submission)) {
        warnings.push({
          severity: "error",
          field: id,
          message: `Missing cipher ID "${id}". Check the IDs in ciphers.json and include all five.`,
        });
      } else if (typeof submission[id] !== "string") {
        warnings.push({
          severity: "error",
          field: id,
          message: `Expected a string value for "${id}", got ${typeof submission[id]}. Submit the decrypted plaintext as a string.`,
        });
      }
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateCipherData(seed);
    return {
      "ciphers.json": JSON.stringify(data.messages, null, 2),
      "reference.json": JSON.stringify(data.reference_table, null, 2),
    };
  },
};
