# mini-pi-agent v0.3

## 1. Version identity

- **Branch:** `v0.3`
- **Theme:** context budget, causal context units, tool-result reduction, and explicit compaction
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

## 3. Target architecture

```text
Agent history
    │
    ▼
ContextUnitBuilder
    │
    ▼
ContextPlanner
    │
    ├── TokenEstimator
    ├── ContextBudget
    ├── ToolResultReducer
    ├── SummaryStore
    └── CompactionPolicy
    │
    ▼
PreparedContext
    │
    ▼
LLMProvider
```

`AgentLoop` should eventually depend on the planner contract, not on individual compaction strategies.

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

Core model:

```text
inputBudget
=
contextWindow
- outputReserve
- safetyMargin
```

Key properties:

- budget components are validated;
- reserves must leave a positive input budget;
- overflow is explicit through `ContextBudgetExceededError`;
- token estimation is deterministic and provider/network independent;
- message framing and tool-call metadata contribute to the estimate;
- `AgentLoop` remains unchanged at this stage.

---

## 5. v0.3.2 — ContextUnitBuilder + ToolExchange atomicity ✅

Implemented:

```text
src/context/units.ts
tests/context-units.test.ts
```

Additional error:

```text
InvalidContextHistoryError
```

The runtime can lift raw message history into causal units:

```ts
type ContextUnit =
  | UserContextUnit
  | AssistantContextUnit
  | ToolExchangeContextUnit;
```

The most important unit is:

```text
ToolExchangeContextUnit
=
AssistantMessage(toolCalls)
+
matching ToolResultMessage[]
```

Tool results may complete in an order different from the assistant's declared call order. The unit preserves the actual history order while matching by `toolCallId`.

### Atomicity invariant

> A later context policy must not retain an assistant tool call while silently dropping its corresponding observation merely because a raw-message cutoff crossed the exchange boundary.

### Invalid-history rules

The builder rejects:

- orphan `ToolResultMessage`;
- unknown tool-call ids inside an open exchange;
- duplicate tool-call ids;
- duplicate results;
- result `toolName` mismatch;
- user/assistant messages inserted before an exchange completes.

A trailing incomplete exchange may be represented explicitly with:

```text
complete = false
missingToolCallIds = [...]
```

Strict consumers can reject such history through `allowIncompleteFinalToolExchange: false`.

For valid history:

```text
flattenContextUnits(buildContextUnits(history))
==
history
```

---

## 6. v0.3.3 — ToolResultReducer ✅

Implemented:

```text
src/context/tool-result-reducer.ts
src/context/errors.ts
src/context/index.ts

tests/tool-result-reducer.test.ts
```

New public contracts:

```ts
interface ToolResultReducer {
  reduce(message: ToolResultMessage): ToolResultReduction;
}

class HeadTailToolResultReducer implements ToolResultReducer
```

Default policy:

```text
thresholdChars = 20,000
headChars      =  8,000
tailChars      =  8,000
```

Large observations become an explicit model-only projection:

```text
[mini-pi-agent tool result reduced for model context]
tool_call_id=call_1
tool_name=read
original_chars=36000
kept_head_chars=8000
kept_tail_chars=8000
omitted_chars=20000

--- head ---
...
--- omitted 20000 chars ---
--- tail ---
...
```

### Reduction invariants

```text
Durable ToolResultMessage
      unchanged

ToolResultReduction.message
      model-visible copy
```

- reducer never mutates the source `ToolResultMessage`;
- `toolCallId`, `toolName`, `isError`, and `timestamp` are preserved;
- small observations remain semantically unchanged;
- truncation is explicit, never silent;
- reduction is deterministic;
- Unicode is counted/sliced by code point rather than raw UTF-16 code unit;
- configuration is validated through `InvalidToolResultReductionOptionsError`;
- if reduction metadata would make the result larger than the source, the reducer returns an unreduced copy rather than falsely claiming reduction;
- `AgentLoop` is still unchanged.

The reducer intentionally acts on a single `ToolResultMessage`. The future planner decides when and where to apply it.

---

## 7. Current public context primitives

