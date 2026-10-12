# mini-pi-agent — Architecture-Driven Development Plan

> `Plan.md` is the canonical development roadmap for `main`.
>
> `main` must represent the newest integrated, validated state. Version branches are educational snapshots. `docs/ROADMAP.md` is only a compact navigation summary and must not become a second source of truth.

---

# 1. Mission

`mini-pi-agent` explains modern agent runtimes by exposing one layer of “magic” at a time.

The project starts from the smallest useful feedback loop:

```text
model proposes action
        ↓
runtime executes action
        ↓
environment returns observation
        ↓
observation goes back to model
        ↓
repeat until finished
```

The goal is not feature parity with Pi, OpenCode, Claude Code, Codex, or any other production system. The goal is to make their underlying runtime ideas understandable through a compact TypeScript implementation.

A reader should eventually be able to explain:

- why an LLM does not itself execute tools;
- why tool scheduling is separate from tool implementation;
- why provider messages should not define runtime state;
- why durable history and model-visible context are different;
- why Skills belong above the runtime;
- why extensions wrap lifecycle boundaries;
- why MCP can be modeled as a remote tool source;
- why permission policy belongs between intent and execution;
- why sessions naturally evolve from append-only logs into trees;
- why UI and runtime should be separable processes/components.

---

# 2. Architectural reference model

```text
CLI / TUI / Web / RPC / SDK
             │
             ▼
          Agent facade
 prompt / steer / followUp / abort
             │
             ▼
          Agent Loop
 Reason → Act → Observe → Repeat
      ┌──────┼─────────────┐
      ▼      ▼             ▼
LLMProvider Tools     Context preparation
             │             │
             ▼             ▼
        Environment    model context
```

Cross-cutting capabilities should evolve around this loop rather than turning the loop into a monolith:

```text
Events / tracing
Tool Scheduler
Session Store
Context Budget / Compaction
Skills
Extensions
MCP tool source
Permissions / sandbox
RPC protocol
```

Architectural health test:

> Can a new capability be implemented without teaching `runAgentLoop()` its concrete implementation details?

---

# 3. Branch/version model

`main` is the newest validated integrated state.

Version branches are learning snapshots:

```text
main ───────────────────────────────────────────────► newest
 │
 ├── v0.1  core feedback loop
 ├── v0.2  streaming + tool scheduling
 ├── v0.3  context budget + compaction
 ├── v0.4  skills
 ├── v0.5  extensions/hooks
 ├── v0.6  MCP adapter
 ├── v0.7  session tree / branching
 ├── v0.8  permissions / sandbox
 ├── v0.9  RPC / headless runtime
 └── v1.0  stable public runtime API
```

Every version should introduce one dominant mental model, preserve previous validated mechanisms, and define explicit non-goals.

---

# 4. v0.1 — Core Agent Runtime (implemented baseline)

## Mental model

```text
UserMessage
   ↓
LLM
   ↓
AssistantMessage
   ├── no ToolCall ───────────────► finish
   │
   └── ToolCall[]
          ↓
      ToolRegistry
          ↓
      runtime executes
          ↓
      ToolResultMessage[]
          └───────────────────────► LLM again
```

## Why first

Every future subsystem depends on a correct, observable feedback loop.

## Implemented

- `AgentMessage`, `ToolCall`, `ToolResultMessage`
- `runAgentLoop()`
- stateful `Agent`
- run/turn distinction
- cancellation
- `LLMProvider`
- deterministic `ScriptedLLM`
- OpenAI-compatible adapter
- `Tool` + `ToolRegistry`
- safe rooted read/write/edit tools
- opt-in shell tool
- lifecycle events
- steering queue
- follow-up queue
- append-only JSONL session store
- `ContextTransform` seam

## Must remain demonstrable

```text
model intention != environment execution
tool result becomes the next observation
provider protocol != AgentMessage
session history != future model context
steering timing != follow-up timing
file tools cannot escape workspace root
```

## Non-goals

