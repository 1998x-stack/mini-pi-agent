# mini-pi-agent v0.3

## 1. Version identity

- **Branch:** `v0.3`
- **Theme:** context budget, causal units, model-only reduction, budgeted planning, summary checkpoints, and progressive compaction
- **Previous version:** `v0.2`
- **Target package version:** `0.3.0`
- **Status:** active implementation snapshot

Primary mental model:

> **Durable session history is the source of truth. Model-visible context and summary checkpoints are derived projections of that history.**

---

## 2. Current architecture

```text
Durable AgentMessage[] history
          │
          ├──────────────► SessionStore / historical truth
          │
          ├── ContextUnitBuilder
          │       ↓
          │   ToolResultReducer
          │       ↓
          │   ContextPlanner
          │       ↓
          │   PreparedContext
          │
          └── old-history prefix
                  ↓
             ContextSummary
                  ↓
             SummaryStore
```

Three concepts must remain different:

```text
Durable History
≠
Prepared Model Context
≠
Summary Checkpoint
```

A summary is not permission to delete history.

---

## 3. Implemented increments

### v0.3.1 — ContextBudget + ApproximateTokenEstimator ✅

```text
inputBudget = contextWindow - outputReserve - safetyMargin
```

Context capacity is explicit and token estimation is a replaceable interface.

### v0.3.2 — ContextUnitBuilder + ToolExchange atomicity ✅

```text
AssistantMessage(toolCalls)
+
matching ToolResultMessage[]
=
ToolExchangeContextUnit
```

Complete tool exchanges are causal units and cannot be silently split by context selection.

### v0.3.3 — ToolResultReducer ✅

Large observations are reduced only in model-visible copies. Durable ToolResults remain unchanged.

Reference implementation:

```ts
HeadTailToolResultReducer
```

### v0.3.4 — PreparedContext + KeepRecentPlanner ✅

```text
history
  ↓
causal units
  ↓
model-only ToolResult reduction
  ↓
budget estimation
  ↓
contiguous recent suffix
  ↓
PreparedContext
```

The planner exposes selection/reduction provenance and does not mutate history, write sessions, or call the model.

### v0.3.5 — ContextSummary + SummaryStore ✅

Implemented:

```text
src/context/summary.ts
src/context/summary-store.ts
src/context/errors.ts
src/context/index.ts

tests/context-summary.test.ts
tests/summary-store.test.ts
```

Public checkpoint model:

```ts
interface ContextSummary {
  id: string;
  content: string;
  coversThroughMessageIndex: number;
  estimatedTokens: number;
  createdAt: number;
}
```

Coverage is defined as a durable-history prefix:

```text
coversThroughMessageIndex = N
          ↓
summary covers history[0..N]
```

This prefix rule is essential for progressive compaction because the next summarization step can unambiguously start at `N + 1`.

Reference store:

```ts
interface SummaryStore {
  getLatest(): Promise<ContextSummary | undefined>;
  put(summary: ContextSummary): Promise<void>;
  clear(): Promise<void>;
}

class InMemorySummaryStore implements SummaryStore
```

Store invariants:

- summaries are stored separately from `AgentMessage[]`;
- reads/writes use copies rather than shared object identity;
- equal coverage may replace a checkpoint, supporting deterministic regeneration/retry;
- forward coverage is accepted;
- backward coverage is rejected through `SummaryCoverageRegressionError`;
- a rejected regression leaves the previous checkpoint intact.

Validation error:

```text
InvalidContextSummaryError
```

The summary artifact itself is deliberately model-agnostic in v0.3.5. No LLM is called yet.

---

## 4. Current public context surface

```text
Budget
────────────────────────
ContextBudget
ResolvedContextBudget
resolveContextBudget()
assertWithinContextBudget()

Estimation
────────────────────────
TokenEstimator
ApproximateTokenEstimator
estimatePreparedInput()

Causal structure
────────────────────────
ContextUnit
UserContextUnit
AssistantContextUnit
ToolExchangeContextUnit
buildContextUnits()
flattenContextUnits()

Observation projection
────────────────────────
ToolResultReducer
ToolResultReduction
HeadTailToolResultReducer

Planning
────────────────────────
ContextPlanner
ContextPlannerInput
PreparedContext
ContextProvenance
KeepRecentContextPlanner

Summary checkpoints
────────────────────────
ContextSummary
createContextSummary()
cloneContextSummary()
summaryCoveredMessageCount()
summaryCoversMessageIndex()
SummaryStore
InMemorySummaryStore

Errors
────────────────────────
ContextError
InvalidContextBudgetError
ContextBudgetExceededError
InvalidContextHistoryError
InvalidToolResultReductionOptionsError
InvalidContextSummaryError
SummaryCoverageRegressionError
```

---

## 5. v0.3.5 verification

The v0.3.5 source subset passed TypeScript checking with:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
put S1 covering 0..2
put S2 covering 0..5
→ latest = S2

attempt S_bad covering 0..4
→ SummaryCoverageRegressionError
→ latest remains S2
```

The full repository Vitest suite is not claimed as run in the current execution environment because repository dependencies could not be installed there.

---

## 6. Implementation stages

```text
v0.3.1  ContextBudget + ApproximateTokenEstimator        ✅
v0.3.2  ContextUnitBuilder + ToolExchange atomicity      ✅
v0.3.3  ToolResultReducer                                ✅
v0.3.4  PreparedContext + KeepRecentPlanner              ✅
v0.3.5  ContextSummary + SummaryStore                    ✅
v0.3.6  ProgressiveSummaryPolicy + ContextSummarizer     ← next
v0.3.7  AgentLoop integration + events + examples
```

The sequence is intentional:

```text
budget
  ↓
causal units
  ↓
large-output reduction
  ↓
budgeted selection
  ↓
checkpoint artifacts
  ↓
progressive summarization
  ↓
runtime integration
```

---

## 7. Explicit non-goals

Still outside v0.3:

- Skills
- Extensions
- MCP
- session DAG/branching
- permissions/sandbox
- RPC
- vector-database memory platform
- semantic retrieval as a substitute for correct context lifecycle

Still outside v0.3.5 specifically:

- calling an LLM to generate summaries;
- injecting summaries into PreparedContext;
- progressive summarization policy;
- AgentLoop integration.

---

## 8. Next increment — v0.3.6

The next problem is:

```text
We can store one explicit summary checkpoint.
How do we advance it without repeatedly summarizing all old history?
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

v0.3.6 will introduce `ContextSummarizer` and `ProgressiveSummaryPolicy`, with cancellation, no-op, failure-atomicity, and coverage-monotonicity tests.