```ts
ContextBudget
ResolvedContextBudget
resolveContextBudget()
assertWithinContextBudget()

ContextError
InvalidContextBudgetError
ContextBudgetExceededError
InvalidContextHistoryError
InvalidToolResultReductionOptionsError

TokenEstimator
ApproximateTokenEstimator
estimatePreparedInput()

ContextUnit
UserContextUnit
AssistantContextUnit
ToolExchangeContextUnit
buildContextUnits()
flattenContextUnits()

ToolResultReducer
ToolResultReduction
ToolResultReductionOptions
ResolvedToolResultReductionOptions
HeadTailToolResultReducer
resolveToolResultReductionOptions()
```

The existing `src/core/context.ts` seam remains for compatibility until later AgentLoop integration.

---

## 8. Why reduction comes before the planner

Context units solve **causal boundaries**, but one valid unit may still contain an enormous observation.

Example:

```text
Assistant(read huge.log)
ToolResult(2 MB)
```

This is causally valid but still unsuitable for a bounded model context.

Therefore v0.3.3 establishes a projection rule before v0.3.4 starts choosing which units fit the budget.

The planner will eventually be able to reason over:

```text
ContextUnit[]
      ↓
ToolResultReducer
      ↓
reduced model-visible copies
      ↓
budget estimation
      ↓
selection
```

---

## 9. Summary model remains future work

A summary should act like a checkpoint with explicit identity and coverage:

```text
Goal
Decisions
Constraints
Important findings
Files / artifacts changed
Current state
Open work
```

Preferred progression:

```text
messages 0..100 → S1
S1 + messages 101..170 → S2
S2 + messages 171..240 → S3
```

Do not repeatedly summarize the entire history.

---

## 10. Implementation stages

```text
v0.3.1  ContextBudget + ApproximateTokenEstimator        ✅ implemented
v0.3.2  ContextUnitBuilder + ToolExchange atomicity      ✅ implemented
v0.3.3  ToolResultReducer                                ✅ implemented
v0.3.4  PreparedContext + KeepRecentPlanner              ← next
v0.3.5  ContextSummary + SummaryStore
v0.3.6  ProgressiveSummaryPolicy + ContextSummarizer
v0.3.7  AgentLoop integration + events + examples
```

The order is intentional:

```text
budget
  ↓
causal units
  ↓
large-output reduction
  ↓
selection planner
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
src/context/index.ts

tests/context-budget.test.ts
tests/token-estimator.test.ts
tests/context-units.test.ts
tests/tool-result-reducer.test.ts
```

Existing seam retained:

```text
src/core/context.ts
```

`AgentLoop` is intentionally not modified yet.

---

## 12. Verification status

The v0.3.1-v0.3.3 source subsets were checked with the repository's strict TypeScript rules:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Local smoke validation verified:

```text
128000 - 12000 - 4000 = 112000

trailing partial exchange
→ complete=false

partial exchange + later user message
→ InvalidContextHistoryError

1000 emoji tool result
→ originalChars=1000
→ keptHeadChars=20
→ keptTailChars=20
→ omittedChars=960
→ source ToolResult unchanged
→ Unicode slicing remains valid
```

The full repository Vitest suite is not claimed as run in this environment because package installation/network access was unavailable.

---

## 13. Learning goals

By the end of v0.3, a reader should be able to explain:

1. why durable history and model context must diverge;
2. why context is a budgeted resource;
3. why token estimation is an interface;
4. why tool-call/result groups are causal units;
5. why an in-progress exchange differs from corrupt history;
6. why large tool output needs an explicit model-only projection;
7. why summaries are checkpoints rather than replacement history;
8. why progressive summarization is preferable to re-summarizing the full log;
9. why context planning belongs outside persistence;
10. why AgentLoop should depend on a planner contract rather than compaction details.

---

## 14. Explicit non-goals

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

---

## 15. Next increment

`v0.3.4` introduces the first real context planner:

```text
complete durable history
        ↓
buildContextUnits()
        ↓
reduce oversized observations
        ↓
KeepRecentPlanner
        ↓
PreparedContext
```

The next question is:

> Given causal units, a token estimator, a budget, and a safe reduction policy, which newest complete units should the model actually see?

The planner must answer that without mutating durable history, splitting complete exchanges, or silently overflowing the resolved input budget.
