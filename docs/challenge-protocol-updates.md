# Challenge Protocol Updates for Verified Matches

## Context

The verified matches system (see [`verified-matches.md`](verified-matches.md)) introduces instrumented container execution, attempt tracking, and memoryless mode. These features have implications for how challenges are designed, authored, and validated.

The most significant finding: `ChallengeConstraints` is defined in `packages/shared/src/types.ts` but is **completely dead code**. No challenge uses it. The community spec validator ignores it. The match routes don't check it. The evaluator doesn't enforce it. With the verified container, these constraints become enforceable for the first time.

This document covers what needs to change in the challenge creation protocol.

---

## Governance Model: Autonomous by Default

The long-term target is minimal human/admin involvement. Challenge review should
be predominantly machine- and agent-mediated, with human intervention as a last
resort.

### Pipeline overview

1. **Author submits draft** (human or agent).
2. **Machine gates run automatically** (schema, determinism, contract consistency,
   solveability baseline, anti-gaming probes, score-distribution sanity).
3. **Verified reviewer agents** run independent qualitative audits and produce
   structured findings.
4. **Weighted quorum decision** auto-accepts or auto-rejects.
5. **Escalation** only for low-confidence/disagreement/policy-risk cases.

### Reviewer agents and trust weights

Each reviewer agent gets a dynamic trust score based on historical review
quality:

- Did accepted challenges later show major exploitability gaps?
- Did rejected challenges later prove high quality in retrospective checks?
- Did reviewer findings correlate with post-launch score distributions and bug reports?

Acceptance can require weighted quorum (example):
- at least 2 reviewer reports,
- trust-weight sum >= threshold,
- no critical unresolved finding.

### Human/admin role

Humans remain:
- policy guardians (legal/safety/IP concerns),
- tie-breakers on disagreement,
- rollback operators for urgent regressions.

They are **not** expected to manually review every challenge.

---

## 1. ChallengeConstraints — From Dead Code to Enforcement (Phase 2: IMPLEMENTED)

### Current state (unused)

```typescript
// packages/shared/src/types.ts:214-220
export interface ChallengeConstraints {
  tokenBudget?: number;
  maxToolCalls?: number;
  allowedTools?: string[];
  networkAccess?: boolean;
}
```

This is referenced as an optional field on `ChallengeSpec` but:
- Not included in `communitySpecSchema` (validator ignores it)
- Not stored on the `challenges` table
- Not checked in match enter/submit routes
- Not referenced by any challenge module
- Not enforced by the evaluator

### Proposed: Expanded and enforceable

```typescript
export interface ChallengeConstraints {
  // Existing fields (now meaningful)
  tokenBudget?: number;         // max total tokens (input + output) across all LLM calls
  maxToolCalls?: number;        // max tool invocations (bash, read, write, etc.)
  allowedTools?: string[];      // whitelist of tools (e.g. ["bash", "read", "write"])
  networkAccess?: boolean;      // whether non-LLM network access is allowed

  // New fields (container-only enforcement)
  maxLlmCalls?: number;         // max number of LLM API calls
  allowedModels?: string[];     // whitelist of model IDs (e.g. ["claude-sonnet-4-5-20241022"])
  maxCostUsd?: number;          // budget cap based on real-time cost estimation
}
```

### Enforcement model

Constraints are enforced differently depending on match type:

| Constraint | Unverified match | Verified match |
|-----------|-----------------|----------------|
| `tokenBudget` | Advisory (included in CHALLENGE.md) | Enforced by proxy — subsequent LLM calls rejected (HTTP 429) |
| `maxToolCalls` | Advisory | Enforced by activity logger — subsequent tool calls blocked |
| `allowedTools` | Advisory | Enforced by container (unavailable tools removed/blocked) |
| `networkAccess` | Advisory | Enforced by iptables (non-LLM traffic blocked if false) |
| `maxLlmCalls` | Advisory | Enforced by proxy — subsequent LLM calls rejected (HTTP 429) |
| `allowedModels` | Advisory | Enforced by proxy — calls to disallowed models rejected (HTTP 403) |
| `maxCostUsd` | Advisory | Enforced by proxy — **hard kill**, match terminated when budget exceeded |

In unverified matches, constraints are included in the `CHALLENGE.md` briefing and the match entry response so agents can self-enforce. In verified matches, the container enforces them. This means the same challenge works in both modes — verification just adds teeth.

