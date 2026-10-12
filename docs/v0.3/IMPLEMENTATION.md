# v0.3 Implementation Plan

This document defines the staged implementation order for `v0.3`.

The branch must preserve one dominant mental model:

> Durable session history remains complete; model-visible context is a budgeted projection.

Do not skip ahead to summarization or AgentLoop integration before lower-level context primitives are stable and tested.

---

## v0.3.1 — ContextBudget + ApproximateTokenEstimator ✅ implemented

### Goal

Make context capacity explicit before introducing selection or compaction policy.

### Implemented files

```text
src/context/budget.ts
src/context/errors.ts
src/context/estimator.ts
src/context/index.ts

tests/context-budget.test.ts
tests/token-estimator.test.ts
```

### Core contracts

```ts
interface ContextBudget {
  contextWindow: number;
  outputReserve: number;
  safetyMargin: number;
}

interface ResolvedContextBudget extends ContextBudget {
  inputBudget: number;
}

interface TokenEstimator {
  estimateText(text: string): number;
  estimateSystem(text: string): number;
  estimateMessage(message: AgentMessage): number;
  estimateMessages(messages: readonly AgentMessage[]): number;
}
```

### Invariants

```text
inputBudget
=
contextWindow
- outputReserve
- safetyMargin
```

- all budget components are non-negative integers;
- `contextWindow` must be positive;
- reserves must leave a positive input budget;
- overflow is represented by `ContextBudgetExceededError`;
- approximate estimation is deterministic and network independent;
- tool-call metadata contributes to the estimate;
- this stage does not mutate AgentLoop behavior.

### Verification performed in the implementation environment

- strict TypeScript subset compile passed with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`;
- runtime smoke check verified `128000 - 12000 - 4000 = 112000`;
- runtime smoke check verified overflow error fields;
- runtime smoke check verified deterministic prepared-input estimation.

The full repository Vitest suite is not claimed as run because dependency installation/network access was unavailable in the execution environment.

---

## v0.3.2 — ContextUnitBuilder + ToolExchange atomicity ← next

### Goal

Stop treating raw messages as independently discardable context items.

### Add

```text
src/context/units.ts
tests/context-units.test.ts
```

### Target model

```ts
type ContextUnit =
  | UserContextUnit
  | AssistantContextUnit
  | ToolExchangeContextUnit;
```

A tool exchange must group:

```text
AssistantMessage(toolCalls)
        +
matching ToolResultMessage(s)
```

### Core invariant

If a tool call is present in prepared model context, its matching result must not be silently removed merely because a raw message cutoff crossed the exchange boundary.

### Failure cases to define

- orphan `ToolResultMessage`;
- duplicate result for one tool-call id;
- assistant declares multiple tool calls but only some results are present;
- interleaved non-tool message before exchange completion.

Decide explicitly which cases are invalid history and which represent an in-progress exchange.

---

## v0.3.3 — ToolResultReducer

### Goal

Reduce oversized environment observations only in model-visible context.

### Add

```text
src/context/tool-result-reducer.ts
tests/tool-result-reducer.test.ts
```

### Reference policy

Use explicit head/tail reduction:

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

### Invariants

- durable source message remains unchanged;
- reduction is explicit, never silent;
- small results are returned unchanged;
- reduction is deterministic;
- reduced content remains associated with the original tool-call identity.

---

## v0.3.4 — PreparedContext + KeepRecentPlanner

### Goal

Create the first real planner that produces provider-facing context under a budget.

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

Start from newest complete context units and walk backward until the input budget is filled.

Do not summarize yet.

### Invariants

- prepared context fits resolved input budget;
- system prompt is never silently truncated;
- unit boundaries are preserved;
- durable history is never mutated;
- provenance explains what was selected/reduced/omitted.

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

### Suggested summary shape

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

- a summary declares exactly what history range it covers;
- summary persistence is separate from raw session persistence;
- summaries never delete source history;
- summaries can be replaced by newer checkpoints without rewriting history.

---

## v0.3.6 — ProgressiveSummaryPolicy + ContextSummarizer

### Goal

Add progressive compaction without repeatedly summarizing the entire session.

### Add

```text
src/context/summarizer.ts
src/context/policies/progressive-summary.ts

tests/progressive-compaction.test.ts
tests/context-cancellation.test.ts
```

### Target progression

```text
messages 0..100 → S1
S1 + messages 101..170 → S2
S2 + messages 171..240 → S3
```

### Requirements

- deterministic fake summarizer for tests;
- optional LLM-backed summarizer adapter may be added only behind `ContextSummarizer`;
- cancellation must propagate through summary generation;
- summary failure must not corrupt durable history or replace the last valid checkpoint.

---

## v0.3.7 — AgentLoop integration + context events + examples

### Goal

Make the Agent use `ContextPlanner` while retaining complete runtime/session history.

### Refactor target

```text
state.messages
      │
      ├──► SessionStore: full history
      │
      └──► ContextPlanner
               ↓
         PreparedContext
               ↓
          LLMProvider
```

### Required integration proof

For a long scripted run:

```text
agent.state.messages.length
>
provider-visible messages.length
```

while SessionStore still contains the complete message sequence.

### Add events

Potential event vocabulary:

```text
context_prepare_start
context_prepared
context_reduced
context_compaction_start
context_compaction_end
context_compaction_error
```

Do not expose strategy-specific internals as permanent public events unless needed.

### Example

Add a deterministic long-session example demonstrating:

1. history grows;
2. provider context remains bounded;
3. large tool output is reduced;
4. old work becomes represented by a summary checkpoint;
5. raw JSONL history remains complete.

---

# Completion order

```text
0.3.1 ✅
  ↓
0.3.2 ← next
  ↓
0.3.3
  ↓
0.3.4
  ↓
0.3.5
  ↓
0.3.6
  ↓
0.3.7
```

No later stage should be considered complete until its own unit/invariant tests exist.
