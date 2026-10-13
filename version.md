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

The runtime can now lift raw message history into causal units:

```ts
type ContextUnit =
  | UserContextUnit
  | AssistantContextUnit
  | ToolExchangeContextUnit;
```

The most important new unit is:

```text
ToolExchangeContextUnit
=
AssistantMessage(toolCalls)
+
matching ToolResultMessage[]
```

Example:

```text
Assistant
  tool_call call_a: read(a.txt)
  tool_call call_b: read(b.txt)

ToolResult call_b
ToolResult call_a

        ↓

one ToolExchangeContextUnit
complete = true
```

Tool results may complete in an order different from the assistant's declared call order. The unit preserves the actual history order while matching by `toolCallId`.

### Atomicity invariant

> A later context policy must not retain an assistant tool call while silently dropping its corresponding observation merely because a raw-message cutoff crossed the exchange boundary.

### Invalid history rules

The builder rejects:

- orphan `ToolResultMessage`;
- a result referencing an unknown tool-call id inside an open exchange;
- duplicate tool-call ids;
- duplicate results for one tool-call id;
- result `toolName` that disagrees with the declared call;
- user/assistant messages inserted before an exchange is complete.

### In-progress history rule

A tool exchange is allowed to be incomplete only when it is the trailing unit of history:

```text
Assistant(call_a, call_b)
ToolResult(call_a)
<end of durable history>
```

It becomes:

```text
complete = false
missingToolCallIds = ["call_b"]
```

This represents a recoverable/in-progress durable state, for example after interruption or crash recovery.

Strict consumers may call:

```ts
buildContextUnits(history, {
  allowIncompleteFinalToolExchange: false
});
```

and reject such history explicitly.

### Round-trip invariant

For valid history:

```text
flattenContextUnits(buildContextUnits(history))
==
history
```

The builder reorganizes context semantics without mutating historical content.

---

## 6. Current public context primitives

```ts
ContextBudget
ResolvedContextBudget
resolveContextBudget()
assertWithinContextBudget()

ContextError
InvalidContextBudgetError
ContextBudgetExceededError
InvalidContextHistoryError

TokenEstimator
ApproximateTokenEstimator
estimatePreparedInput()

ContextUnit
UserContextUnit
AssistantContextUnit
ToolExchangeContextUnit
buildContextUnits()
flattenContextUnits()
```

The existing `src/core/context.ts` seam remains for compatibility until later AgentLoop integration.

---

## 7. Why context units come before the planner

A naïve policy such as:

```ts
messages.slice(-20)
```

can produce invalid provider context:

```text
Assistant
  call_a
  call_b

ToolResult call_a

# ToolResult call_b was cut off
```

Therefore v0.3 first establishes causal units. Only then can a budget policy select or omit history safely.

The planner should eventually operate on:

```text
ContextUnit[]
```

rather than independently discardable raw messages.

---

## 8. Large tool-result policy — next

The next increment is `v0.3.3 — ToolResultReducer`.

Large environment observations can dominate model context even when causal unit boundaries are correct.

The durable session must retain the original result, while model-visible context may use an explicit reduced copy:

```text
[tool result reduced for model context]
original_chars=245812
kept_head_chars=8000
kept_tail_chars=8000

--- head ---
...

--- omitted ---
...

--- tail ---
...
```

Required invariant:

```text
durable ToolResultMessage
      unchanged

prepared/model copy
      may be reduced explicitly
```

Silent truncation is forbidden.

---

## 9. Later summary model

Summaries remain future work in this branch.

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
v0.3.3  ToolResultReducer                                ← next
v0.3.4  PreparedContext + KeepRecentPlanner
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
src/context/index.ts

tests/context-budget.test.ts
tests/token-estimator.test.ts
tests/context-units.test.ts
```

Existing seam retained:

```text
src/core/context.ts
```

`AgentLoop` is intentionally not modified yet.

---

## 12. Verification status

The v0.3.1 and v0.3.2 source subsets were checked with the repository's strict TypeScript rules:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Local smoke validation also verified:

```text
128000 - 12000 - 4000 = 112000

trailing partial exchange
→ complete=false
→ missingToolCallIds is explicit

partial exchange + later user message
→ InvalidContextHistoryError
```

The `context-units` test source also passed TypeScript checking with a temporary Vitest type shim.

The full repository Vitest suite is not claimed as run in this environment because package installation/network access was unavailable.

---

## 13. Learning goals

By the end of v0.3, a reader should be able to explain:

1. why durable history and model context must diverge;
2. why context is a budgeted resource;
3. why token estimation is an interface;
4. why tool-call/result groups are causal units;
5. why an in-progress exchange differs from corrupt history;
6. why large tool output needs explicit reduction;
7. why summaries are checkpoints rather than replacement history;
8. why progressive summarization is preferable to re-summarizing the full log;
9. why context planning belongs outside persistence;
10. why AgentLoop should depend on a planner contract rather than compaction policy details.

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

`v0.3.3` introduces `ToolResultReducer`.

The next question is no longer:

```text
Which messages belong together?
```

v0.3.2 now answers that.

The next question is:

```text
What happens when one causally valid ToolResultMessage is itself far too large for the model budget?
```

The answer must preserve the original durable observation while producing an explicit, deterministic, model-only reduced representation.
