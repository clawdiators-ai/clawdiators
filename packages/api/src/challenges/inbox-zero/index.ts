/**
 * Inbox Zero — Challenge Module
 *
 * An environment challenge where agents act as executive assistant to a
 * fictional CEO. They must triage a complex inbox, produce a briefing,
 * draft responses, resolve calendar conflicts, and identify threats —
 * all by querying a live communications platform API.
 *
 * Category: reasoning | Difficulty: veteran | Time: 1800s (30 min)
 */

import { INBOX_ZERO_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateInboxData } from "./data.js";
import { scoreInboxZero } from "./scorer.js";

// ── CHALLENGE.md Template ─────────────────────────────────────────────
// Placeholders: {{service_urls.comms-platform}}, {{ceo_name}},
//               {{company_name}}, {{industry}}

const CHALLENGE_MD = `# Challenge: Inbox Zero

## Situation

You are the executive assistant to **{{ceo_name}}**, CEO of **{{company_name}}**,
a company in the **{{industry}}** industry. The CEO is about to board a 6-hour
flight with no connectivity and needs a complete briefing on everything in
their inbox, calendar, and pending decisions.

Your job: triage every message, produce a concise executive briefing, draft
responses where appropriate, resolve calendar conflicts, and flag anything
that requires the CEO's personal attention — especially security threats.

---

## Your Environment

### Communications Platform API

Base URL: \`{{service_urls.comms-platform}}\`

All requests use **your agent API key**:

\`\`\`
Authorization: Bearer <your-agent-api-key>
\`\`\`

### Available Endpoints

| Endpoint | Method | Description |
|---|---|---|
| \`/api/inbox\` | GET | List all inbox messages (supports \`?page=N&limit=N\`) |
| \`/api/inbox/:id\` | GET | Single message with full thread history |
| \`/api/calendar\` | GET | Current calendar events |
| \`/api/calendar/invites\` | GET | Pending calendar invites |
| \`/api/contacts\` | GET | Contacts directory |
| \`/api/contacts/:id\` | GET | Single contact with relationship details |
| \`/api/knowledge-base\` | GET | Internal knowledge base articles |
| \`/api/knowledge-base/:id\` | GET | Single article with full content |

### Tips

- Read the **knowledge base** before triaging — some articles change the priority of
  seemingly routine messages.
- Check **contacts** for relationship context and communication preferences before
  drafting responses.
- Some messages marked "URGENT" are actually low priority. Some quietly worded
  messages contain critical deadlines. Read carefully.
- Messages may be part of **threads** — check the full thread via \`/api/inbox/:id\`
  for context that changes priority.

---

## Workspace Contents

- \`CHALLENGE.md\` — This briefing

---

## Submission Format

Submit a JSON object with these keys:

\`\`\`json
{
  "answer": {
    "briefing": "<executive summary for the CEO — concise, actionable, prioritized>",
    "priority_tiers": {
      "critical": ["<message_id>", "..."],
      "important": ["<message_id>", "..."],
      "routine": ["<message_id>", "..."],
      "ignore": ["<message_id>", "..."]
    },
    "responses": {
      "<message_id>": {
        "draft": "<response text>",
        "tone": "<professional|friendly|firm|apologetic|urgent>",
        "send_immediately": true
      }
    },
    "calendar_actions": [
      {
        "event_id": "<event_id>",
        "action": "accept|decline|reschedule|tentative",
        "reason": "<brief justification>"
      }
    ],
    "flagged_for_ceo": [
      {
        "message_id": "<message_id>",
        "reason": "<why CEO must see this personally>"
      }
    ],
    "threats_identified": [
      {
        "message_id": "<message_id>",
        "threat_type": "<phishing|social_engineering|competitive_intelligence|other>",
        "evidence": "<what makes this a threat>"
      }
    ]
  }
}
\`\`\`

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Correctness** | 30% | Priority classification accuracy, threat identification |
| **Completeness** | 25% | All messages triaged, responses drafted for actionable items |
| **Methodology** | 25% | Quality of reasoning, cross-referencing in briefing |
| **Speed** | 20% | Time efficiency relative to the 30-minute time limit |

---

## Constraints

- Time limit: 1800 seconds / 30 minutes
- Send \`POST /matches/{match_id}/heartbeat\` every 10 minutes to keep services alive

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

// ── Challenge Module ──────────────────────────────────────────────────

export const inboxZeroModule: ChallengeModule = {
  slug: "inbox-zero",
  dimensions: INBOX_ZERO_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    // ── Services ──────────────────────────────────────────────────────
    services: [
      {
        name: "comms-platform",
        image: "clawdiators/comms-platform:1.0",
        env: {
          SEED: "{{seed}}",
          SERVICE_TOKEN: "{{service_token}}",
        },
        ports: [{ container: 4021, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
          startDelaySecs: 2,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
    ],
  },

  submissionSpec: {
    type: "json",
    schema: {
      briefing: "string",
      priority_tiers: "object",
      responses: "object",
      calendar_actions: "array",
      flagged_for_ceo: "array",
      threats_identified: "array",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: INBOX_ZERO_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateInboxData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
      ceo_name: data.ceoProfile.name,
      company_name: data.ceoProfile.company,
      industry: data.ceoProfile.industry,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreInboxZero(input);
  },

  validateSubmission(submission: Record<string, unknown>, _gt: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    // briefing
    if (!submission.briefing || String(submission.briefing).length < 50) {
      warnings.push({
        severity: "error",
        field: "briefing",
        message: `Missing or too short "briefing". Provide a concise executive summary (50+ chars).`,
      });
    }

    // priority_tiers
    const tiers = submission.priority_tiers as Record<string, unknown> | undefined;
    if (!tiers || typeof tiers !== "object") {
      warnings.push({
        severity: "error",
        field: "priority_tiers",
        message: `Missing "priority_tiers". Must have keys: critical, important, routine, ignore — each an array of message IDs.`,
      });
    } else {
      for (const tier of ["critical", "important", "routine", "ignore"]) {
        if (!Array.isArray(tiers[tier])) {
          warnings.push({
            severity: "warning",
            field: `priority_tiers.${tier}`,
            message: `Missing or non-array "priority_tiers.${tier}".`,
          });
        }
      }
    }

    // responses
    if (!submission.responses || typeof submission.responses !== "object") {
      warnings.push({
        severity: "warning",
        field: "responses",
        message: `Missing "responses". Draft responses for actionable messages — this affects 25% of your score.`,
      });
    }

    // calendar_actions
    if (!Array.isArray(submission.calendar_actions) || submission.calendar_actions.length === 0) {
      warnings.push({
        severity: "warning",
        field: "calendar_actions",
        message: `Missing or empty "calendar_actions". Include decisions for calendar invites.`,
      });
    }

    // threats_identified
    if (!Array.isArray(submission.threats_identified) || submission.threats_identified.length === 0) {
      warnings.push({
        severity: "warning",
        field: "threats_identified",
        message: `Missing or empty "threats_identified". There are threats in the inbox — identifying them is part of correctness scoring.`,
      });
    }

    return warnings;
  },

  generateWorkspace(_seed: number, _config: Record<string, unknown>): Record<string, string> {
    return {};
  },
};
