# mini-pi-agent v0.3

## 1. Version identity

- **Branch:** `v0.3`
- **Package:** `0.3.0`
- **Theme:** context budget, causal units, model-only observation reduction, summary checkpoints, progressive compaction, and AgentLoop integration
- **Previous version:** `v0.2`
- **Status:** **implemented historical learning snapshot**

Primary mental model:

> **Durable session history is the source of truth. Model-visible context and summary checkpoints are derived projections of that history.**

This branch is frozen around that mental model. Later versions should build above these contracts rather than adding unrelated features here.

---

## 2. Final architecture

```text
Durable AgentMessage[] history
          │
          ├──────────────► SessionStore / historical truth
          │
          ├── ContextUnitBuilder
          │       ↓
          │   ToolResultReducer
          │       ↓
          │   KeepRecentContextPlanner
          │       ↓
          │   PreparedContext
          │
          └── old-history prefix
                  ↓
          ProgressiveSummaryPolicy
                  │
                  ├── previous ContextSummary
                  ├── newly covered messages only
                  └── ContextSummarizer
                  ↓
             ContextSummary
                  ↓
             SummaryStore

ContextRuntime
    │
    ├── reads checkpoint
    ├── plans unsummarized durable tail
    ├── advances checkpoint when old tail units must be omitted
    ├── re-plans until stable
    └── renders summary as model-only system context
          ↓
      PreparedContext
          ↓
      AgentLoop
          ↓
      LLMProvider
```

Three objects remain intentionally different:

```text
Durable History
≠
Prepared Model Context
≠
Summary Checkpoint
```

A summary is never appended to durable history and never authorizes deleting durable messages.

---

## 3. Completed increments

```text
v0.3.1  ContextBudget + ApproximateTokenEstimator        ✅
v0.3.2  ContextUnitBuilder + ToolExchange atomicity      ✅
v0.3.3  ToolResultReducer                                ✅
v0.3.4  PreparedContext + KeepRecentPlanner              ✅
v0.3.5  ContextSummary + SummaryStore                    ✅
v0.3.6  ProgressiveSummaryPolicy + ContextSummarizer     ✅
v0.3.7  ContextRuntime + AgentLoop integration            ✅
```

### v0.3.1 — budget and estimation

```text
inputBudget = contextWindow - outputReserve - safetyMargin
```

Token estimation is a replaceable contract rather than provider transport logic.

### v0.3.2 — causal units

```text
AssistantMessage(toolCalls)
+
matching ToolResultMessage[]
=
ToolExchangeContextUnit
```

Context selection and summary boundaries cannot silently cut a complete tool exchange.

### v0.3.3 — large observation projection

`HeadTailToolResultReducer` creates explicit Unicode-safe model-only copies while leaving durable ToolResults unchanged.

### v0.3.4 — first planner

`KeepRecentContextPlanner` selects one chronological contiguous suffix of complete units under the resolved input budget and records provenance.

### v0.3.5 — checkpoint artifacts

`ContextSummary` records stable identity, content, prefix coverage, token estimate, and creation time. `SummaryStore` remains separate from `SessionStore`.

### v0.3.6 — progressive compaction

```text
history[0..100] → S1
S1 + history[101..170] → S2
S2 + history[171..240] → S3
```

Only newly covered history is supplied to the summarizer. Coverage moves monotonically and must end on a complete context-unit boundary.

### v0.3.7 — runtime integration

`ContextRuntime` is the orchestration seam between the independent context mechanisms and `AgentLoop`.

When `AgentOptions.context` is configured:

```text
state.messages
      │
      │ remains complete
      ▼
ContextRuntime.prepare()
      │
      ├── latest SummaryStore checkpoint
      ├── summary-aware system context
      ├── planner over history after checkpoint coverage
      ├── progressive checkpoint advance if planner omits old tail units
      └── stable re-plan
      │
      ▼
PreparedContext
      │
      ▼
LLMRequest
```

The legacy `ContextTransform` path remains available when the v0.3 runtime is not configured. `AgentOptions.context` and `contextTransform` are intentionally mutually exclusive.

---

## 4. Context lifecycle events

