# mini-pi-agent v0.3

## 1. Version identity

- **Branch:** `v0.3`
- **Theme:** context budget, causal units, model-only reduction, budgeted planning, and explicit compaction
- **Previous version:** `v0.2`
- **Target package version:** `0.3.0`
- **Status:** active implementation snapshot

This branch is the canonical learning snapshot for the v0.3 mental model:

> **Durable session history is the source of truth. Model-visible context is a temporary, budgeted projection of that history.**

---

## 2. Architectural delta from v0.2

v0.2 focuses on asynchronous execution:

```text
provider stream
    ↓
assistant-message assembly
    ↓
tool scheduling
    ↓
ordered observations
```

v0.3 focuses on context preparation:

```text
complete durable history
          ↓
     context units
          ↓
  result reduction
          ↓
    ContextPlanner
          ↓
  budgeted projection
          ↓
         LLM
```

The critical distinction is:

```text
Runtime State
≠
Durable Session History
≠
Model-visible Context
```

Compaction reduces model-context pressure. It must never silently destroy durable history.

---

## 3. Current architecture

```text
Agent history
    │
    ▼
ContextUnitBuilder
    │
    ▼
KeepRecentContextPlanner
    │
    ├── ContextBudget
    ├── TokenEstimator
    ├── ToolResultReducer
    └── provenance accounting
    │
    ▼
PreparedContext
    │
    ▼
future AgentLoop integration
```

Summary checkpoints are the next missing layer. AgentLoop still uses the older compatibility seam until v0.3.7.

---

## 4. v0.3.1 — ContextBudget + ApproximateTokenEstimator ✅

Implemented:

```text
src/context/budget.ts
src/context/errors.ts
src/context/estimator.ts
src/context/index.ts

tests/context-budget.test.ts
tests/token-estimator.test.ts
```

Core formula:

```text
inputBudget
=
contextWindow
- outputReserve
- safetyMargin
```

Key properties:

- invalid budgets fail explicitly;
- overflow uses `ContextBudgetExceededError`;
- estimation is deterministic and provider/network independent;
- provider-specific exact tokenizers can replace the estimator later without changing planning policy.

---

## 5. v0.3.2 — ContextUnitBuilder + ToolExchange atomicity ✅

Implemented:

```text
src/context/units.ts
tests/context-units.test.ts
```

The runtime can lift raw message history into causal units:

```ts
type ContextUnit =
  | UserContextUnit
  | AssistantContextUnit
  | ToolExchangeContextUnit;
```

Most important unit:

```text
AssistantMessage(toolCalls)
        +
matching ToolResultMessage(s)
        ↓
ToolExchangeContextUnit
```

The builder rejects orphan, duplicate, mismatched, or interleaved tool history. A trailing incomplete exchange can exist in durable state, but strict consumers can reject it before model preparation.

Invariant:

> A provider context must never retain a tool call while silently dropping the corresponding observation merely because a raw-message cutoff crossed the exchange boundary.

---

## 6. v0.3.3 — ToolResultReducer ✅

Implemented:

```text
src/context/tool-result-reducer.ts
src/context/errors.ts
src/context/index.ts

tests/tool-result-reducer.test.ts
```

Reference implementation:

```ts
class HeadTailToolResultReducer implements ToolResultReducer
```

Default policy:

```text
thresholdChars = 20,000
headChars      =  8,000
tailChars      =  8,000
```

Large observations become explicit model-only projections:

```text
[mini-pi-agent tool result reduced for model context]
original_chars=...
kept_head_chars=...
kept_tail_chars=...
omitted_chars=...

--- head ---
...
--- omitted N chars ---
--- tail ---
...
```

The durable `ToolResultMessage` is never mutated. Tool identity and error state are preserved. Unicode is counted/sliced by code point.

---

## 7. v0.3.4 — PreparedContext + KeepRecentPlanner ✅

Implemented:

```text
src/context/types.ts
src/context/planner.ts
src/context/policies/keep-recent.ts
src/context/index.ts

tests/context-planner.test.ts
```

### Public contracts

```ts
interface ContextPlanner {
  prepare(input: ContextPlannerInput): Promise<PreparedContext>;
}

interface ContextPlannerInput {
  systemPrompt: string;
  history: readonly AgentMessage[];
  budget: ContextBudget;
  signal: AbortSignal;
}

interface PreparedContext {
  systemPrompt: string;
  messages: AgentMessage[];
  estimatedInputTokens: number;
  compacted: boolean;
  budget: ResolvedContextBudget;
  provenance: ContextProvenance;
}
```

### KeepRecent mental model

```text
durable history
      ↓
build complete ContextUnit[]
      ↓
reduce oversized ToolResults in model-only copies
      ↓
estimate each projected unit
      ↓
start at newest unit
      ↓
walk backward while budget fits
      ↓
stop at first non-fitting older unit
      ↓
restore chronological order
      ↓
PreparedContext
```

This first policy deliberately chooses one **contiguous recent suffix**. It does not skip a middle unit merely to pack a smaller older unit.

Why:

```text
recent temporal continuity
>
maximum packing density
```

for the reference learning policy.

### Failure semantics

The planner fails explicitly when:

- system prompt alone exceeds `inputBudget`;
- the newest atomic context unit cannot fit after reduction;
- durable history ends in an incomplete tool exchange;
- cancellation is already requested or occurs during selection.

