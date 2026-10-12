# v0.3 Context Architecture

This document defines the target architecture for the `v0.3` branch.

---

# 1. Architectural objective

The v0.3 subsystem must let the runtime answer:

```text
Given complete durable history H
and finite model budget B,
what bounded context C should the model see now?
```

subject to:

```text
C preserves protocol validity
C preserves important recent state
C is explainable
C does not mutate H
C fits B or fails explicitly
```

---

# 2. System view

```text
                         Agent
                           │
                           ▼
                    runAgentLoop()
                           │
                           │ complete history
                           ▼
                    ContextPlanner
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     ContextUnitBuilder TokenEstimator ToolResultReducer
            │              │              │
            └──────────────┼──────────────┘
                           ▼
                  CompactionPolicy
                    ┌──────┴──────┐
                    ▼             ▼
              Recent units   SummaryStore
                                  │
                                  ▼
                          ContextSummarizer
                           │
                           ▼
                    PreparedContext
                           │
                           ▼
                     LLMProvider

Durable SessionStore remains outside compaction mutation.
```

---

# 3. Dependency direction

Preferred dependency direction:

```text
core AgentMessage types
        ▲
        │
context data contracts
        ▲
        │
small mechanisms
(estimator / units / reducer / summary store)
        ▲
        │
policies
        ▲
        │
ContextPlanner orchestration
        ▲
        │
Agent loop
```

Forbidden directions:

```text
context -> CLI
context -> JSONL implementation details
context -> OpenAI HTTP details
context -> Skill implementation
context -> MCP implementation
```

---

# 4. Core data contracts

## 4.1 ContextBudget

```ts
export interface ContextBudget {
  contextWindow: number;
  outputReserve: number;
  safetyMargin: number;
}
```

Invariant:

```text
contextWindow > 0
outputReserve >= 0
safetyMargin >= 0
outputReserve + safetyMargin < contextWindow
```

Derived:

```ts
inputBudget = contextWindow - outputReserve - safetyMargin;
```

Keep the arithmetic centralized.

---

## 4.2 TokenEstimator

```ts
export interface TokenEstimator {
  estimateText(text: string): number;
  estimateMessage(message: AgentMessage): number;
  estimateMessages(messages: readonly AgentMessage[]): number;
}
```

The estimator is intentionally a contract so that:

```text
ApproximateTokenEstimator
ProviderSpecificEstimator
TestEstimator
```

can be swapped without changing planning logic.

---

## 4.3 ContextUnit

Conceptual representation:

```ts
export interface ContextUnitBase {
  id: string;
  sourceMessageIndexes: readonly number[];
  estimatedTokens: number;
}

export type ContextUnit =
  | UserUnit
  | AssistantTextUnit
  | ToolExchangeUnit
  | SummaryUnit;
```

The precise union fields may evolve, but every unit should carry enough source provenance to explain reconstruction.

---

## 4.4 ToolExchangeUnit

Target shape:

```ts
export interface ToolExchangeUnit extends ContextUnitBase {
  kind: "tool-exchange";
  assistant: AssistantMessage;
  results: ToolResultMessage[];
}
```

Rules:

- each visible tool call should have a matching visible result unless the exchange is explicitly incomplete/current;
- duplicate tool-call IDs are invalid;
- orphan results are detectable;
- result order should follow original call order for model visibility.

---

## 4.5 PreparedContext

```ts
export interface PreparedContext {
  systemPrompt: string;
  messages: AgentMessage[];
  estimatedInputTokens: number;
  compacted: boolean;
  provenance: ContextProvenance;
}
```

`PreparedContext` is ephemeral and provider-facing.

It must not be appended as if it were durable conversational truth.

---

# 5. Context provenance

Recommended provenance model:

```ts
export interface ContextProvenance {
  originalMessageCount: number;
  originalEstimatedTokens: number;
  selectedMessageCount: number;
  selectedEstimatedTokens: number;
  reducedToolResults: number;
  summaryId?: string;
  omittedSourceRanges: Array<{ start: number; end: number }>;
}
```

The goal is not perfect audit metadata in v0.3. The goal is to make planner decisions inspectable.

---

# 6. ContextUnitBuilder

Responsibility:

```text
AgentMessage[]
      ↓
validate protocol relations
      ↓
ContextUnit[]
```

Pseudo-flow:

```ts
for message in history:
  if user:
    flush simple unit

  if assistant without tools:
    create assistant-text unit

  if assistant with tool calls:
    collect expected tool ids
    collect following matching tool results
    create one tool-exchange unit

  if orphan tool result:
    report invalid history or explicit incomplete state
```

The builder should not decide which units to keep.

Mechanism vs policy:

```text
UnitBuilder = what belongs together
Planner policy = what to keep
```

---

# 7. ToolResultReducer

Architecture:

```text
ToolResultMessage
      ↓
estimate size
      ↓
small? ── yes ──► unchanged
      │
      no
      ↓
head / omission marker / tail
      ↓
reduced ToolResultMessage
```

Recommended explicit marker:

```text
[mini-pi-agent context reduction]
original_chars=245812
kept_head_chars=8000
kept_tail_chars=8000
```

Never pretend the reduced text is the complete original.

The reducer must be pure with respect to durable input: return a new message rather than mutate the original object.