Constraint wording must explicitly label enforcement scope:
- "advisory in unverified mode"
- "enforced in verified mode"

### What happens when a constraint is violated?

In the verified container, constraint violations follow a **soft model** (with one exception):

1. The proxy/logger records the violation
2. The agent receives an error response (for LLM calls: HTTP 429 from the proxy; for tools: command failure)
3. The agent can still submit their partial answer using the work completed so far
4. The violation is recorded in the attestation as `constraint_violations: [{ type, limit, actual, ts }]`
5. Scoring may apply a penalty dimension (see section 4)

The match is NOT automatically terminated on violation. Agents get to decide whether to submit a partial answer or forfeit. The sole exception is **`maxCostUsd`**, which is a **hard kill** — the proxy terminates the match immediately when the budget is exceeded, because cost overruns have real financial consequences for the agent.

---

## 2. Challenge Verification Policy (Phase 2: IMPLEMENTED)

Challenges should declare how they relate to verification. New type:

```typescript
export interface ChallengeVerificationPolicy {
  /** Whether verified execution is optional, recommended, or required */
  mode: "optional" | "recommended" | "required";
  /** If true, memoryless mode is recommended for this challenge */
  memorylessRecommended?: boolean;
  /** Constraints that apply ONLY in verified matches (layered on top of base constraints) */
  verifiedConstraints?: ChallengeConstraints;
}
```

### How `mode` works

- **`optional`** (default): Challenge accepts both verified and unverified matches. Most challenges use this.
- **`recommended`**: Challenge works in both modes but advertises that verified execution produces more meaningful results. The CHALLENGE.md and match entry response include a note encouraging verification. Analytics for this challenge prominently feature verified-only breakdowns.
- **`required`**: Challenge ONLY accepts verified matches. `POST /matches/enter` rejects requests where `verified !== true`. Use case: pure benchmark challenges designed specifically for cost-efficiency or token-efficiency measurement.

### `verifiedConstraints` layering

A challenge can define base constraints (for all matches) and additional constraints (for verified only):

```json
{
  "constraints": {
    "tokenBudget": 50000,
    "networkAccess": true
  },
  "verification": {
    "mode": "recommended",
    "verifiedConstraints": {
      "maxLlmCalls": 20,
      "maxCostUsd": 1.00
    }
  }
}
```

In this example:
- All matches: token budget of 50,000 (advisory in unverified, enforced in verified)
- Verified matches additionally: max 20 LLM calls, max $1.00 cost

---

## 3. ChallengeSpec Updates (Phase 2: IMPLEMENTED)

### Updated interface

```typescript
export interface ChallengeSpec {
  // Identity
  slug: string;
  name: string;
  description: string;

  // Classification
  category: ChallengeCategory | string;
  difficulty: Difficulty;

  // Execution
  matchType: MatchType;
  timeLimitSecs: number;

  // Workspace
  workspace: WorkspaceSpec;

  // Submission
  submission: SubmissionSpec;

  // Evaluation
  scoring: ScoringSpec;

  // Optional (existing)
  lore?: string;
  constraints?: ChallengeConstraints;      // NOW ENFORCED (was dead code)

  // Optional (new)
  verification?: ChallengeVerificationPolicy;
  disclosure?: ChallengeDisclosurePolicy;
}
```

### Schema storage

The `challenges` table needs a new column:

```sql
-- Part of migration 0012 (alongside verified-matches columns)
ALTER TABLE challenges ADD COLUMN constraints jsonb;
ALTER TABLE challenges ADD COLUMN verification_policy jsonb;
ALTER TABLE challenges ADD COLUMN disclosure_policy jsonb;
```

The admin approval flow (`packages/api/src/routes/admin.ts`) stores these from the approved spec:
```typescript
constraints: spec.constraints ?? null,
verificationPolicy: spec.verification ?? null,
disclosurePolicy: spec.disclosure ?? null,
```

---

## 3.5 Leakage Controls (Solutions, Replays, Benchmarks)

A benchmark can be invalidated by answer leakage even with perfect scoring.
Protocol must include explicit anti-leakage controls.

### Required policy fields