v0.3 adds:

```text
context_prepare_start
context_summary_advanced
context_prepared
```

These expose counts, coverage, estimates, and reduction metadata without emitting full private context by default.

The event bus remains observational; it does not own context policy.

---

## 5. Public v0.3 context surface

```text
Budget
────────────────────────
ContextBudget
ResolvedContextBudget
resolveContextBudget()
assertWithinContextBudget()

Estimation
────────────────────────
TokenEstimator
ApproximateTokenEstimator
estimatePreparedInput()

Causal structure
────────────────────────
ContextUnit
UserContextUnit
AssistantContextUnit
ToolExchangeContextUnit
buildContextUnits()
flattenContextUnits()

Observation projection
────────────────────────
ToolResultReducer
ToolResultReduction
HeadTailToolResultReducer

Planning
────────────────────────
ContextPlanner
ContextPlannerInput
PreparedContext
ContextProvenance
KeepRecentContextPlanner

Summary checkpoints
────────────────────────
ContextSummary
SummaryStore
InMemorySummaryStore

Progressive summarization
────────────────────────
ContextSummarizer
DeterministicContextSummarizer
ProgressiveSummaryPolicy

Runtime composition
────────────────────────
ContextRuntime
ContextRuntimeOptions
ContextRuntimeResult
renderSummarySystemPrompt()

Errors
────────────────────────
ContextError
InvalidContextBudgetError
ContextBudgetExceededError
InvalidContextHistoryError
InvalidToolResultReductionOptionsError
InvalidContextSummaryError
SummaryCoverageRegressionError
InvalidSummaryCoverageBoundaryError
SummaryGenerationError
```

---

## 6. Final invariants

A correct v0.3 run preserves all of these:

```text
1. state.messages remains complete durable history
2. SessionStore receives real conversation/tool messages, not summary artifacts
3. LLMProvider receives PreparedContext rather than the raw lifetime history
4. a visible tool exchange is never silently split
5. oversized ToolResults are reduced only in model-visible copies
6. summary coverage is an explicit durable-history prefix
7. checkpoint coverage never moves backward
8. failed/cancelled summary generation does not commit a partial checkpoint
9. the latest user request cannot be silently summarized away just to fit budget
10. impossible budgets fail explicitly
11. AgentLoop does not implement token estimation or summary-generation policy
12. deterministic core tests do not require a live LLM
```

---

## 7. Verification performed

Earlier increments were checked incrementally under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

For v0.3.7, a consolidated integration subset using the same strict compiler settings passed type checking.

Runtime integration smoke verified:

```text
initial durable messages: 6
+ latest user message

first planning pass
→ older units omitted
→ S1 created

second planning pass
→ more old tail units omitted
→ S2 created covering history[0..5]

final provider-visible context
→ summary checkpoint in system context
→ only latest user tail message remains

full durable history
→ still 7 messages before provider response
→ unchanged by summary creation
```

The full repository `npm run check` / Vitest suite is **not claimed as run** in this execution environment because GitHub/dependency network resolution was unavailable.

---

## 8. Key files

```text
src/context/budget.ts
src/context/estimator.ts
src/context/units.ts
src/context/tool-result-reducer.ts
src/context/types.ts
src/context/planner.ts
src/context/summary.ts
src/context/summary-store.ts
src/context/summarizer.ts
src/context/policies/keep-recent.ts
src/context/policies/progressive-summary.ts
src/context/runtime.ts

src/core/agent.ts
src/core/agent-loop.ts
src/core/events.ts

tests/agent-context-integration.test.ts
examples/07-context-compaction.ts
```

---

## 9. Explicit non-goals

Keep out of v0.3:

- Skills
- Extensions / lifecycle hooks
- MCP
- session DAG / branching
- permissions / sandbox
- RPC / headless runtime
- vector-database memory platform
- semantic retrieval as a substitute for correct context lifecycle
- mandatory provider-specific tokenizer integration

These belong to later version mental models.

---

## 10. Freeze rule

`v0.3` is now an educational snapshot for:

```text
history != context
```

Future work should proceed on the next version branch instead of expanding v0.3 with unrelated runtime features.
