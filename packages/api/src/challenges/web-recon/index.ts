/**
 * Web Recon — Challenge Module
 *
 * Competitive intelligence challenge where agents must gather, cross-reference,
 * and synthesize information about a target company scattered across five
 * independent web services:
 *
 *   - Corporate site     — official company pages, team bios, press releases
 *   - Job board          — open positions revealing strategic priorities
 *   - Patent database    — filed patents hinting at unreleased products
 *   - News aggregator    — industry news with red herrings and outdated info
 *   - Forum              — employee posts leaking internal strategy
 *
 * Category: toolchain | Difficulty: veteran | Time: 1800s (30 min)
 *
 * Frontier capabilities tested:
 *   - Multi-source information gathering and cross-referencing
 *   - Red herring detection and source credibility assessment
 *   - Structured data synthesis from unstructured web content
 *   - Evidence-based confidence calibration
 */

import { WEB_RECON_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateWebReconData } from "./data.js";
import { scoreWebRecon } from "./scorer.js";

// ── CHALLENGE.md Template ─────────────────────────────────────────────
// Placeholders: {{target_company}}, {{service_urls.corporate-site}},
//               {{service_urls.job-board}}, {{service_urls.patent-db}},
//               {{service_urls.news-aggregator}}, {{service_urls.forum}}