- true streamed network tool-call assembly
- parallel scheduling
- context compaction
- Skills
- extensions
- MCP
- session branching
- permissions/sandbox
- RPC

---

# 5. v0.2 — Streaming Protocol + Tool Scheduler

## Mental model

The runtime becomes asynchronous and incremental.

```text
provider SSE/chunks
       ↓
Stream Assembler
 ├── text deltas
 └── tool-call deltas
       ↓
final AssistantMessage
       ↓
ToolScheduler
 ├── SequentialScheduler
 └── ParallelScheduler
       ↓
ordered ToolResultMessage[]
```

## Why after v0.1

Concurrency is easier to understand after sequential semantics are explicit.

## Required work

- stream/chunk abstraction
- real streamed OpenAI-compatible path
- text-delta assembly
- fragmented tool name/argument assembly
- deterministic malformed-stream behavior
- `ToolScheduler` contract
- sequential reference scheduler
- parallel scheduler for independent calls
- defined result ordering
- cancellation propagation
- per-tool timeout policy
- structured run trace

## Invariants

- tools do not own global scheduling policy;
- streamed provider parsing does not leak into tools;
- cancellation reaches both model stream and active tools;
- output/result ordering is deterministic;
- sequential scheduler remains as the readable reference.

## Definition of Done

- [ ] fragmented tool-call tests
- [ ] sequential scheduler tests
- [ ] parallel scheduler tests
- [ ] timeout/cancellation tests
- [ ] event-order tests
- [ ] streaming example

---

# 6. v0.3 — Context Budget + Compaction

## Mental model

```text
runtime state
session history
model context
```

These are related but not identical.

## Required work

- provider token-estimation contract
- context-window/output-reserve budget
- soft/hard thresholds
- explicit compaction/summary entry
- keep-recent strategy
- summarize-old strategy
- large tool-result truncation policy
- compaction events and before/after estimates

## Invariants

- durable history is never silently destroyed;
- model context is derived from history;
- compaction has explicit provenance/boundaries;
- deterministic tests do not require a live LLM.

## Non-goals

- default vector database dependency
- generalized “long-term memory” platform
- RAG as a replacement for correct context lifecycle.

---

# 7. v0.4 — Skills

## Mental model

```text
Skill = metadata + instructions + resources + conventions
```

A Skill teaches the existing runtime how to work; it is not another runtime.

## Required work

- `SKILL.md` loader
- frontmatter metadata
- discovery roots
- resource path resolution
- explicit/manual activation
- context injection
- deterministic precedence

## Invariants

- no Skill-specific branch inside `runAgentLoop()`;
- discovery does not execute arbitrary code;
- loading and selecting a skill are separate policies.

---

# 8. v0.5 — Extensions / Lifecycle Hooks

## Mental model

Imperative customization should happen at explicit lifecycle boundaries.

```text
beforeRun
  ↓
beforeModel
  ↓
context
  ↓
model
  ↓
afterModel
  ↓
beforeTool
  ↓
permission seam
  ↓
tool
  ↓
afterTool
  ↓
afterTurn
  ↓
beforeFinish
```

## Required work

- extension registry
- deterministic hook ordering
- hook context types
- mutable vs read-only state rules
- error isolation policy
- custom tool registration
- custom context transforms
- custom events/commands where justified

Do not ship a hook ecosystem until replacement/blocking/error semantics are explicit and tested.

---

# 9. v0.6 — MCP Adapter

## Mental model

MCP is a remote source of ordinary runtime tools.

```text
MCP server
 initialize / tools/list / tools/call
          ↓
      McpClient
          ↓
     McpToolSource
          ↓
      Tool adapters
          ↓
      ToolRegistry
          ↓
 unchanged Agent Loop
```

## Required work

- transport interface
- initialize/session lifecycle
- tool discovery/schema conversion
- `tools/call` bridge
- timeout/cancellation propagation
- reconnect/session-reset behavior
- namespacing/collision rules

## Invariant