---

# 8. Summary architecture

Summary pipeline:

```text
eligible old ContextUnit[]
         ↓
SummaryInput
         ↓
ContextSummarizer
         ↓
ContextSummary
         ↓
SummaryStore
```

Recommended contract:

```ts
export interface SummaryInput {
  previousSummary?: ContextSummary;
  units: readonly ContextUnit[];
  signal: AbortSignal;
}

export interface ContextSummarizer {
  summarize(input: SummaryInput): Promise<ContextSummary>;
}
```

A deterministic summarizer must exist for tests.

---

# 9. Summary identity and coverage

The summary should record what it covers.

Initial v0.3 may use:

```ts
coveredThroughMessageIndex: number;
```

but the architecture should avoid assuming array indexes are permanent global IDs.

Reason: v0.7 will introduce parent-linked session history and branches.

Design preference:

```text
v0.3: simple cursor abstraction
v0.7: branch-aware historical identity
```

rather than hard-coding raw indexes throughout the public API.

---

# 10. Policy layering

Do not create one giant planner with all decisions intertwined.

Suggested policy layers:

```text
ContextPlanner
   │
   ├── FullContextPolicy
   ├── KeepRecentPolicy
   └── ProgressiveSummaryPolicy
```

Common mechanisms stay shared:

```text
estimation
unit construction
result reduction
summary store
```

This lets examples compare policies while preserving the same underlying contracts.

---

# 11. Reference planning algorithm

Readable baseline:

```text
INPUT
system prompt
history
budget

1. validate budget
2. build context units
3. estimate full candidate
4. if fits -> return full candidate
5. reduce oversized tool results
6. estimate again
7. if fits -> return reduced candidate
8. reserve recent units from newest backwards
9. determine older eligible prefix
10. load/reuse summary if possible
11. summarize newly old units when necessary
12. combine summary + recent units
13. verify final estimate
14. if still too large -> typed budget error
15. return PreparedContext + provenance
```

This is intentionally explicit and not optimized prematurely.

---

# 12. Impossible-budget cases

The planner should distinguish cases:

```text
A. invalid budget configuration
B. system prompt alone exceeds input budget
C. one mandatory recent unit exceeds remaining budget
D. summarizer output itself is too large
E. estimator/planner internal inconsistency
```

These should not all become generic `Error("context too large")`.

Recommended error hierarchy:

```ts
ContextError
├── InvalidContextBudgetError
├── ContextBudgetExceededError
├── InvalidContextHistoryError
└── SummaryGenerationError
```

Keep the hierarchy small but meaningful.

---

# 13. Events

Context planning should be observable through existing runtime events or a focused event extension.

Recommended events:

```ts
context_prepare_start
context_tool_result_reduced
context_summary_start
context_summary_end
context_prepare_end
context_prepare_error
```

Useful fields:

```text
runId
turn
estimatedBefore
estimatedAfter
budget
summaryId
reducedCount
```

Avoid emitting the full private prompt/context by default.

---

# 14. Agent-loop integration

Desired loop diff conceptually:

```ts
const prepared = await contextPlanner.prepare({
  systemPrompt,
  history: state.messages,
  budget,
  signal
});

const request = {
  systemPrompt: prepared.systemPrompt,
  messages: prepared.messages,
  tools,
  signal
};
```

The loop should not know:

```text
how token estimation works
which tool results were reduced
how summaries are produced
which old units were omitted
```

This preserves the small-loop invariant.

---

# 15. Session-store relationship

Current `SessionStore`:

```ts
load(): Promise<AgentMessage[]>;
append(message: AgentMessage): Promise<void>;
clear(): Promise<void>;
```

v0.3 does not require converting the session store into a DAG.

Rules:

```text
SessionStore owns durable messages.
SummaryStore owns derived summary checkpoints.
ContextPlanner reads both.
ContextPlanner mutates neither historical message content nor session ordering.
```

Later v0.7 may unify or relate their persistence models more deeply.

---

# 16. Backward compatibility

The v0.1 `ContextTransform` API can be handled in one of two ways during implementation:

```text
Option A: adapter wraps old ContextTransform as ContextPlanner
Option B: migrate callers atomically and deprecate ContextTransform
```

Choose based on implementation clarity, not compatibility for its own sake.

Whichever path is chosen must be documented in `CHANGELOG.md`.

---

# 17. Architectural invariants

A correct v0.3 implementation must preserve all of these:

```text
1. durable history is never silently shortened by planning
2. provider receives PreparedContext, not direct session storage
3. protocol-related messages remain semantically valid
4. large result reduction is explicit
5. estimates are deterministic for a fixed estimator/input
6. impossible budgets fail explicitly
7. summarization is cancellable
8. summaries have provenance
9. no live LLM is required for core tests
10. AgentLoop stays free of compaction strategy branches
```

---

# 18. Future compatibility

This architecture intentionally prepares for:

```text
v0.4 Skills
  -> context supplements

v0.5 Extensions
  -> before/after context hooks

v0.6 MCP Resources/Prompts
  -> additional context sources

v0.7 Session Branching
  -> branch-specific summary checkpoints

v0.9 RPC
  -> inspectable context planning across process boundary
```

v0.3 should enable these later versions without implementing them early.
