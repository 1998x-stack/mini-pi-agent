# mini-pi-agent v0.3

## 1. Version identity

- **Branch:** `v0.3`
- **Base:** created from the latest `main` design state
- **Theme:** context budget, context planning, tool-result reduction, and explicit compaction
- **Previous version:** `v0.2`
- **Target package version:** `0.3.0`
- **Status:** active implementation snapshot

This branch is the canonical learning snapshot for the v0.3 mental model.

> **The durable conversation/session history is the source of truth. The model-visible context is a temporary, budgeted projection of that history.**

The branch may contain design work before all v0.2 runtime code has been integrated. Do not misrepresent planned v0.3 mechanisms as implemented until the acceptance tests described below exist and pass.

---

## 2. Core difference from v0.2

v0.2 focuses on asynchronous execution mechanics:

```text
provider stream
    ↓
assistant-message assembly
    ↓
tool scheduling
    ↓
ordered observations
```

v0.3 introduces a different problem:

```text
complete durable history
          ↓
    ContextPlanner
          ↓
  budgeted projection
          ↓
         LLM
```

The architectural shift is:

```text
BEFORE
runtime messages == model messages

AFTER
runtime history ───────────────► durable source of truth
       │
       └── ContextPlanner ─────► model-visible context
```

---

## 3. Primary mental model

Three objects must remain distinct:

```text
Runtime State
────────────────────────────
current run id
turn number
queues
active cancellation
active tools

Durable Session History
────────────────────────────
append-only messages/events
full tool results
historical truth

Model Context
────────────────────────────
selected recent messages
summaries/checkpoints
reduced large observations
bounded token estimate
```

Compaction means reducing **model-visible context pressure**. It does **not** mean deleting historical truth.

---

## 4. Main new subsystem

v0.3 evolves the small v0.1 `ContextTransform` seam into an explicit context-planning subsystem.

Target architecture:

```text
Agent history
    │
    ▼
ContextPlanner
    │
    ├── TokenEstimator
    ├── ContextBudget
    ├── ContextUnitBuilder
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

The Agent Loop should depend on the planner interface, not on individual compaction strategies.

---

## 5. Target interfaces

The exact syntax may evolve during implementation, but responsibilities should remain stable.

```ts
export interface TokenEstimator {
  estimateText(text: string): number;
  estimateSystem(text: string): number;
  estimateMessage(message: AgentMessage): number;
  estimateMessages(messages: readonly AgentMessage[]): number;
}

export interface ContextBudget {
  contextWindow: number;
  outputReserve: number;
  safetyMargin: number;
}

export interface PreparedContext {
  systemPrompt: string;
  messages: AgentMessage[];
  estimatedInputTokens: number;
  compacted: boolean;
  provenance: ContextProvenance;
}

export interface ContextPlanner {
  prepare(input: {
    systemPrompt: string;
    history: readonly AgentMessage[];
    budget: ContextBudget;
    signal: AbortSignal;
  }): Promise<PreparedContext>;
}
```

The planner owns model-context construction. It does not own durable persistence.

---

## 6. Context units and atomicity

A context budget must not slice the history arbitrarily by message count.

Important logical units include:

```text
UserMessage

AssistantMessage without tool calls

AssistantMessage with ToolCall[]
        +
corresponding ToolResultMessage[]

