# mini-pi-agent v0.3

## 1. Version identity

- **Branch:** `v0.3`
- **Base:** created from the latest `main` design state
- **Theme:** context budget, context planning, tool-result reduction, and explicit compaction
- **Previous version:** `v0.2`
- **Target package version:** `0.3.0`
- **Status:** active design snapshot; implementation intentionally staged

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

The first implementation may use a deterministic approximate estimator. Provider-specific exact tokenizers are not required for the reference mechanism.

---

## 8. Large tool-result policy

Large tool output is a first-class source of context pressure.

The durable session keeps the full result.

The prepared context may replace a huge observation with an explicit reduction such as:

```text
[tool result reduced]
original characters: 245812
kept head: 8000
kept tail: 8000

--- head ---
...

--- omitted ---
...

--- tail ---
...
```

The reduction must be explicit; silent truncation is forbidden.

---

## 9. Summary checkpoints

A summary is not a replacement for durable history. It is a derived checkpoint.

Recommended structured summary fields:

```text
Goal
Decisions
Constraints
Files / artifacts changed
Important tool findings
Current state
Open work
```

Summary provenance must identify the covered historical range/identity so later planners can explain what was compacted.

---

## 10. Progressive compaction

Preferred long-running pattern:

```text
messages 0..100
      ↓
    summary S1

S1 + messages 101..170
      ↓
    summary S2

S2 + messages 171..240
      ↓
    summary S3
```

Do not repeatedly summarize the entire lifetime from raw history if an incremental checkpoint can be reused.

This resembles:

```text
event log + snapshot/checkpoint
```

without turning v0.3 into the later v0.7 session-tree system.

---

## 11. What remains unchanged

v0.3 must preserve the semantics of earlier layers:

- provider-neutral `AgentMessage`;
- `LLMProvider` boundary;
- Tool and ToolRegistry contracts;
- scheduling semantics from v0.2 when present;
- session persistence as source of truth;
- steering/follow-up behavior;
- cancellation propagation;
- event-driven observability.

Context planning must wrap these mechanisms, not rewrite them.

---

## 12. Explicit non-goals

v0.3 does **not** implement:

- vector database memory;
- embedding retrieval as the default compaction strategy;
- generic RAG framework;
- Skills (`v0.4`);
- Extensions/hooks (`v0.5`);
- MCP (`v0.6`);
- session branching/tree semantics (`v0.7`);
- permission/sandbox (`v0.8`);
- RPC runtime separation (`v0.9`);
- provider-perfect tokenizer support for every model.

---

## 13. Planned source structure

```text
src/context/
├── types.ts
├── budget.ts
├── estimator.ts
├── units.ts
├── planner.ts
├── tool-result-reducer.ts
├── summary.ts
├── summary-store.ts
├── summarizer.ts
└── policies/
    ├── keep-recent.ts
    └── progressive-summary.ts
```

The old `src/core/context.ts` should shrink into compatibility/export glue or be migrated deliberately. It must not become a god module.

---

## 14. Implementation sequence

```text
v0.3.1  TokenEstimator + ContextBudget
v0.3.2  ContextUnitBuilder + atomic tool exchanges
v0.3.3  ToolResultReducer
v0.3.4  PreparedContext + KeepRecentPlanner
v0.3.5  Summary artifact + SummaryStore
v0.3.6  ProgressiveSummaryPolicy + deterministic summarizer
v0.3.7  Agent-loop integration + events + example
```

Each increment must add focused tests before moving to the next.

---

## 15. Required tests

At minimum:

- budget arithmetic;
- deterministic approximate token estimation;
- tool call/result atomicity;
- large tool-result reduction with explicit omission marker;
- durable history remains unchanged after planning;
- prepared context stays within configured budget or returns a clear unsatisfied-budget error;
- summary provenance covers the intended range;
- repeated planning can reuse a summary checkpoint;
- cancellation reaches summarizer work;
- Agent integration sends prepared context to the provider while session history stays complete.

No unit test should require a paid/live model.

---

## 16. Educational examples

Planned examples:

```text
examples/07-context-budget.ts
examples/08-tool-result-reduction.ts
examples/09-progressive-compaction.ts
```

The end-to-end example should demonstrate a long synthetic session whose full history is much larger than the model-visible context.

---

## 17. Definition of Done

v0.3 is complete only when:

- [ ] `ContextPlanner` is the stable model-context boundary;
- [ ] a deterministic estimator exists;
- [ ] budget calculation is explicit and tested;
- [ ] tool exchanges are kept semantically valid;
- [ ] large observations can be reduced without mutating durable history;
- [ ] at least one summary/checkpoint strategy exists;
- [ ] summary provenance is explicit;
- [ ] planner decisions are observable through events/metadata;
- [ ] failure behavior for impossible budgets is explicit;
- [ ] deterministic tests pass;
- [ ] integration example demonstrates long-running compaction;
- [ ] README/architecture docs explain the history/context distinction;
- [ ] validated implementation is synchronized to `main` before freeze.

---

## 18. Next version

v0.4 adds Skills on top of the context system:

```text
Skill descriptors
       ↓
progressive loading
       ↓
context supplements
       ↓
ContextPlanner
       ↓
model-visible knowledge
```

That sequencing is deliberate: Skills increase available knowledge, so context budgeting must exist first.
