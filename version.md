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
          ProgressiveSummaryPolicy
                  │
                  ├── previous ContextSummary
                  ├── newly covered messages only
                  └── ContextSummarizer
                  ↓
             ContextSummary
                  ↓
             SummaryStore
```

Three concepts remain distinct:

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

Context capacity is explicit:

```text
inputBudget = contextWindow - outputReserve - safetyMargin
```

Token estimation is a replaceable interface.

### v0.3.2 — ContextUnitBuilder + ToolExchange atomicity ✅

```text
AssistantMessage(toolCalls)
+
matching ToolResultMessage[]
=
ToolExchangeContextUnit
```

Complete tool exchanges are causal units and cannot be silently split by context selection or summary coverage.

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

Coverage means:

```text
coversThroughMessageIndex = N
          ↓
summary covers history[0..N]
```

`InMemorySummaryStore` stores checkpoint artifacts separately from `AgentMessage[]`, clones on read/write, allows equal or forward coverage, and rejects regression.

### v0.3.6 — ProgressiveSummaryPolicy + ContextSummarizer ✅

Implemented:

```text
src/context/summarizer.ts
src/context/policies/progressive-summary.ts
src/context/errors.ts
src/context/index.ts

tests/context-summarizer.test.ts
tests/progressive-compaction.test.ts
tests/context-cancellation.test.ts
```

Summarizer contract:

```ts
interface ContextSummarizer {
  summarize(input: ContextSummarizerInput): Promise<ContextSummarizerResult>;
}
```

Reference offline implementation:

```ts
DeterministicContextSummarizer
```

Progressive update model:

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

The policy passes only history after the previous checkpoint boundary as new input. The previous checkpoint is supplied separately.

Coverage boundary invariant:

> Every checkpoint boundary must equal the end of a complete `ContextUnit`.

Therefore summary coverage cannot cut through an assistant/tool-result exchange, and an incomplete trailing exchange cannot be checkpointed.

Failure atomicity:

```text
generate candidate
      ↓
validate + estimate
      ↓
abort check
      ↓
SummaryStore.put()
```

If generation fails or cancellation occurs before the commit, the latest checkpoint remains unchanged.

Same-boundary requests are explicit no-ops and do not invoke the summarizer.

New errors:

```text
InvalidSummaryCoverageBoundaryError
SummaryGenerationError
```

Coverage regression continues to use:

```text
SummaryCoverageRegressionError
```

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

Progressive summarization
────────────────────────
ContextSummarizer
ContextSummarizerInput
ContextSummarizerResult
DeterministicContextSummarizer
ProgressiveSummaryPolicy
AdvanceSummaryInput
ProgressiveSummaryResult

Errors
────────────────────────
ContextError
InvalidContextBudgetError
ContextBudgetExceededError
InvalidContextHistoryError
InvalidToolResultReductionOptionsError
InvalidContextSummaryError
SummaryCoverageRegressionError
InvalidSummaryCoverageBoundaryError
SummaryGenerationError
```

---

## 5. v0.3.6 verification

The new source subset passed TypeScript checking with:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
advance history 0..1
→ S1 covers 0..1

advance to 3
→ summarizer receives previous S1
→ new messages are only 2..3
→ S2 covers 0..3

abort after summarizer returns but before commit
→ abort propagated
→ SummaryStore still contains S2
```

The full repository Vitest suite is not claimed as run because the execution environment could not resolve GitHub/install repository dependencies.

---

## 6. Implementation stages

```text
v0.3.1  ContextBudget + ApproximateTokenEstimator        ✅
v0.3.2  ContextUnitBuilder + ToolExchange atomicity      ✅
v0.3.3  ToolResultReducer                                ✅
v0.3.4  PreparedContext + KeepRecentPlanner              ✅
v0.3.5  ContextSummary + SummaryStore                    ✅
v0.3.6  ProgressiveSummaryPolicy + ContextSummarizer     ✅
v0.3.7  AgentLoop integration + events + examples        ← next
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

Still outside v0.3.6 specifically:

- automatic AgentLoop-triggered summarization;
- inserting summary checkpoints into provider-facing context;
- model-provider-specific summarizer implementations;
- deleting durable history after summary creation.

---

## 8. Next increment — v0.3.7

The remaining v0.3 problem is runtime integration:

```text
Agent state.messages
      │
      ├────────────► SessionStore / durable truth
      │
      └── ContextPlanner.prepare()
                 ↓
      summary-aware PreparedContext
                 ↓
             LLMProvider
```

v0.3.7 must integrate the subsystem without making `AgentLoop` own compaction policy details.

It must also add context lifecycle events, deterministic integration tests, an educational long-history example, package/version finalization, and then freeze `v0.3` only after those checks are complete.