The core loop must not know whether a tool is local, shell-backed, HTTP-backed, or MCP-backed.

---

# 10. v0.7 — Session Tree / Branching / Checkpoints

## Mental model

```text
A
└── B
    ├── C ── D
    └── E ── F
```

Branching should be append-only rather than destructive rewriting.

## Required work

- entry IDs
- parent IDs
- branch/head IDs
- checkout
- branch from historical entry
- checkpoint metadata
- lineage replay
- tree serialization

## Invariants

- historical entries are immutable;
- selected lineage determines model context;
- every branch can be replayed from its ancestry;
- tool-call/result relationships survive branching.

---

# 11. v0.8 — Permission + Sandbox Policy

## Mental model

```text
ToolCall intention
      ↓
PermissionPolicy
 allow / deny / ask
      ↓
capability / sandbox profile
      ↓
Tool execution
```

## Required work

- permission middleware contract
- invocation metadata
- allow/deny/ask result
- path policy
- command policy
- read-only profile
- approval gate interface
- audit events
- sandbox abstraction/experiments

Important distinction:

> policy filtering is not the same thing as OS-level sandboxing.

---

# 12. v0.9 — RPC / Headless Runtime

## Mental model

```text
UI/client
   │ JSON requests/events
   ▼
headless agent process
   ├── Agent
   ├── sessions
   ├── tools
   └── providers
```

## Required work

- request/run IDs
- protocol version
- prompt/start
- abort
- steer
- follow-up
- streamed lifecycle events
- structured errors
- session selection
- stdio transport first

## Invariant

UI rendering must remain outside runtime execution semantics.

---

# 13. v1.0 — Stable Runtime API

v1.0 is about freezing proven seams, not adding random features.

Candidate stable contracts:

- `Agent`
- `runAgentLoop`
- `AgentMessage`
- `LLMProvider`
- streaming chunk model
- `Tool`
- `ToolRegistry`
- `ToolScheduler`
- context planning/transform contracts
- session identity/store contracts
- extension lifecycle
- permission middleware
- event vocabulary
- RPC schema

## Definition of Done

A third party should be able to implement a new provider, tool, session backend, extension, MCP tool source, or UI client without editing the core runtime implementation.

---

# 14. Cross-version invariants

1. **The loop stays readable.** A learner can still locate model → tool → observation behavior.
2. **Provider independence.** Core messages do not become one provider's wire schema.
3. **Tool independence.** Tool origin does not change loop semantics.
4. **History is durable; context is derived.** Context limits never justify silent history destruction.
5. **Workflow lives above mechanism.** Skills compose with runtime instead of becoming branches in it.
6. **Policy intercepts execution.** Permissions live between intent and environment mutation.
7. **UI observes/drives runtime through contracts.** Rendering does not own execution.
8. **Deterministic tests first.** Unit/invariant tests use `ScriptedLLM` or fixtures, not paid network calls.

---

# 15. Acceptance matrix

| Version | Primary mental model | Must prove |
|---|---|---|
| v0.1 | feedback loop | tool observation returns to model |
| v0.2 | asynchronous execution | streamed calls assemble and scheduler semantics are deterministic |
| v0.3 | context != history | budget/compaction preserves durable history |
| v0.4 | Skills are workflow context | skill injection does not modify core loop |
| v0.5 | lifecycle extensibility | hook ordering/error semantics are explicit |
| v0.6 | MCP as tool source | remote tools look ordinary to core runtime |
| v0.7 | history can branch | lineage is append-only and replayable |
| v0.8 | intent != permission | actions are mediated before execution |
| v0.9 | runtime != UI process | protocol drives prompt/abort/steer/events |
| v1.0 | stable seams | adapters/extensions work without core edits |

---

# 16. Current next action

Current integrated baseline: **v0.1**.

Next target: **v0.2 — Streaming Protocol + Tool Scheduler**.

Do not pull Skills, MCP, branching, permissions, RPC, or multi-agent work forward before v0.2's scheduling/streaming invariants are implemented and validated.
