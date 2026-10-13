# v0.3 Implementation Plan

This document defines the staged implementation order for `v0.3`.

Primary invariant:

> Durable session history remains complete; model-visible context is a budgeted projection.

Do not skip ahead to summarization or AgentLoop integration before lower-level context primitives are stable and tested.

---

## v0.3.1 — ContextBudget + ApproximateTokenEstimator ✅ implemented

### Goal

Make model-input capacity explicit before introducing selection or compaction policy.

### Implemented

```text
src/context/budget.ts
src/context/errors.ts
src/context/estimator.ts
src/context/index.ts

tests/context-budget.test.ts
tests/token-estimator.test.ts
```

### Invariants

```text
inputBudget = contextWindow - outputReserve - safetyMargin
```

- deterministic, network-independent estimation;
- invalid budgets fail explicitly;
- tool-call metadata contributes to estimation;
- no AgentLoop behavior change yet.

---

## v0.3.2 — ContextUnitBuilder + ToolExchange atomicity ✅ implemented

### Goal

Stop treating every raw message as an independently discardable context item.

### Implemented

```text
src/context/units.ts
tests/context-units.test.ts
```

### Data model

```ts
type ContextUnit =
  | UserContextUnit
  | AssistantContextUnit
  | ToolExchangeContextUnit;
```

A tool exchange groups:

```text
AssistantMessage(toolCalls)
        +
matching ToolResultMessage(s)
```

### Invariants

- complete exchanges are causal units;
- tool results may arrive out of declaration order;
- a trailing partial exchange can be represented explicitly;
- orphan, duplicate, mismatched, or interleaved tool history is rejected;
- valid history round-trips through `buildContextUnits()` / `flattenContextUnits()`.

---

## v0.3.3 — ToolResultReducer ✅ implemented

### Goal

Reduce oversized environment observations only in model-visible context while preserving durable source messages unchanged.

### Implemented

```text
src/context/tool-result-reducer.ts
src/context/errors.ts
src/context/index.ts

tests/tool-result-reducer.test.ts
```

### Reference implementation

```ts
class HeadTailToolResultReducer implements ToolResultReducer
```

Default policy:

```text
thresholdChars = 20_000
headChars      =  8_000
tailChars      =  8_000
```

### Invariants

- durable ToolResultMessage is never mutated;
- model projection is explicit and deterministic;
- tool identity and error state are preserved;
- Unicode is sliced by code point;
- invalid options fail explicitly;
- a reduction is only reported when the model-visible result is actually smaller.

---

## v0.3.4 — PreparedContext + KeepRecentPlanner ✅ implemented

### Goal

Build the first complete provider-facing context projection under a resolved budget.

### Implemented

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

### Pipeline

```text
durable history
      ↓
buildContextUnits(strict complete exchanges)
      ↓
project ToolResults through ToolResultReducer
      ↓
estimate projected units
      ↓
start at newest unit and walk backward
      ↓
stop at first unit that does not fit
      ↓
restore chronological order
      ↓
PreparedContext
```

### Selection rule

`KeepRecentContextPlanner` selects one **contiguous suffix of complete context units**.

It does not skip a middle unit just because an older/smaller unit could fit. This preserves temporal continuity and keeps the first policy easy to reason about.

### Failure policy

- if the system prompt alone exceeds the resolved input budget: fail with `ContextBudgetExceededError`;
- if the newest complete atomic unit cannot fit even after ToolResult reduction: fail with `ContextBudgetExceededError`;
- if durable history ends in an incomplete tool exchange: reject before provider-context preparation;
- if the AbortSignal is already cancelled or becomes cancelled while selecting units: propagate cancellation.

### Provenance

`ContextProvenance` records:

```text
sourceMessageCount
sourceUnitCount
selectedMessageCount
selectedUnitCount
omittedMessageCount
omittedUnitCount
selectedStartMessageIndex
reducedToolResults[]
```

`reducedToolResults[]` preserves model-projection evidence such as original/visible/omitted character counts.

### Core invariants

- prepared input fits `ResolvedContextBudget.inputBudget`;
- system prompt is never silently truncated;
- causal tool exchanges are never split;
- selection remains chronological;
- selected history is a contiguous recent suffix;
- ToolResult reduction affects copies only;
- durable history remains byte-for-byte/structurally unchanged;
- `compacted=true` if units were omitted or ToolResults were reduced;
- planner does not write SessionStore and does not call the LLM;
- AgentLoop remains unchanged until v0.3.7.

### Verification performed

- strict TypeScript compilation passed under `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`;
- selection smoke verified budget 6 selects `mid + new` from `[oldold, mid, new]`;
- reducer/planner smoke verified a 1000-character ToolResult is projected to 259 visible characters, with `omittedChars=960`, while source history remains unchanged.

The full Vitest suite is not claimed as run in the current environment.

---

## v0.3.5 — ContextSummary + SummaryStore ← next

### Goal

Represent summaries as explicit checkpoint artifacts instead of anonymous replacement prose.

### Add

```text
src/context/summary.ts
src/context/summary-store.ts

tests/context-summary.test.ts
tests/summary-store.test.ts
```

### Target model

```ts
interface ContextSummary {
  id: string;
  content: string;
  coversThroughMessageIndex: number;
  estimatedTokens: number;
  createdAt: number;
}

interface SummaryStore {
  getLatest(): Promise<ContextSummary | undefined>;
  put(summary: ContextSummary): Promise<void>;
  clear(): Promise<void>;
}
```

### Invariants

- summary identity is explicit;
- coverage boundary is explicit;
- summaries never delete or replace durable session history;
- store semantics are deterministic and testable without a live model;
- a summary is a checkpoint artifact, not a new message secretly inserted into durable history.

---

## v0.3.6 — ProgressiveSummaryPolicy + ContextSummarizer

### Goal

Compact old history incrementally instead of repeatedly summarizing the full log.

```text
messages 0..100 → S1
S1 + messages 101..170 → S2
S2 + messages 171..240 → S3
```

### Add

```text
src/context/summarizer.ts
src/context/policies/progressive-summary.ts

tests/progressive-compaction.test.ts
tests/context-cancellation.test.ts
```

### Invariants

- checkpoint coverage is monotonic;
- only newly covered history is added to the next summary step;
- cancellation propagates into summarization;
- durable history stays complete.

---

## v0.3.7 — AgentLoop integration + events + example

### Goal

Use the completed planner only at the model-call boundary.

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

### Add/update

```text
src/core/agent-loop.ts
src/core/agent.ts
src/core/events.ts
examples/07-context-compaction.ts
tests/agent-context-integration.test.ts
```

### Final Definition of Done

- [x] budget and estimator primitives
- [x] causal context units
- [x] explicit tool-result reduction
- [x] budgeted planner
- [ ] summary checkpoints
- [ ] progressive compaction
- [ ] summarization cancellation semantics
- [ ] AgentLoop integration
- [ ] context lifecycle events
- [ ] deterministic integration tests
- [ ] educational example
- [ ] package/version/docs finalization

Only after all applicable items pass should `v0.3` be frozen as a historical learning snapshot.