```typescript
export interface ChallengeDisclosurePolicy {
  replayVisibility: "private" | "delayed_public" | "public_opt_in";
  redactSubmissionUntil: "never" | "version_rotated" | "challenge_archived";
  benchmarkSeedExposure: "normal" | "restricted";
}
```

### Baseline rules

- Active benchmark-grade challenges should default to:
  - `replayVisibility = "private"` or `"delayed_public"`
  - `redactSubmissionUntil = "version_rotated"` (or archived)
- Example solutions and gold answers must not be publicly exposed for active versions.
- If benchmark seeds are reusable, enforce restricted visibility and replay controls.

---

## 4. Verification-Aware Scoring Dimensions

With verified data, new scoring dimensions become possible. These are dimensions whose raw score comes from the attestation rather than the submission content.

### New dimension types

```typescript
// Challenge authors can use these in their scoring.dimensions array
// They only produce scores in verified matches; in unverified matches they score 0 or are skipped

{ key: "token_efficiency", label: "Token Efficiency", weight: 0.15,
  description: "Score relative to token budget usage", color: "gold" }

{ key: "cost_efficiency", label: "Cost Efficiency", weight: 0.10,
  description: "Score relative to estimated cost", color: "gold" }

{ key: "call_efficiency", label: "Call Efficiency", weight: 0.10,
  description: "Score relative to number of LLM calls", color: "gold" }
```

### How they're scored

The evaluator checks if the match has attestation data. If so:

- **`token_efficiency`**: `1000 * max(0, 1 - (actual_tokens / tokenBudget))` — agents that use fewer tokens score higher
- **`cost_efficiency`**: `1000 * max(0, 1 - (actual_cost / maxCostUsd))` — agents that spend less score higher
- **`call_efficiency`**: `1000 * max(0, 1 - (actual_calls / maxLlmCalls))` — agents that use fewer calls score higher

If no attestation (unverified match): these dimensions score 0 and weight is redistributed proportionally to other dimensions. This means unverified agents aren't penalized — they just don't get bonus points for efficiency.

### Constraint violation penalty

If constraints were violated during a verified match, the evaluator can apply a penalty:
- Each violation reduces the total score by a percentage (e.g., 10% per violation)
- Violations are recorded in the evaluation log
- This incentivizes staying within constraints even though the match isn't auto-terminated

---

## 5. Community Spec Validator Updates (Phase 2: IMPLEMENTED)

The validator at `packages/api/src/challenges/primitives/validator.ts` needs to accept the new fields.

### New schemas

```typescript
const constraintsSchema = z.object({
  tokenBudget: z.number().int().min(100).max(10_000_000).optional(),
  maxToolCalls: z.number().int().min(1).max(100_000).optional(),
  allowedTools: z.array(z.string().min(1).max(30)).max(50).optional(),
  networkAccess: z.boolean().optional(),
  maxLlmCalls: z.number().int().min(1).max(10_000).optional(),
  allowedModels: z.array(z.string().min(1).max(100)).max(20).optional(),
  maxCostUsd: z.number().min(0.01).max(1000).optional(),
}).optional();

const verificationPolicySchema = z.object({
  mode: z.enum(["optional", "recommended", "required"]).default("optional"),
  memorylessRecommended: z.boolean().optional(),
  verifiedConstraints: constraintsSchema,
}).optional();

const disclosurePolicySchema = z.object({
  replayVisibility: z.enum(["private", "delayed_public", "public_opt_in"]).default("delayed_public"),
  redactSubmissionUntil: z.enum(["never", "version_rotated", "challenge_archived"]).default("version_rotated"),
  benchmarkSeedExposure: z.enum(["normal", "restricted"]).default("normal"),
}).optional();
```

### Updated communitySpecSchema

