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

Additional error:

```text
InvalidContextHistoryError
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

Valid complete exchange:

```text
Assistant(call_a, call_b)
ToolResult(call_b)
ToolResult(call_a)

→ one ToolExchangeContextUnit
→ complete = true
```

Valid trailing in-progress exchange:

```text
Assistant(call_a, call_b)
ToolResult(call_a)
<end history>

→ complete = false
→ missingToolCallIds = [call_b]
```

Invalid history:

- orphan tool result;
- unknown tool-call id inside an open exchange;
- duplicate tool-call id;
- duplicate result;
- mismatched `toolName`;
- user/assistant message before an exchange completes.

### Core invariant

> Context selection must never split a complete tool exchange merely because a raw-message boundary crosses it.

### Round trip

For valid history:

```text
flattenContextUnits(buildContextUnits(history))
==
history
```

### Verification

- strict TypeScript source checking passed;
- test source passed TypeScript checking with a temporary Vitest type shim;
- runtime smoke verified trailing partial exchange metadata;
- runtime smoke verified interleaved non-tool history is rejected.

The full Vitest suite is not claimed as run in the current environment.

---

## v0.3.3 — ToolResultReducer ← next

### Goal

Reduce oversized environment observations only in model-visible context while preserving durable source messages unchanged.

### Add

```text
src/context/tool-result-reducer.ts
tests/tool-result-reducer.test.ts
```

### Reference policy

Use explicit deterministic head/tail reduction:

```text
[tool result reduced for model context]
original_chars=...
kept_head_chars=...
kept_tail_chars=...

--- head ---
...
--- omitted ---
...
--- tail ---
...
```

### Required contracts

Likely shape:

```ts
interface ToolResultReducer {
  reduce(message: ToolResultMessage): ToolResultMessage;
}
```

The implementation may use an options object for thresholds and head/tail sizes.

### Invariants

- original durable message is never mutated;
- small results are returned unchanged or semantically identical;
- reduction is explicit, never silent;
- reduction is deterministic;
- `toolCallId`, `toolName`, `isError`, and timestamp identity remain intact;
- reduced content remains traceable to original size;
- no AgentLoop integration yet.

---

## v0.3.4 — PreparedContext + KeepRecentPlanner

### Goal

Create the first planner that produces provider-facing context under a budget.

### Add

```text
src/context/types.ts
src/context/planner.ts
src/context/policies/keep-recent.ts

tests/context-planner.test.ts
```

### Target API

```ts
interface PreparedContext {
  systemPrompt: string;
  messages: AgentMessage[];
  estimatedInputTokens: number;
  compacted: boolean;
  provenance: ContextProvenance;
}

interface ContextPlanner {
  prepare(input: ContextPlannerInput): Promise<PreparedContext>;
}
```

### Policy

- build causal context units;
- start from newest complete units;
- walk backward until the resolved input budget is filled;
- use ToolResultReducer for oversized observations;
- do not summarize yet.

### Invariants

- prepared context fits budget;
- system prompt is never silently truncated;
- complete causal unit boundaries are preserved;
- durable history is never mutated;
- provenance explains selection/reduction/omission.

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
- [ ] explicit tool-result reduction
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