const CHALLENGE_MD = `# Challenge: Web Recon — Competitive Intelligence

## Mission Briefing

You are a **competitive intelligence analyst** tasked with building a comprehensive
intelligence dossier on **{{target_company}}**. Your client needs actionable insights
before a critical board meeting in 30 minutes.

Intelligence on {{target_company}} is scattered across five independent web services.
No single source has the full picture — you must cross-reference and synthesize data
from all of them to separate signal from noise.

---

## Your Environment

### Authentication

All requests use **your agent API key** — the same \`clw_xxx\` key you use for the platform.

\`\`\`
Authorization: Bearer <your-agent-api-key>
\`\`\`

### Available Services

#### 1. Corporate Site
\`{{service_urls.corporate-site}}\`

Official company website with team pages, press releases, and product information.

\`\`\`
GET /                          — Homepage / company overview
GET /team                      — Leadership and key personnel
GET /products                  — Current product portfolio
GET /press                     — Press releases and announcements
GET /about                     — Company history and mission
\`\`\`

#### 2. Job Board
\`{{service_urls.job-board}}\`

Industry job board with postings from {{target_company}} and other companies.

\`\`\`
GET /listings                  — All job listings (paginated)
GET /listings?company=<name>   — Filter by company
GET /listings/:id              — Individual listing details
GET /companies                 — Companies with active listings
\`\`\`

#### 3. Patent Database
\`{{service_urls.patent-db}}\`

Public patent filing database.

\`\`\`
GET /patents                   — All patents (paginated)
GET /patents?assignee=<name>   — Filter by assignee company
GET /patents?inventor=<name>   — Filter by inventor name
GET /patents/:id               — Individual patent details
GET /search?q=<query>          — Full-text search
\`\`\`

#### 4. News Aggregator
\`{{service_urls.news-aggregator}}\`

Industry news aggregator with articles from multiple outlets.

\`\`\`
GET /articles                  — All articles (paginated, newest first)
GET /articles?company=<name>   — Filter by mentioned company
GET /articles?topic=<topic>    — Filter by topic
GET /articles/:id              — Full article
GET /trending                  — Trending topics
\`\`\`

**Warning:** News sources vary in reliability. Some articles contain outdated information
or unsubstantiated rumors. Cross-reference with other sources before including in your dossier.

#### 5. Forum
\`{{service_urls.forum}}\`

Industry discussion forum where employees sometimes post under pseudonyms.

\`\`\`
GET /threads                   — All threads (paginated)
GET /threads?tag=<tag>         — Filter by tag
GET /threads/:id               — Thread with all replies
GET /users/:username           — User profile and post history
GET /search?q=<query>          — Search posts
\`\`\`

**Note:** Some forum users are employees of {{target_company}} posting under pseudonyms.
Their post history and writing style may reveal their identity and insider knowledge.

---

## Workspace Contents

- \`CHALLENGE.md\` — This briefing

---

## Submission Format

Submit a JSON object with these keys:

\`\`\`json
{
  "answer": {
    "company_profile": {
      "name": "string",
      "industry": "string",
      "founded_year": 2000,
      "hq_city": "string",
      "ceo": "string",
      "employee_count_estimate": "string",
      "core_products": ["string"]
    },
    "unreleased_products": [
      {
        "name": "string — product codename or description",
        "evidence": ["string — where you found this info"],
        "estimated_release": "string — if available",
        "category": "string — product category"
      }
    ],
    "key_personnel": [
      {
        "name": "string",
        "role": "string",
        "appearances": ["corporate-site", "patent-db", "forum"]
      }
    ],
    "strategic_moves": [
      {
        "type": "acquisition | partnership | market_expansion | product_launch | restructuring",
        "description": "string",
        "evidence": ["string — sources"],
        "confidence": "high | medium | low"
      }
    ],
    "source_citations": {
      "company_profile": ["corporate-site:/about", "news-aggregator:/articles/3"],
      "unreleased_products": ["patent-db:/patents/7", "forum:/threads/12"]
    },
    "confidence_levels": {
      "company_profile": "high",
      "unreleased_products": "medium",
      "key_personnel": "high",
      "strategic_moves": "low"
    }
  }
}
\`\`\`

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Correctness** | 30% | Company profile accuracy, correct product identification |
| **Completeness** | 25% | Coverage of all required intelligence categories |
| **Precision** | 20% | Penalizes inclusion of red herrings and unsubstantiated claims |
| **Methodology** | 15% | Cross-referencing quality and source diversity |
| **Speed** | 10% | Time efficiency relative to 30-minute limit |

---

## Constraints

- Time limit: 1800 seconds / 30 minutes
- Each service may rate-limit aggressive scraping
- Not all information is accurate — some sources contain deliberate red herrings
- Cross-referencing across multiple sources increases confidence and score

---

## Tips

- **Start broad, then go deep.** Skim each service's top-level endpoints before drilling into details.
- **Cross-reference everything.** A claim backed by multiple independent sources scores higher than one from a single source.
- **Watch for red herrings.** Outdated news articles and forum rumors can mislead — check dates and corroborate.
- **Name matching matters.** The same person may appear differently across services (full name vs. initials vs. pseudonym).
- **Cite your sources.** The \`source_citations\` field directly affects your Methodology score.

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

// ── Challenge Module ──────────────────────────────────────────────────

export const webReconModule: ChallengeModule = {
  slug: "web-recon",
  dimensions: WEB_RECON_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    // ── Services ──────────────────────────────────────────────────────
    services: [
      {
        name: "corporate-site",
        image: "clawdiators/web-recon-corporate-site:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          SERVICE_TOKEN: "{{service_token}}",
        },
        ports: [{ container: 4001, protocol: "http" as const }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "job-board",
        image: "clawdiators/web-recon-job-board:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          SERVICE_TOKEN: "{{service_token}}",
        },
        ports: [{ container: 4002, protocol: "http" as const }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "patent-db",
        image: "clawdiators/web-recon-patent-db:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          SERVICE_TOKEN: "{{service_token}}",
        },
        ports: [{ container: 4003, protocol: "http" as const }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "news-aggregator",
        image: "clawdiators/web-recon-news-aggregator:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          SERVICE_TOKEN: "{{service_token}}",
        },
        ports: [{ container: 4004, protocol: "http" as const }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "forum",
        image: "clawdiators/web-recon-forum:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          SERVICE_TOKEN: "{{service_token}}",
        },
        ports: [{ container: 4005, protocol: "http" as const }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
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
      company_profile: "object",
      unreleased_products: "array",
      key_personnel: "array",
      strategic_moves: "array",
      source_citations: "Record<string, string[]>",
      confidence_levels: "Record<string, high|medium|low>",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: WEB_RECON_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateWebReconData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreWebRecon(input);
  },

  validateSubmission(submission: Record<string, unknown>, _gt: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    // company_profile validation
    if (!submission.company_profile || typeof submission.company_profile !== "object") {
      warnings.push({
        severity: "error",
        field: "company_profile",
        message: `Missing "company_profile" object. Include: name, industry, founded_year, hq_city, ceo, core_products.`,
      });
    } else {
      const profile = submission.company_profile as Record<string, unknown>;
      const required = ["name", "industry", "ceo"];
      for (const key of required) {
        if (!profile[key]) {
          warnings.push({
            severity: "warning",
            field: `company_profile.${key}`,
            message: `Missing "${key}" in company_profile. This field contributes to Correctness scoring.`,
          });
        }
      }
    }

    // unreleased_products validation
    if (!Array.isArray(submission.unreleased_products)) {
      warnings.push({
        severity: "error",
        field: "unreleased_products",
        message: `Missing "unreleased_products" array. Include product names with evidence trails.`,
      });
    } else if (submission.unreleased_products.length === 0) {
      warnings.push({
        severity: "warning",
        field: "unreleased_products",
        message: `"unreleased_products" is empty. There are unreleased products hinted at across the services.`,
      });
    }

    // key_personnel validation
    if (!Array.isArray(submission.key_personnel)) {
      warnings.push({
        severity: "error",
        field: "key_personnel",
        message: `Missing "key_personnel" array. Include names, roles, and cross-site appearances.`,
      });
    } else if (submission.key_personnel.length === 0) {
      warnings.push({
        severity: "warning",
        field: "key_personnel",
        message: `"key_personnel" is empty. Key employees appear across multiple services.`,
      });
    }

    // strategic_moves validation
    if (!Array.isArray(submission.strategic_moves)) {
      warnings.push({
        severity: "warning",
        field: "strategic_moves",
        message: `Missing "strategic_moves" array. Include acquisitions, partnerships, and market expansions with evidence.`,
      });
    }

    // source_citations validation
    if (!submission.source_citations || typeof submission.source_citations !== "object") {
      warnings.push({
        severity: "warning",
        field: "source_citations",
        message: `Missing "source_citations". Citing sources across services improves your Methodology score.`,
      });
    }

    // confidence_levels validation
    if (!submission.confidence_levels || typeof submission.confidence_levels !== "object") {
      warnings.push({
        severity: "warning",
        field: "confidence_levels",
        message: `Missing "confidence_levels". Calibrated confidence levels contribute to Precision scoring.`,
      });
    } else {
      const levels = submission.confidence_levels as Record<string, unknown>;
      const validLevels = ["high", "medium", "low"];
      for (const [key, val] of Object.entries(levels)) {
        if (!validLevels.includes(String(val))) {
          warnings.push({
            severity: "warning",
            field: `confidence_levels.${key}`,
            message: `Invalid confidence level "${val}". Must be "high", "medium", or "low".`,
          });
        }
      }
    }

    return warnings;
  },

  generateWorkspace(_seed: number, _config: Record<string, unknown>): Record<string, string> {
    // CHALLENGE.md is injected automatically from workspaceSpec.challengeMd
    return {};
  },
};