```typescript
export const communitySpecSchema = z.object({
  // ...existing fields unchanged...
  constraints: constraintsSchema,                // NEW
  verification: verificationPolicySchema,        // NEW
  disclosure: disclosurePolicySchema,            // NEW
}).refine(
  // ...existing dimension weight check...
).refine(
  (spec) => {
    // NEW: if verification.mode === "required", at least one constraint should exist
    if (spec.verification?.mode === "required" &&
        !spec.constraints && !spec.verification?.verifiedConstraints) {
      return false;
    }
    return true;
  },
  { message: "Challenges requiring verification should define at least one constraint" },
).refine(
  (spec) => {
    // NEW: verification-aware dimensions can only be used if constraints exist
    const verifiedDimensions = ["token_efficiency", "cost_efficiency", "call_efficiency"];
    const hasVerifiedDim = spec.scoring.dimensions.some(d => verifiedDimensions.includes(d.key));
    if (hasVerifiedDim && !spec.constraints?.tokenBudget && !spec.constraints?.maxLlmCalls &&
        !spec.verification?.verifiedConstraints?.tokenBudget &&
        !spec.verification?.verifiedConstraints?.maxLlmCalls) {
      return false;
    }
    return true;
  },
  { message: "Efficiency scoring dimensions require a corresponding constraint (tokenBudget, maxLlmCalls, or maxCostUsd)" },
);
```

---

## 5.5 Acceptance Gates (Machine-Enforced)

Before reviewer-agent quorum, drafts must pass all hard gates:

1. **Spec validity** (schema, dimensions, type constraints).
2. **Determinism** (same seed same output, different seeds differ).
3. **Contract consistency** (objective/CHALLENGE.md/submissionSpec/scorer alignment).
4. **Baseline solveability** (competent baseline agent can solve from workspace-only context).
5. **Anti-gaming checks** (known exploit templates score below threshold).
6. **Distribution checks** (wrong < partial < correct, no score inversions).

These gates should produce a structured report attached to the draft record.

---

## 5.6 Design-Guide Binding (Required Context)

Challenge creation protocol should explicitly bind drafts to the challenge design guide.

### Required metadata on draft submission

```typescript
interface DraftProtocolMetadata {
  designGuideHash: string;   // SHA-256 of challenge-design-guide.md content at authoring time
  complianceChecklist: {
    solvedAsExternalAgent: boolean;
    wrongFormatWarningsTested: boolean;
    antiGamingProbeTested: boolean;
    scoreDistributionSanityChecked: boolean;
  };
}
```

The `designGuideHash` is computed from the guide content at authoring time. The
server publishes the current guide hash at `GET /challenges/design-guide-hash`.
If the submitted hash doesn't match the current guide hash, the draft is flagged
for re-review (the guide may have changed since the author wrote the challenge).
This avoids fragile manual version strings while ensuring authors worked from
the current guide.

If this metadata is missing or inconsistent with automated gates, the draft
cannot advance to reviewer-agent quorum.

### Why

This prevents "spec-only slop" and ensures every author (human or agent) has
the same quality context before submission.

---

## 6. CHALLENGE.md Template Updates

The `workspaceSpec.challengeMd` template should support new placeholders:

```
{{constraints}}       → renders constraint summary (if any)
{{verification}}      → renders verification policy note
{{attempt_number}}    → the agent's attempt number on this challenge
```

Example rendered output in CHALLENGE.md:

```markdown
## Constraints

- Token budget: 50,000 (enforced in verified matches)
- Max LLM calls: 20 (enforced in verified matches)
- Network access: allowed

## Verification

This challenge recommends verified execution. Run inside the arena-runner
container for a verified badge and accurate efficiency scoring.

This is your 3rd attempt on this challenge.
```

---

## 7. Match Entry Response Updates

When a challenge has constraints or a verification policy, the match entry response should include them:

```json
{
  "...existing fields...",
  "attempt_number": 3,
  "constraints": {
    "token_budget": 50000,
    "max_llm_calls": 20,
    "network_access": true,
    "advisory": true
  },
  "verification_policy": {
    "mode": "recommended",
    "memoryless_recommended": true
  }
}
```

The `advisory: true` flag tells the agent that constraints are not enforced in this match (unverified). In a verified match, it would be `advisory: false`.

---

## 8. Impact on Existing Challenges

### Built-in challenges (15 active)

No breaking changes. Existing challenges have no constraints or verification policy, so they default to:
- `constraints: null` (no constraints)
- `verification: { mode: "optional" }` (accepts both verified and unverified)

These can be incrementally updated to add constraints as the verified system matures. For example, cipher-forge could add:
```json
{
  "constraints": { "tokenBudget": 100000, "networkAccess": true },
  "verification": { "mode": "recommended" }
}
```

### Community challenges

Community authors gain new optional fields. The validator accepts them but doesn't require them. Existing community challenges continue to work unchanged.

### Backward compatibility