It never silently truncates the system prompt or splits a causal tool exchange.

### Provenance

```ts
interface ContextProvenance {
  sourceMessageCount: number;
  sourceUnitCount: number;
  selectedMessageCount: number;
  selectedUnitCount: number;
  omittedMessageCount: number;
  omittedUnitCount: number;
  selectedStartMessageIndex: number | null;
  reducedToolResults: ToolResultReductionProvenance[];
}
```

A reduced ToolResult records:

```text
toolCallId
toolName
originalChars
visibleChars
omittedChars
```

`compacted` is true when either:

```text
an older unit was omitted
OR
a selected ToolResult was reduced
```

### Purity boundary

The planner does **not**:

- mutate `history`;
- append/delete SessionStore entries;
- call the LLM;
- change Agent state;
- perform summarization.

It only derives a model-visible projection.

---

## 8. Current public context surface

```text
Budget
────────────────
ContextBudget
ResolvedContextBudget
resolveContextBudget()
assertWithinContextBudget()

Errors
────────────────
ContextError
InvalidContextBudgetError
ContextBudgetExceededError
InvalidContextHistoryError
InvalidToolResultReductionOptionsError

Estimation
────────────────
TokenEstimator
ApproximateTokenEstimator
estimatePreparedInput()

Causal units
────────────────
ContextUnit
UserContextUnit
AssistantContextUnit
ToolExchangeContextUnit
buildContextUnits()
flattenContextUnits()

Tool observation projection
────────────────
ToolResultReducer
ToolResultReduction
HeadTailToolResultReducer
resolveToolResultReductionOptions()

Planning
────────────────
ContextPlanner
ContextPlannerInput
PreparedContext
ContextProvenance
KeepRecentContextPlanner
```

---

## 9. Verification status

The v0.3.1-v0.3.4 source subset was checked under the repository's strict TypeScript rules:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke checks verified:

```text
budget 6
history = [oldold, mid, new]
→ selected model context = [mid, new]
→ selectedStartMessageIndex = 1

1000-char ToolResult
→ model-visible result = 259 chars in the smoke configuration
→ omittedChars = 960
→ full tool exchange still selected
→ source ToolResult remains unchanged
```

The full repository Vitest suite is not claimed as run in this environment because package installation/network access was unavailable.

---

## 10. Implementation stages

```text
v0.3.1  ContextBudget + ApproximateTokenEstimator        ✅ implemented
v0.3.2  ContextUnitBuilder + ToolExchange atomicity      ✅ implemented
v0.3.3  ToolResultReducer                                ✅ implemented
v0.3.4  PreparedContext + KeepRecentPlanner              ✅ implemented
v0.3.5  ContextSummary + SummaryStore                    ← next
v0.3.6  ProgressiveSummaryPolicy + ContextSummarizer
v0.3.7  AgentLoop integration + events + examples
```

The order remains intentional:

```text
budget
  ↓
causal units
  ↓
large-output reduction
  ↓
budgeted selection
  ↓
summary checkpoints
  ↓
progressive compaction
  ↓
runtime integration
```

---

## 11. Important source files now

```text
src/context/budget.ts
src/context/errors.ts
src/context/estimator.ts
src/context/units.ts
src/context/tool-result-reducer.ts
src/context/types.ts
src/context/planner.ts
src/context/policies/keep-recent.ts
src/context/index.ts

tests/context-budget.test.ts
tests/token-estimator.test.ts
tests/context-units.test.ts
tests/tool-result-reducer.test.ts
tests/context-planner.test.ts
```

Existing compatibility seam:

```text
src/core/context.ts
```

`AgentLoop` is intentionally unchanged until v0.3.7.

---

## 12. Explicit non-goals

Not part of v0.3:

- Skills
- Extensions
- MCP
- session DAG/branching
- permissions/sandbox
- RPC
- vector-database memory platform
- semantic retrieval as a substitute for correct context lifecycle
- mandatory provider-specific tokenizers

Not part of v0.3.4 specifically:

- summary generation;
- summary persistence;
- semantic selection;
- non-contiguous knapsack-style context packing;
- live model integration.

---

## 13. Learning goals

By the end of v0.3, a reader should be able to explain:

1. why durable history and model context are different objects;
2. why context capacity is explicit budget rather than message count;
3. why token estimation is a replaceable interface;
4. why tool-call/result exchanges are atomic causal units;
5. why large ToolResults need model-only projections;
6. why a planner should expose provenance;
7. why KeepRecent uses a contiguous suffix;
8. why summaries should be checkpoints rather than replacement history;
9. why progressive summarization should advance coverage monotonically;
10. why AgentLoop should depend on `ContextPlanner` rather than compaction implementation details.

---

## 14. Next increment — v0.3.5

The next problem is no longer:

```text
Which recent units fit?
```

v0.3.4 now answers that.

The next problem is:

```text
How can older omitted history still contribute important state
without reintroducing the entire historical token cost?
```

v0.3.5 introduces explicit checkpoint artifacts:

```text
old history
     ↓
ContextSummary
     │
     ├── id
     ├── content
     ├── coverage boundary
     ├── estimated tokens
     └── createdAt
     ↓
SummaryStore
```

The key rule remains:

> A summary is a derived checkpoint over durable history. It is not permission to delete that history.
