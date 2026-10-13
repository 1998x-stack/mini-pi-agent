# v0.3 Context Architecture — Implemented Reference

## 1. Architectural objective

Given complete durable history `H` and finite model budget `B`, derive a bounded model context `C` such that:

```text
C preserves protocol validity
C preserves useful recent state
C is explainable
C does not mutate H
C fits B or fails explicitly
```

The central separation is:

```text
Runtime State
≠
Durable Session History
≠
Prepared Model Context
≠
Summary Checkpoint
```

---

## 2. Final system view

```text
                         Agent
                           │
                           ▼
                    runAgentLoop()
                           │
                           ▼
                    ContextRuntime
                 ┌─────────┼─────────┐
                 ▼         ▼         ▼
           SummaryStore  Planner  SummaryPolicy
                 │         │         │
                 │         │         └── ContextSummarizer
                 │         │
                 │         ├── ContextUnitBuilder
                 │         ├── TokenEstimator
                 │         └── ToolResultReducer
                 │
                 └──────────────┐
                                ▼
                       PreparedContext
                                │
                                ▼
                         LLMProvider

SessionStore remains the complete durable-message store.
```

`ContextRuntime` is orchestration, not storage. It never owns or rewrites durable messages.

---

## 3. Dependency direction

```text
core AgentMessage types
        ▲
        │
context data contracts
        ▲
        │
small mechanisms
(budget / estimator / units / reducer / summary store)
        ▲
        │
policies
(keep-recent / progressive-summary)
        ▲
        │
ContextRuntime
        ▲
        │
AgentLoop
```

Forbidden coupling:

```text
context -> CLI rendering
context -> JSONL implementation details
context -> provider HTTP wire format
context -> Skills
context -> MCP
```

---

## 4. Budget model

```ts
interface ContextBudget {
  contextWindow: number;
  outputReserve: number;
  safetyMargin: number;
}
```

Derived centrally:

```text
inputBudget = contextWindow - outputReserve - safetyMargin
```

Impossible configurations fail before planning.

---

## 5. Token estimation

```ts
interface TokenEstimator {
  estimateText(text: string): number;
  estimateSystem(text: string): number;
  estimateMessage(message: AgentMessage): number;
  estimateMessages(messages: readonly AgentMessage[]): number;
}
```

`ApproximateTokenEstimator` is deterministic and network-independent. A future provider-specific estimator can replace it without changing planner semantics.

---

## 6. Causal context units

The builder lifts raw history into semantic units:

```text
UserMessage                       → UserContextUnit
AssistantMessage(no tool calls)   → AssistantContextUnit
AssistantMessage(tool calls)
  + matching ToolResultMessage[]  → ToolExchangeContextUnit
```

Mechanism vs policy:

```text
ContextUnitBuilder = what belongs together
ContextPlanner     = which complete units stay visible
```

Complete tool exchanges are atomic for both prepared context selection and summary coverage boundaries.

---

## 7. Large observation projection

`HeadTailToolResultReducer` produces a model-only copy:

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

The source `ToolResultMessage` is never mutated.

---

## 8. PreparedContext

```ts
interface PreparedContext {
  systemPrompt: string;
  messages: AgentMessage[];
  estimatedInputTokens: number;
  compacted: boolean;
  budget: ResolvedContextBudget;
  provenance: ContextProvenance;
}
```

`PreparedContext` is ephemeral/provider-facing. It is never appended to session history.

---

## 9. KeepRecent reference policy

```text
history
  ↓
build complete units
  ↓
reduce large ToolResults in copies
  ↓
estimate units
  ↓
walk newest → oldest
  ↓
stop at first non-fitting older unit
  ↓
restore chronological order
  ↓
PreparedContext
```

The policy chooses one contiguous recent suffix. It does not skip middle history merely to maximize packing density.

---

## 10. Summary model

```ts
interface ContextSummary {
  id: string;
  content: string;
  coversThroughMessageIndex: number;
  estimatedTokens: number;
  createdAt: number;
}
```

