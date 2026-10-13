# v0.3 Implementation Plan

Primary invariant:

> Durable session history remains complete; model-visible context is a budgeted projection.

The stages are intentionally ordered. Do not move compaction policy into `AgentLoop` before the lower-level context mechanisms are stable.

---

## v0.3.1 — ContextBudget + ApproximateTokenEstimator ✅ implemented

Implemented:

```text
src/context/budget.ts
src/context/estimator.ts
src/context/errors.ts

tests/context-budget.test.ts
tests/token-estimator.test.ts
```

Core formula:

```text
inputBudget = contextWindow - outputReserve - safetyMargin
```

Key invariant: capacity is explicit and deterministic before any selection policy exists.

---

## v0.3.2 — ContextUnitBuilder + ToolExchange atomicity ✅ implemented

Implemented:

```text
src/context/units.ts
tests/context-units.test.ts
```

A tool exchange is one causal context unit:

```text
AssistantMessage(toolCalls)
        +
matching ToolResultMessage(s)
```

Complete exchanges cannot be split by later context selection. Invalid/orphan/duplicate tool history fails explicitly.

---

## v0.3.3 — ToolResultReducer ✅ implemented

Implemented:

```text
src/context/tool-result-reducer.ts
tests/tool-result-reducer.test.ts
```

Reference policy: deterministic Unicode-safe head/tail projection. The durable `ToolResultMessage` remains unchanged; only the model-visible copy is reduced.

---

## v0.3.4 — PreparedContext + KeepRecentPlanner ✅ implemented

Implemented:

```text
src/context/types.ts
src/context/planner.ts
src/context/policies/keep-recent.ts

tests/context-planner.test.ts
```

Pipeline:

```text
durable history
  ↓
ContextUnitBuilder
  ↓
ToolResultReducer
  ↓
TokenEstimator + ContextBudget
  ↓
KeepRecentContextPlanner
  ↓
PreparedContext
```

The reference policy selects one chronological contiguous suffix of complete units. It never silently truncates the system prompt or splits a causal exchange.

---

## v0.3.5 — ContextSummary + SummaryStore ✅ implemented

### Goal

Represent old-history compression as explicit checkpoint artifacts rather than anonymous prose or hidden mutations to session history.

### Implemented

```text
src/context/summary.ts
src/context/summary-store.ts
src/context/errors.ts
src/context/index.ts

tests/context-summary.test.ts
tests/summary-store.test.ts
```

### ContextSummary

```ts
interface ContextSummary {
  id: string;
  content: string;
  coversThroughMessageIndex: number;
  estimatedTokens: number;
  createdAt: number;
}
```

Coverage has one precise meaning:

```text
coversThroughMessageIndex = N

means the checkpoint covers the durable-history prefix:
[0..N]
```

It does not mean an arbitrary subset of history.

### SummaryStore

```ts
interface SummaryStore {
  getLatest(): Promise<ContextSummary | undefined>;
  put(summary: ContextSummary): Promise<void>;
  clear(): Promise<void>;
}
```

Reference implementation:

```ts
class InMemorySummaryStore implements SummaryStore
```

The reference store deliberately:

- stores summaries separately from durable `AgentMessage[]` history;
- clones summaries on write and read;
- permits coverage to stay equal or move forward;
- rejects coverage regression with `SummaryCoverageRegressionError`;
- keeps the previous checkpoint intact when regression is rejected.

### Errors

```text
InvalidContextSummaryError
SummaryCoverageRegressionError
```

### Core invariants

- summary identity is explicit;
- summary content is non-empty;
- coverage is an inclusive, non-negative prefix boundary;
- accounting fields are validated;
- a checkpoint is a derived artifact, not a durable conversation message;
- summary storage never deletes or edits SessionStore history;
- checkpoint coverage is monotonic;
- the mechanism is deterministic and does not require a live model.

### Verification performed

- strict TypeScript subset compilation passed under `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`;
- runtime smoke verified coverage can advance from 2 to 5;
- runtime smoke verified an attempted regression from 5 to 4 throws and preserves the latest checkpoint.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.3.6 — ProgressiveSummaryPolicy + ContextSummarizer ← next

### Goal

Generate and advance summary checkpoints incrementally instead of repeatedly summarizing the entire historical log.

Target progression:

```text
messages 0..100
    ↓
   S1 covers 0..100

S1 + messages 101..170
    ↓
   S2 covers 0..170

S2 + messages 171..240
    ↓
   S3 covers 0..240
```

### Add

```text
src/context/summarizer.ts
src/context/policies/progressive-summary.ts

tests/progressive-compaction.test.ts
tests/context-cancellation.test.ts
```

### Target contracts

```ts
interface ContextSummarizer {
  summarize(input: ContextSummarizerInput): Promise<string>;
}

interface ProgressiveSummaryPolicy {
  compact(input: ProgressiveSummaryInput): Promise<ContextSummary | undefined>;
}
```

A deterministic fake summarizer should prove the mechanism without network access.

### Required invariants

- existing checkpoint coverage is respected;
- only history after the previous coverage boundary is supplied as new history;
- next coverage never moves backward;
- no checkpoint is created when there is no newly coverable history;
- cancellation propagates through summarization;
- failed/cancelled summarization does not advance `SummaryStore`;
- durable history remains unchanged.

---

## v0.3.7 — AgentLoop integration + events + example

Only after summary mechanics are complete should runtime integration occur:

```text
Agent state.messages
      │
      ├──────────────► SessionStore / durable truth
      │
      └── ContextPlanner.prepare()
                 ↓
          PreparedContext
                 ↓
            LLMProvider
```

Planned integration files:

```text
src/core/agent-loop.ts
src/core/agent.ts
src/core/events.ts
examples/07-context-compaction.ts
tests/agent-context-integration.test.ts
```

---

## Final Definition of Done

- [x] budget and estimator primitives
- [x] causal context units
- [x] explicit ToolResult reduction
- [x] budgeted planner
- [x] summary checkpoint model
- [x] monotonic SummaryStore
- [ ] ContextSummarizer contract
- [ ] progressive compaction policy
- [ ] summarization cancellation semantics
- [ ] AgentLoop integration
- [ ] context lifecycle events
- [ ] deterministic integration tests
- [ ] educational example
- [ ] package/version/docs finalization

Only after all applicable items pass should `v0.3` be frozen as a historical learning snapshot.