Summary checkpoint
```

Invariant:

> If an assistant tool call is visible to the model, its relevant tool result must not be silently removed from the same prepared context.

This is why `TailContextTransform(maxMessages)` is useful only as an early teaching seam, not the final v0.3 policy.

---

## 7. Budget model

Effective input budget:

```text
inputBudget
=
contextWindow
- outputReserve
- safetyMargin
```

The planner should expose estimates for observability:

```text
before estimate
selected recent estimate
summary estimate
reduced-tool estimate
final estimate
```

The first implementation uses a deterministic approximate estimator. Provider-specific exact tokenizers are not required for the reference mechanism.

### v0.3.1 implemented

The first code increment is now present:

- [x] `ContextBudget`
- [x] `ResolvedContextBudget`
- [x] `resolveContextBudget()`
- [x] `assertWithinContextBudget()`
- [x] `ContextError`
- [x] `InvalidContextBudgetError`
- [x] `ContextBudgetExceededError`
- [x] `TokenEstimator`
- [x] `ApproximateTokenEstimator`
- [x] `estimatePreparedInput()`
- [x] public exports from `src/index.ts`
- [x] budget unit tests
- [x] estimator unit tests

The estimator is intentionally approximate and deterministic. It exists to teach the budget lifecycle and keep tests provider/network independent.

---

## 8. Large tool-result policy

Large tool output is a first-class source of context pressure.

The durable session keeps the full result.

The prepared context may replace a huge observation with an explicit reduction such as:

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

The reduction marker must be explicit. Silent truncation is forbidden.

---

## 9. Summary as checkpoint

A summary should preserve operational state, not merely produce prose.

Recommended structure:

```text
Goal
Decisions
Constraints
Important findings
Files / artifacts changed
Current state
Open work
```

A summary should have identity, coverage, token estimate and provenance so later compaction can reason about it explicitly.

---

## 10. Progressive compaction

Do not repeatedly summarize the entire history.

Preferred progression:

```text
messages 0..100 → S1

S1 + messages 101..170 → S2

S2 + messages 171..240 → S3
```

This makes summaries act like checkpoints over an append-only log.

---

## 11. Planned implementation stages

```text
v0.3.1  ContextBudget + ApproximateTokenEstimator        ✅ implemented
v0.3.2  ContextUnitBuilder + ToolExchange atomicity      ← next
v0.3.3  ToolResultReducer
v0.3.4  PreparedContext + KeepRecentPlanner
v0.3.5  ContextSummary + SummaryStore
v0.3.6  ProgressiveSummaryPolicy + ContextSummarizer
v0.3.7  AgentLoop integration + events + examples
```

Do not skip directly to summarization. The planner first needs stable units and deterministic accounting.

---

## 12. Important source files

Current v0.3.1 additions:

```text
src/context/budget.ts
src/context/errors.ts
src/context/estimator.ts
src/context/index.ts
tests/context-budget.test.ts
tests/token-estimator.test.ts
```

Existing seam retained for compatibility until later integration:

```text
src/core/context.ts
```

The next stage should add context-unit modeling without modifying AgentLoop.

---

## 13. Learning goals

By the end of v0.3, a reader should be able to explain:

1. why history and model context must diverge;
2. why context is a budgeted resource;
3. why token estimation is an interface rather than a provider detail;
4. why tool-call/result groups must remain causally coherent;
5. why large tool output needs explicit reduction;
6. why summaries are checkpoints rather than replacement history;
7. why progressive summarization is preferable to repeatedly summarizing the full log;
8. why context planning belongs outside durable persistence;
9. why the AgentLoop should only depend on a planner contract;
10. how later Skills can participate in the same budget system.

---

## 14. Explicit non-goals

Not part of v0.3:

- Skills
- Extensions
- MCP
- session DAG/branching
- permissions/sandbox
- RPC
- vector database memory platform
- semantic retrieval as a replacement for context lifecycle
- mandatory provider-specific tokenizers

---

## 15. Current verification status

For v0.3.1, the source subset was checked under the repository's strict TypeScript rules, including:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

A local runtime smoke check also verified:

```text
128000 - 12000 - 4000 = 112000 input budget
budget overflow throws ContextBudgetExceededError
system + message estimation is deterministic
```

The full repository Vitest suite has not been claimed as run in this environment because package installation/network access was unavailable here.

---

## 16. Next increment

`v0.3.2` introduces `ContextUnitBuilder` and the first causal-atomicity model:

```text
AssistantMessage(toolCalls)
          +
matching ToolResultMessage(s)
          ↓
    ToolExchangeUnit
```

The next invariant to prove is:

> Context selection must not leave a visible tool call without its corresponding observation merely because a raw message boundary crossed the budget cutoff.
