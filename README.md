# mini-pi-agent

A small, extensible **Pi-style Agent Runtime** written from first principles in TypeScript.

The project is organized as educational version snapshots. The `v0.3` branch focuses on one mental model:

> **Durable history is not the same thing as model-visible context.**

The runtime keeps the full conversation/session history while deriving a bounded model context through explicit budgeting, causal units, large-observation reduction, summary checkpoints, and progressive compaction.

## 1. Core agent loop

```text
User
  ↓
messages.push(user)
  ↓
prepare model context
  ↓
LLM(context, tools)
  ├──────────── no tool calls ───────────► final answer
  │
  └──────────── tool calls
                    ↓
               execute tools
                    ↓
               tool results
                    └────────────────────► next model turn
```

The irreducible feedback loop is still easy to find in `src/core/agent-loop.ts`. v0.3 adds context preparation at the model-call boundary rather than turning the loop into a compaction monolith.

## 2. v0.3 architecture

```text
Durable AgentMessage[] history
          │
          ├──────────────► SessionStore / historical truth
          │
          ├── ContextUnitBuilder
          │       ↓
          │   ToolResultReducer
          │       ↓
          │   ContextPlanner
          │       ↓
          │   PreparedContext
          │
          └── old-history prefix
                  ↓
          ProgressiveSummaryPolicy
                  │
                  ├── previous checkpoint
                  ├── newly covered messages
                  └── ContextSummarizer
                  ↓
             ContextSummary
                  ↓
             SummaryStore

ContextRuntime
    ↓
summary-aware system context + recent messages
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

A summary never authorizes deleting durable history.

## 3. What v0.3 contains

- v0.1 Agent facade and readable Agent Loop
- provider-neutral `LLMProvider`
- `Tool` + `ToolRegistry`
- rooted file tools and opt-in shell tool
- lifecycle event bus, cancellation, steering and follow-up queues
- append-only session abstraction
- `ContextBudget` and deterministic token-estimation contract
- causal `ContextUnit` modeling
- tool-call/result atomicity
- Unicode-safe `HeadTailToolResultReducer`
- `PreparedContext` and `KeepRecentContextPlanner`
- explicit `ContextSummary` checkpoints
- monotonic `SummaryStore`
- `ContextSummarizer`
- deterministic offline summarizer
- `ProgressiveSummaryPolicy`
- summary failure atomicity and cancellation semantics
- `ContextRuntime` orchestration
- context lifecycle events
- end-to-end Agent integration

## 4. The v0.3 model-call boundary

When `AgentOptions.context` is configured:

```text
state.messages
      │
      │ remains complete
      ▼
ContextRuntime.prepare()
      │
      ├── reads latest SummaryStore checkpoint
      ├── plans recent durable tail
      ├── advances summary if older unsummarized units must be omitted
      └── re-plans until context is stable
      │
      ▼
PreparedContext
      │
      ▼
LLMRequest
```

The stored summary is rendered as **model-only system context**. It is not inserted into `state.messages` and is not appended to `SessionStore`.

## 5. Minimal v0.3 configuration

```ts
const estimator = new ApproximateTokenEstimator();
const summaryStore = new InMemorySummaryStore();
const summaryPolicy = new ProgressiveSummaryPolicy({
  summarizer: new DeterministicContextSummarizer(),
  store: summaryStore,
  estimator
});

const agent = await Agent.create({
  provider,
  session,
  context: {
    planner: new KeepRecentContextPlanner({ estimator }),
    budget: {
      contextWindow: 32_000,
      outputReserve: 4_000,
      safetyMargin: 1_000
    },
    summaryStore,
    summaryPolicy
  }
});
```

For compatibility, callers that do not configure `AgentOptions.context` still use the older `ContextTransform` seam.

## 6. Context lifecycle events

v0.3 adds observable context preparation events:

```text
context_prepare_start
context_summary_advanced
context_prepared
```

These events expose compaction behavior without making UI/logging own context policy.

Existing runtime events such as `agent_start`, `turn_start`, `text_delta`, `tool_start`, `tool_end`, `message_added`, `turn_end`, and `agent_end` remain available.

## 7. Project structure

```text
mini-pi-agent/
├── Agents.md
├── Plan.md
├── version.md
├── src/
│   ├── core/
│   │   ├── agent.ts
│   │   ├── agent-loop.ts
│   │   ├── context.ts          legacy compatibility seam
│   │   ├── events.ts
│   │   └── ...
│   ├── context/
│   │   ├── budget.ts
│   │   ├── estimator.ts
│   │   ├── units.ts
│   │   ├── tool-result-reducer.ts
│   │   ├── planner.ts
│   │   ├── runtime.ts
│   │   ├── summary.ts
│   │   ├── summary-store.ts
│   │   ├── summarizer.ts
│   │   └── policies/
│   │       ├── keep-recent.ts
│   │       └── progressive-summary.ts
│   ├── llm/
│   ├── session/
│   ├── tools/
│   └── index.ts
├── examples/
│   └── 07-context-compaction.ts
├── tests/
└── docs/v0.3/
```

## 8. Run

```bash
npm install
npm run check
npm run demo:context
```

The context example demonstrates all three layers at once:

```text
complete durable history
summary checkpoint
provider-visible recent tail
```

## 9. Recommended v0.3 reading order

1. `Agents.md`
2. `version.md`
3. `docs/v0.3/ARCHITECTURE.md`
4. `src/context/budget.ts`
5. `src/context/units.ts`
6. `src/context/tool-result-reducer.ts`
7. `src/context/policies/keep-recent.ts`
8. `src/context/summary.ts`
9. `src/context/policies/progressive-summary.ts`
10. `src/context/runtime.ts`
11. `src/core/agent-loop.ts`
12. `tests/agent-context-integration.test.ts`
13. `examples/07-context-compaction.ts`

## 10. Version strategy

```text
v0.1  core feedback loop                         historical snapshot
v0.2  streaming + ToolScheduler                  separate version work
v0.3  context budget + progressive compaction    this branch
v0.4  Skills                                     planned
v0.5  Extensions / Hooks                         planned
v0.6  MCP adapter                                planned
v0.7  session tree / branching                   planned
v0.8  permission + sandbox policy                planned
v0.9  RPC / headless runtime                     planned
v1.0  stable runtime API                         planned
```

Read `Plan.md` for the architectural roadmap and `version.md` for the exact state of this branch.

## 11. Safety and architecture rules

- durable history must never be silently destroyed;
- a tool exchange is a causal unit and must not be cut in half;
- large observations are reduced only in model-visible copies;
- summary checkpoints cover explicit durable-history prefixes;
- checkpoint coverage moves monotonically;
- cancellation before summary commit must preserve the previous checkpoint;
- context policy stays outside tool execution;
- summary artifacts are not durable conversation messages;
- the Agent Loop depends on context contracts, not on summarization implementation details.
