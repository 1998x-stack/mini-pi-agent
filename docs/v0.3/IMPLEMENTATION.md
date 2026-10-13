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

Implemented:

```text
src/context/summary.ts
src/context/summary-store.ts
src/context/errors.ts
src/context/index.ts

tests/context-summary.test.ts
tests/summary-store.test.ts
```

Checkpoint model:

```ts
interface ContextSummary {
  id: string;
  content: string;
  coversThroughMessageIndex: number;
  estimatedTokens: number;
  createdAt: number;
}
```

Coverage means the durable prefix `[0..N]`. `InMemorySummaryStore` keeps checkpoints separate from session history, clones on read/write, allows equal or forward coverage, and rejects coverage regression.

---

## v0.3.6 — ProgressiveSummaryPolicy + ContextSummarizer ✅ implemented

### Goal

Advance old-history checkpoints incrementally instead of repeatedly summarizing the complete historical log.

### Implemented

```text
src/context/summarizer.ts
src/context/policies/progressive-summary.ts
src/context/errors.ts
src/context/index.ts

tests/context-summarizer.test.ts
tests/progressive-compaction.test.ts
tests/context-cancellation.test.ts
```

### ContextSummarizer contract

```ts
interface ContextSummarizerInput {
  previousSummary?: ContextSummary;
  messages: readonly AgentMessage[];
  startMessageIndex: number;
  endMessageIndex: number;
  signal: AbortSignal;
}

interface ContextSummarizerResult {
  content: string;
}

interface ContextSummarizer {
  summarize(input: ContextSummarizerInput): Promise<ContextSummarizerResult>;
}
```

The summarizer owns content generation only. It does not choose coverage boundaries and does not commit checkpoints.

A deterministic offline reference implementation is included:

```ts
class DeterministicContextSummarizer implements ContextSummarizer
```

It exists to prove the mechanism without network/model access. Production callers can inject an LLM-backed implementation behind the same contract.

### ProgressiveSummaryPolicy

```ts
class ProgressiveSummaryPolicy {
  advance(input: AdvanceSummaryInput): Promise<ProgressiveSummaryResult>;
}
```

Target progression:

```text
history[0..100]
      ↓
     S1

S1 + history[101..170]
      ↓
     S2

S2 + history[171..240]
      ↓
     S3
```

The policy reads the latest checkpoint from `SummaryStore`, computes the newly covered range beginning at `previousCoverage + 1`, passes only that new range plus the previous checkpoint to `ContextSummarizer`, estimates the generated summary, and commits only after all validation/cancellation checks succeed.

### Coverage-boundary rule

A checkpoint boundary must equal the `endIndex` of a complete `ContextUnit`.

Therefore a target such as:

```text
Assistant(call_a, call_b)   index 10
ToolResult(call_a)          index 11
ToolResult(call_b)          index 12
```

may cover through `12`, but may not cover through `10` or `11`.

This prevents a summary checkpoint from semantically cutting through a causal tool exchange.

A trailing incomplete tool exchange also cannot become a checkpoint boundary.

### No-op rule

If requested coverage already equals the latest checkpoint coverage:

```text
requested = current
```

then the policy returns `status="unchanged"` and does not invoke the summarizer.

### Failure atomicity

The commit sequence is deliberately:

```text
read previous checkpoint
      ↓
validate target boundary
      ↓
generate candidate content
      ↓
check cancellation
      ↓
validate non-empty content
      ↓
estimate candidate
      ↓
check cancellation
      ↓
SummaryStore.put(candidate)
```

If generation throws or cancellation happens before `put()`, the previous checkpoint remains unchanged.

New errors:

```text
InvalidSummaryCoverageBoundaryError
SummaryGenerationError
```

Coverage regression continues to use:

```text
SummaryCoverageRegressionError
```

### Core invariants

- checkpoint coverage advances monotonically;
- newly summarized history begins exactly at `previousCoverage + 1`;
- target and stored coverage must align to complete context-unit boundaries;
- tool exchanges are never summarized only partially;
- same-boundary requests are no-ops;
- failed/cancelled summarization does not advance `SummaryStore`;
- generated content must be non-empty;
- summary token estimate is recorded at checkpoint creation;
- summarizer receives cloned message projections rather than mutable durable-history references;
- durable `AgentMessage[]` remains unchanged;
- AgentLoop is still unchanged.

### Verification performed

Strict TypeScript subset compilation passed under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
first advance:
  new history 0..1
  → S1 covers 0..1

second advance:
  previous = S1
  new history 2..3 only
  → S2 covers 0..3

abort after summarizer returns but before store.put:
  → abort propagated
  → latest store checkpoint remains S2
```

The full repository Vitest suite is not claimed as run in the current execution environment because repository dependencies could not be installed there.

---

## v0.3.7 — AgentLoop integration + events + example ← next

### Goal

Use the completed context subsystem only at the model-call boundary and expose its lifecycle through events/examples.

Target integration:

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

The integration also needs to decide how a stored summary checkpoint participates in `PreparedContext` while keeping it separate from durable history.

Planned files:

```text
src/core/agent-loop.ts
src/core/agent.ts
src/core/events.ts
src/context/... summary-aware planner composition
examples/07-context-compaction.ts
tests/agent-context-integration.test.ts
```

Required proof:

```text
provider-visible context
<
durable history
```

when compaction is needed, while SessionStore and `state.messages` remain complete.

---

## Final Definition of Done

- [x] budget and estimator primitives
- [x] causal context units
- [x] explicit ToolResult reduction
- [x] budgeted planner
- [x] summary checkpoint model
- [x] monotonic SummaryStore
- [x] ContextSummarizer contract
- [x] progressive compaction policy
- [x] summarization cancellation semantics
- [ ] AgentLoop integration
- [ ] summary-aware prepared context
- [ ] context lifecycle events
- [ ] deterministic integration tests
- [ ] educational example
- [ ] package/version/docs finalization

Only after all applicable items pass should `v0.3` be frozen as a historical learning snapshot.