Coverage means the complete durable prefix `[0..N]`.

`SummaryStore` is independent from `SessionStore` because summaries are derived/regenerable checkpoints rather than conversational truth.

---

## 11. Progressive summary policy

```text
history[0..100] → S1
S1 + history[101..170] → S2
S2 + history[171..240] → S3
```

Policy owns:

```text
coverage boundary validation
monotonicity
new-history range calculation
candidate commit ordering
```

Summarizer owns only content generation.

Failure-atomic sequence:

```text
read previous checkpoint
      ↓
generate candidate
      ↓
validate / estimate
      ↓
abort check
      ↓
SummaryStore.put()
```

Failure or cancellation before `put()` leaves the previous checkpoint intact.

---

## 12. ContextRuntime

`ContextRuntime` composes the already-independent mechanisms.

Reference algorithm:

```text
load latest summary
      ↓
tailStart = summary.coverage + 1
      ↓
render base system + checkpoint block
      ↓
planner.prepare(durable tail)
      ↓
omitted unsummarized units?
  ├── no  → stable PreparedContext
  └── yes → summaryPolicy.advance(omitted complete prefix)
                ↓
             re-plan
```

The loop is bounded by `maxSummaryPasses` and fails explicitly if it cannot converge.

The latest user request is never silently summarized away merely to make the request fit; if the newest atomic unit cannot fit, planning fails.

---

## 13. Summary visibility

A checkpoint is not a fake conversation message.

Provider input is:

```text
systemPrompt
  = base system prompt
  + explicit summary checkpoint block

messages
  = recent prepared AgentMessage[] tail
```

Meanwhile:

```text
state.messages = complete durable history
SessionStore   = complete durable history
SummaryStore   = derived checkpoint
```

---

## 14. AgentLoop integration

The core loop only asks for prepared model input:

```ts
const context = await contextRuntime.prepare({
  systemPrompt: state.systemPrompt,
  history: state.messages,
  signal
});

const request = {
  systemPrompt: context.prepared.systemPrompt,
  messages: context.prepared.messages,
  tools,
  signal
};
```

`runAgentLoop()` does not implement:

```text
token estimation
ToolResult reduction
summary generation
summary coverage selection
checkpoint persistence
```

This preserves the readable-loop invariant.

---

## 15. Lifecycle events

Implemented context events:

```text
context_prepare_start
context_summary_advanced
context_prepared
```

They expose counts/coverage/estimates, not complete private prompt contents.

---

## 16. Backward compatibility

`AgentOptions.context` enables `ContextRuntime`.

The old `ContextTransform` remains a compatibility/teaching seam when the new context runtime is absent.

The two configuration paths are mutually exclusive.

---

## 17. Persistence relationship

```text
SessionStore
  owns durable messages

SummaryStore
  owns derived checkpoints

ContextRuntime / ContextPlanner
  read projections
  never rewrite historical truth
```

v0.7 may later replace raw array indexes with branch-aware history identities.

---

## 18. Core v0.3 invariants

```text
1. durable history is never silently shortened
2. provider receives prepared context, not raw lifetime history
3. tool-call/result causal relations remain valid
4. large observation reduction is explicit
5. estimates are deterministic for fixed estimator/input
6. impossible budgets fail explicitly
7. summarization is cancellable
8. checkpoints have explicit monotonic coverage
9. failed summary generation is commit-atomic
10. no live LLM is required for reference tests
11. AgentLoop stays free of compaction implementation details
```

---

## 19. Future compatibility

This architecture intentionally prepares for:

```text
v0.4 Skills
  → additional context/instruction sources

v0.5 Extensions
  → before/after context lifecycle hooks

v0.6 MCP
  → remote tools/resources/prompts

v0.7 Session Branching
  → branch-specific checkpoint identity

v0.9 RPC
  → inspectable context preparation across processes
```

Those capabilities are not implemented in v0.3.