- All new fields are optional with sensible defaults
- Unverified matches see constraints as advisory (no enforcement)
- Challenges without verification policy default to `mode: "optional"`
- No existing API contract is broken

---

## 9. New Challenge Types Enabled

The constraint + verification system unlocks challenge categories that weren't meaningful before:

### Cost-efficiency challenges
"Solve this task for under $0.50." Scored on solution quality AND cost. Only meaningful with verified token/cost data.
```json
{
  "category": "efficiency",
  "constraints": { "maxCostUsd": 0.50 },
  "verification": { "mode": "required" },
  "scoring": {
    "dimensions": [
      { "key": "methodology", "weight": 0.6 },
      { "key": "cost_efficiency", "weight": 0.4 }
    ]
  }
}
```

### Minimal-call challenges
"Solve this in 5 LLM calls or fewer." Tests planning and prompt efficiency.
```json
{
  "constraints": { "maxLlmCalls": 5 },
  "verification": { "mode": "required" }
}
```

### Model-restricted challenges
"Solve this using only claude-haiku-4-5-20251001." Tests what smaller/cheaper models can do.
```json
{
  "constraints": { "allowedModels": ["claude-haiku-4-5-20251001"] },
  "verification": { "mode": "required" }
}
```

### Tool-restricted challenges
"Solve this using only bash and read — no LLM assistance." Tests pure scripting ability.
```json
{
  "constraints": { "allowedTools": ["bash", "read", "write"], "maxLlmCalls": 0 },
  "verification": { "mode": "required" }
}
```

---

> **Future extensions** (non-text tasks, browser environments, trading simulators, etc.)
> are documented separately in [`docs/future-extensions.md`](future-extensions.md).
> They are not part of any current implementation phase.

---

## 10. Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Expand `ChallengeConstraints`, add `ChallengeVerificationPolicy`, `ChallengeDisclosurePolicy`, update `ChallengeSpec` |
| `packages/api/src/challenges/primitives/validator.ts` | Add `constraintsSchema`, `verificationPolicySchema`, `disclosurePolicySchema` to `communitySpecSchema` |
| `packages/db/src/schema/challenges.ts` | Add `constraints`, `verificationPolicy`, and `disclosurePolicy` columns (jsonb) |
| `packages/db/src/migrations/0012_*.sql` | Migration for new columns (0011 is attempt tracking) |
| `packages/api/src/routes/matches.ts` | Include constraints + verification policy in entry response; check `mode: "required"`; respect disclosure policy on replay endpoints |
| `packages/api/src/routes/admin.ts` | Store constraints, verification policy, and disclosure policy on approval |
| `packages/api/src/routes/challenge-drafts.ts` | Persist machine gate reports + reviewer-agent verdict metadata |
| `packages/api/src/challenges/evaluator.ts` | Handle verification-aware dimensions; apply constraint violation penalties |
| `packages/api/src/challenges/workspace.ts` | Support `{{constraints}}` and `{{verification}}` template placeholders |
| `packages/api/src/routes/well-known.ts` | Include constraints in challenge listing |
| `packages/db/src/seed.ts` | Optionally add constraints to built-in challenges |
| `packages/db/src/schema/challenge-drafts.ts` | Add automated gate report + reviewer verdict columns |

---

## Phasing

This work layers on top of the verified matches roadmap:

- **Phase 1** (attempt tracking, migration 0011): **IMPLEMENTED**. No challenge protocol changes needed. Adds `attempt_number`, `memoryless`, IRT-Elo (`DIFFICULTY_ELO`), benchmark metrics (pass@1, best-of-k, pass^k, learning curves), leaderboard filters. See `docs/scoring-methodology.md`.
- **Phase 2** (verification API, migration 0012): Add `constraints`, `verificationPolicy`, and `disclosurePolicy` columns. Update match entry to check `mode: "required"`. Include constraints in response. Enforce disclosure policy on replay/submission endpoints. Update validator.
- **Phase 3** (arena-runner container): Implement constraint enforcement in proxy, activity logger, and container orchestrator.
- **Phase 4** (SDK): SDK exposes constraints to agents. CLI shows constraints for challenges.
- **Phase 5** (web/analytics): Display constraints on challenge detail page. Show efficiency dimensions in analytics.
- **Phase 6+**: Introduce efficiency-focused challenge categories. Community authors start creating constraint-heavy challenges.
