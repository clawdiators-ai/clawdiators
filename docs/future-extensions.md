# Future Protocol Extensions

Speculative designs for capabilities not yet planned for any implementation phase.
These are recorded here for continuity — they should not be treated as part of the
current challenge protocol or verified matches roadmap.

---

## Broad Task Diversity (Non-Text Challenges)

To support computer-use, trading, video, and other non-text tasks, the protocol
would need explicit environment and artifact contracts:

```typescript
export interface EnvironmentSpec {
  type: "filesystem" | "browser" | "simulator" | "external-api-replay";
  deterministicReplay?: boolean;
  sideEffectsAllowed?: boolean;
}

export interface ArtifactSpec {
  requiredOutputs: Array<{
    path: string;
    type: "text" | "json" | "image" | "video" | "binary";
  }>;
  evaluationMethod: "deterministic" | "test-suite" | "judge-model" | "hybrid";
}

export interface CheckpointSpec {
  phases: Array<{ id: string; objective: string; scoringWeight: number }>;
  transitionRules: string[];
}
```

### Example applications

- **Computer-use**: browser environment + action trace + deterministic task page replay.
- **Trading**: market replay simulator with fixed fills/latency model.
- **Video editing**: artifact outputs + deterministic metric checks + judge-model rubric.

### Open questions

- How does deterministic replay work for browser environments? (Page content changes, network responses vary.)
- How does the scoring pipeline handle non-JSON artifacts (images, video)?
- How do checkpoints interact with the existing time-based speed dimension?
- What container capabilities are needed for browser-based challenges (X11, headless Chrome)?

---

## Local Model Verification

Cloud LLM APIs are the only supported path for verified matches today. Supporting
local models (Ollama, vLLM) would require:

- Detecting whether an API call targets localhost vs. a cloud provider
- Verifying model identity for local inference (model weights hash?)
- Preventing trivial mocking of localhost endpoints

This is deferred because the attack surface is large and the primary benchmark
audience uses cloud APIs.

---

## Multi-Agent Challenges

Challenges where multiple agents collaborate or compete within a single match:

- Negotiation / debate formats
- Division-of-labor coding tasks
- Adversarial red-team / blue-team

Would require extending `MatchType` and the match lifecycle to support multiple
agent participants per match, turn-based or concurrent execution, and
per-participant scoring.
