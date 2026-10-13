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
inputBudget
=
contextWindow
- outputReserve
- safetyMargin
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

### Implemented semantics

- complete exchanges are one causal unit;
- tool results may arrive in a different order from declaration;
- trailing partial exchanges are represented explicitly with `complete=false`;
- orphan, duplicate, mismatched, or interleaved tool history is rejected;
- `flattenContextUnits(buildContextUnits(history))` reproduces valid durable history.

### Core invariant

> Context selection must never split a complete tool exchange merely because a raw-message boundary crosses it.

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

### Public contracts

```ts
interface ToolResultReducer {
  reduce(message: ToolResultMessage): ToolResultReduction;
}

interface ToolResultReduction {
  message: ToolResultMessage;
  reduced: boolean;
  originalChars: number;
  visibleChars: number;
  keptHeadChars: number;
  keptTailChars: number;
  omittedChars: number;
}
```

Reference implementation:

```ts
class HeadTailToolResultReducer implements ToolResultReducer
```

Default policy:

```text
thresholdChars = 20_000
headChars      =  8_000
tailChars      =  8_000
```

### Reduction shape

```text
[mini-pi-agent tool result reduced for model context]
tool_call_id=...
tool_name=...
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

### Invariants

- original durable message is never mutated;
- small results remain semantically unchanged;
- reduction is explicit, never silent;
- reduction is deterministic;
- `toolCallId`, `toolName`, `isError`, and timestamp remain intact;
- character counting/slicing uses Unicode code points;
- invalid reducer configuration throws `InvalidToolResultReductionOptionsError`;
- if provenance overhead would make the candidate projection larger than the source, the reducer leaves the message unreduced;
- no AgentLoop integration yet.

### Verification

- strict TypeScript source checking passed;
- runtime smoke verified source immutability;
- runtime smoke verified Unicode-safe head/tail slicing;
- runtime smoke verified explicit omitted-character accounting.

The full Vitest suite is not claimed as run in the current environment.

---

## v0.3.4 — PreparedContext + KeepRecentPlanner ← next

### Goal

Create the first planner that produces provider-facing context under a resolved budget.

### Add

```text
src/context/types.ts
src/context/planner.ts
src/context/policies/keep-recent.ts

tests/context-planner.test.ts
```

### Target API

```ts
interface ContextProvenance {
  originalMessageCount: number;
  selectedUnitCount: number;
  omittedUnitCount: number;
  reducedToolResultCount: number;
}

interface PreparedContext {
  systemPrompt: string;
  messages: AgentMessage[];
  estimatedInputTokens: number;
  compacted: boolean;
  provenance: ContextProvenance;
}

interface ContextPlannerInput {
  systemPrompt: string;
  history: readonly AgentMessage[];
  budget: ContextBudget;
  signal: AbortSignal;
}

interface ContextPlanner {
  prepare(input: ContextPlannerInput): Promise<PreparedContext>;
}
```

### First policy

```text
history
  ↓
buildContextUnits()
  ↓
reduce oversized tool results in model-only copies
  ↓
start from newest complete unit
  ↓
walk backward while budget fits
  ↓
flatten selected units
  ↓
PreparedContext
```

No summaries yet.

### Key design question

An incomplete trailing tool exchange represents active/recoverable runtime state. The planner must define whether it is always retained, rejected, or retained only under a dedicated policy. This must be explicit rather than accidental.

### Invariants

- prepared context fits the resolved input budget;
- system prompt is never silently truncated;
- complete causal unit boundaries are preserved;
- durable history is never mutated;
- reduction affects only model-visible copies;
- selection order remains chronological after walking backward;
- provenance explains selection, omission, and reduction;
- impossible budgets fail explicitly rather than silently dropping required context.

---

## v0.3.5 — ContextSummary + SummaryStore

### Goal

Represent summaries as explicit checkpoint artifacts rather than anonymous prose.

### Add

```text
src/context/summary.ts
src/context/summary-store.ts

tests/context-summary.test.ts
tests/summary-store.test.ts
```

Suggested shape:

```ts
interface ContextSummary {
  id: string;
  content: string;
  coversThroughMessageIndex: number;
  estimatedTokens: number;
  createdAt: number;
}
```

### Invariants

- summary has explicit identity and coverage;
- summary never replaces/deletes durable history;
- deterministic fake summarizers can test the mechanism offline.

---

## v0.3.6 — ProgressiveSummaryPolicy + ContextSummarizer

### Goal

Compact old history incrementally instead of repeatedly summarizing the entire log.

### Progression

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

- existing checkpoint coverage is respected;
- only newly covered history is added to the next summary step;
- cancellation propagates into summarization;
- durable history remains complete.

---

## v0.3.7 — AgentLoop integration + events + examples

### Goal

Replace the teaching-only context seam with the completed planner contract at the model-call boundary.

### Integration model

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

### Must prove

```text
providerContext.length
<
durableHistory.length
```

when compaction is needed, while durable history remains unchanged.

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
- [ ] budgeted planner
- [ ] summary checkpoints
- [ ] progressive compaction
- [ ] cancellation semantics
- [ ] AgentLoop integration
- [ ] context lifecycle events
- [ ] deterministic integration tests
- [ ] educational example
- [ ] package/version/docs finalization

Only after all applicable items pass should `v0.3` be frozen as a historical learning snapshot.
