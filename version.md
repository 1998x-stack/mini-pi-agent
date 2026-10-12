# mini-pi-agent v0.1

## 1. Version identity

- **Integrated branch:** `main`
- **Version snapshot:** `v0.1`
- **Package version:** `0.1.0`
- **Theme:** core Agent Runtime — model/tool/observation feedback loop
- **Previous version:** none
- **Status:** implemented baseline

v0.1 builds the smallest complete architecture needed to understand a Pi-style agent runtime without depending on an agent framework.

---

## 2. Core delta from a normal chatbot

A normal chatbot can stop after one model response:

```text
user → model → text
```

v0.1 adds an execution environment and feedback loop:

```text
user
  ↓
model
  ↓
AssistantMessage
  ├── final text ───────────────► finish
  │
  └── ToolCall
        ↓
     runtime
        ↓
     environment
        ↓
     ToolResult
        └───────────────────────► model again
```

Key lesson:

> The model proposes actions. The runtime executes them. The returned observation is what lets the next model turn reason about the environment.

---

## 3. Added in v0.1

### Runtime/message model

- user messages
- assistant messages
- tool calls
- tool-result messages
- run/turn state

### Agent execution

- standalone `runAgentLoop()`
- stateful `Agent`
- repeated model/tool turns
- max-turn protection
- cancellation propagation

### Provider boundary

- `LLMProvider`
- deterministic `ScriptedLLM`
- OpenAI-compatible adapter

### Tool boundary

- `Tool`
- `ToolRegistry`
- input validation
- rooted `read`, `write`, `edit`
- opt-in `shell`

### Runtime interaction

- lifecycle events
- text-delta events
- steering queue
- follow-up queue

### Persistence/context seams

- `SessionStore`
- JSONL session backend
- `ContextTransform`
- identity transform
- tail-context example

---

## 4. Intentional simplifications

- Real streamed provider transport/tool-call assembly is deferred to v0.2.
- Tool calls execute sequentially; scheduling policy is deferred to v0.2.
- Token budgets/summarizing compaction are deferred to v0.3.
- Skills are deferred to v0.4.
- Extensions/hooks are deferred to v0.5.
- MCP is deferred to v0.6.
- Session branching is deferred to v0.7.
- Permission/sandbox policy is deferred to v0.8.
- RPC/headless protocol is deferred to v0.9.

---

## 5. Architecture mental model

```text
                    Agent
                      │
                      ▼
                 runAgentLoop
              ┌───────┼────────┐
              ▼       ▼        ▼
        LLMProvider  Tools   ContextTransform
                      │
                      ▼
                  Environment

       Events + session persistence surround the loop
```

The core loop depends on interfaces; concrete adapters depend inward on those interfaces.

---

## 6. Important source files

Recommended reading order:

```text
src/core/types.ts
src/core/tool.ts
src/llm/types.ts
src/core/tool-registry.ts
src/core/agent-loop.ts
src/core/agent.ts
src/core/events.ts
src/core/queues.ts
src/session/jsonl-session.ts
src/core/context.ts
src/tools/*.ts
```

The single most important file is `src/core/agent-loop.ts`.

---

## 7. Tests/examples

Tests:

- `tests/agent-loop.test.ts`
- `tests/tool-registry.test.ts`
- `tests/file-tools.test.ts`
- `tests/session.test.ts`

Examples:

- `examples/01-scripted-agent.ts`
- `examples/02-tool-loop.ts`
- `examples/03-events.ts`
- `examples/04-session.ts`
- `examples/05-steering-followup.ts`
- `examples/06-coding-agent.ts`

Development validation:

```bash
npm install
npm run check
```

A built release artifact can also be checked with:

```bash
node scripts/smoke.mjs
```

---

## 8. Learning goals

After v0.1, a reader should be able to explain:

1. why the LLM does not execute tools itself;
2. why tool results must be returned to the next model call;
3. why runtime and provider are different layers;
4. why a tool is schema + executor;
5. why tool failures can be recoverable observations;
6. why events keep UI outside runtime logic;
7. why steering differs from follow-up;
8. why JSONL is a natural first session store;
9. why durable history and future model context should diverge;
10. why Skills/MCP/extensions layer around this loop.

---

## 9. Completed checklist

- [x] provider-neutral message types
- [x] Tool contract and registry
- [x] model/tool/observation loop
- [x] stateful Agent facade
- [x] ScriptedLLM
- [x] OpenAI-compatible adapter
- [x] lifecycle events
- [x] cancellation
- [x] steering/follow-up queues
- [x] JSONL session adapter
- [x] ContextTransform seam
- [x] rooted file-tool safety
- [x] opt-in shell
- [x] tests/examples/docs
- [x] `Agents.md` engineering contract
- [x] canonical `Plan.md`

---

## 10. Next version

v0.2 introduces:

```text
streamed chunks
      ↓
stream assembler
      ↓
ToolCall[]
      ↓
ToolScheduler
 ├── sequential
 └── parallel safe subset
      ↓
ordered observations
```

The key new distinction is:

> A Tool defines how one action executes. A ToolScheduler defines how a set of requested actions is coordinated.
