# mini-pi-agent v0.2

## 1. Version identity

- **Branch:** `v0.2`
- **Base:** latest integrated `main` after v0.1
- **Theme:** streaming protocol + tool scheduling
- **Previous version:** `v0.1`
- **Package target:** `0.2.0`
- **Status:** active design / implementation branch

v0.2 preserves the v0.1 feedback loop and makes two runtime boundaries explicit:

1. an assistant response may arrive incrementally rather than atomically;
2. a set of requested tool calls needs an execution policy separate from each tool implementation.

The version should make a reader understand how a production-style agent can remain deterministic while model output and environment actions are asynchronous.

---

## 2. Core difference from v0.1

### v0.1

```text
LLM.complete()
     ↓
AssistantMessage
     ↓
for each ToolCall
     ↓
execute sequentially
     ↓
ToolResultMessage[]
```

### v0.2

```text
provider stream / SSE chunks
          ↓
canonical LLMStreamEvent
          ↓
AssistantStreamAssembler
   ├── text buffer
   └── per-tool-call buffers
          ↓
AssistantMessage
          ↓
ToolScheduler
   ├── SequentialScheduler   ← reference behavior
   └── ParallelScheduler     ← conservative safe subset
          ↓
ordered ToolResultMessage[]
          ↓
next model turn
```

The key architectural shift is:

> A `Tool` knows how one action executes. A `ToolScheduler` owns coordination, ordering, timeout and cancellation policy across a set of actions.

---

## 3. Why this version follows v0.1

Concurrency should not be introduced before sequential semantics are explicit.

v0.1 already establishes:

- provider-neutral messages;
- the model/tool/observation feedback loop;
- `AbortSignal` propagation into tools;
- event emission;
- steering and follow-up queues;
- session persistence.

v0.2 can therefore add asynchronous transport and scheduling without changing the meaning of an Agent turn.

The design goal is evolutionary:

```text
v0.1 semantics
      │
      ├── streamed provider transport
      ├── deterministic stream assembly
      ├── scheduling abstraction
      └── structured timing/trace

      ↓

same observable Agent semantics
```

---

## 4. Primary mental model

Streaming and concurrency are implementation mechanics; the model must still observe one deterministic assistant message followed by one deterministic ordered set of tool results.

```text
NETWORK / PROVIDER TIME
chunk 0 ─ chunk 1 ─ chunk 2 ─ ... ─ done

                ↓ assemble

RUNTIME MESSAGE TIME
        AssistantMessage
                ↓
          ToolCall[0..n]
                ↓ schedule

ENVIRONMENT EXECUTION TIME
call[0] ───────────── done
call[1] ── done
call[2] ───────── done

                ↓ reorder by original index

MODEL OBSERVATION TIME
ToolResult[0]
ToolResult[1]
ToolResult[2]
```

Three notions of order must not be confused:

1. **stream arrival order** — provider chunks;
2. **execution completion order** — tools may finish in any order;
3. **observation order** — deterministic order presented back to the model.

---

## 5. Streaming protocol design

### 5.1 Keep provider wire format outside core

OpenAI-compatible SSE details belong in the concrete provider adapter.

```text
OpenAI SSE JSON
      ↓ provider adapter
LLMStreamEvent
      ↓ runtime assembler
AssistantMessage
```

The core loop must not parse `data:` lines or provider-specific JSON fields.

### 5.2 Canonical stream events

The existing v0.1 shape remains the conceptual base:

```ts
type LLMStreamEvent =
  | { type: "text_delta"; delta: string }
  | {
      type: "tool_call_delta";
      index: number;
      id?: string;
      name?: string;
      argumentsDelta?: string;
    }
  | { type: "done"; message?: AssistantMessage };
```

v0.2 may refine this type only when needed to represent provider-independent semantics such as finish reason or usage. Provider-specific payloads must not leak into it.

### 5.3 AssistantStreamAssembler

Add a focused assembler rather than putting buffering logic in `runAgentLoop()`.

Target responsibility:

```text
LLMStreamEvent[]
      ↓
AssistantStreamAssembler
      ↓
AssistantMessage
```

Suggested internal state:

```ts
interface ToolCallAssembly {
  index: number;
  id?: string;
  name: string;
  argumentsText: string;
}

class AssistantStreamAssembler {
  private text = "";
  private toolCalls = new Map<number, ToolCallAssembly>();

  push(event: LLMStreamEvent): void;
  finish(): AssistantMessage;
}
```

Required behavior:

- append text deltas exactly in arrival order;
- assemble tool calls by provider-supplied index;
- support fragmented `id`, name and JSON arguments;
- finalize tool calls in ascending original index;
- parse argument JSON only at finalization;
- require final arguments to be a JSON object;
- generate a deterministic ID only if the provider did not provide one;
- reject malformed/incomplete stream state with a dedicated protocol error.

### 5.4 Malformed stream semantics

Malformed tool-call JSON is **not** a normal tool failure because no valid invocation exists yet.

Therefore:

```text
malformed provider stream
      ↓
StreamProtocolError
      ↓
agent_error / turn abort
```

This is different from:

```text
valid ToolCall
      ↓
tool execution fails
      ↓
ToolResultMessage(isError=true)
      ↓
model may recover
```

That distinction must be covered by tests.

---

## 6. Provider streaming design

### 6.1 OpenAI-compatible streamed path

Extend the existing adapter so `stream(request)` performs a real streaming HTTP request and converts SSE chunks into canonical `LLMStreamEvent` values.

Pipeline:

```text
fetch(stream=true)
      ↓
ReadableStream<Uint8Array>
      ↓
UTF-8 decoder
      ↓
SSE frame parser
      ↓
provider JSON delta
      ↓
LLMStreamEvent
```

Keep the SSE parser isolated and independently testable.

Suggested files:

```text
src/llm/streaming/sse-parser.ts
src/llm/streaming/assistant-stream-assembler.ts
src/llm/openai-compatible.ts
```

### 6.2 Fallback behavior

The agent runtime should support both:

```text
provider.stream available  → streaming path
provider.stream unavailable → complete() path
```

Both paths must produce the same final `AssistantMessage` semantics.

---

## 7. ToolScheduler design

### 7.1 Contract

Introduce a stable scheduling boundary:

```ts
export interface ToolSchedulerContext {
  registry: ToolRegistry;
  cwd: string;
  signal: AbortSignal;
  runId: string;
  turn: number;
}

export interface ToolScheduler {
  readonly id: string;

  execute(
    calls: readonly ToolCall[],
    context: ToolSchedulerContext
  ): Promise<ToolResultMessage[]>;
}
```

The contract requires output order to match input call order, regardless of physical completion order.

### 7.2 SequentialScheduler

This remains the reference implementation.

```text
call[0] → result[0]
             ↓
call[1] → result[1]
             ↓
call[2] → result[2]
```

Why it must remain:

- easiest semantics to inspect;
- deterministic baseline;
- useful for debugging;
- safe fallback for stateful tools;
- reference behavior for tests against parallel execution.

### 7.3 ParallelScheduler

Parallel execution must be conservative rather than automatic.

Default policy:

> If the runtime cannot prove or explicitly declare that calls are safe to overlap, execute them sequentially.

Do **not** change `Tool.execute()` merely to support concurrency.

Use a separate scheduling policy:

```ts
export type ToolConcurrencyClass = "parallel" | "exclusive";

export interface ToolSchedulingPolicy {
  classify(call: ToolCall): ToolConcurrencyClass;
  timeoutMs(call: ToolCall): number | undefined;
}
```

Initial recommended policy:

```text
read   → parallel
write  → exclusive
edit   → exclusive
shell  → exclusive
unknown/custom → exclusive by default
```

Future versions may support richer dependency declarations, resources or read/write sets. v0.2 should not build a DAG scheduler yet.

### 7.4 Conservative batching

For a sequence such as:

```text
read A
read B
edit C
read D
read E
```

A conservative scheduler may execute:

```text
[read A, read B] in parallel
        ↓ barrier
edit C exclusively
        ↓ barrier
[read D, read E] in parallel
```

This preserves source order barriers around exclusive side effects.

### 7.5 Result ordering

Physical completion:

```text
call[2] finishes first
call[0] finishes second
call[1] finishes third
```

Returned results must still be:

```text
result[0]
result[1]
result[2]
```

This deterministic observation ordering is a v0.2 invariant.

---

## 8. Timeout and cancellation

### 8.1 Run cancellation

The v0.1 run `AbortSignal` remains the root cancellation source.

It must reach:

```text
Agent.abort()
   ↓
root AbortSignal
   ├── provider stream
   ├── SSE reader
   ├── scheduler
   └── every active Tool.execute()
```

### 8.2 Per-tool timeout

Timeout is scheduling policy, not tool business logic.

Each scheduled invocation should receive a child signal combining:

- root run cancellation;
- optional per-tool timeout.

On timeout, create a deterministic error observation for that tool unless the whole run was explicitly aborted.

Conceptually:

```text
valid tool call
   ↓
timeout
   ↓
ToolResultMessage(isError=true, timeout metadata/message)
```

A timeout should not automatically destroy independent sibling results.

---

## 9. Event model changes

v0.1 already emits lifecycle and text-delta events. v0.2 should add enough events to explain asynchronous behavior without making the EventBus a provider-wire dump.

Recommended additions:

```ts
| { type: "tool_call_delta"; runId; turn; index; ... }
| { type: "stream_end"; runId; turn }
| { type: "tool_scheduled"; runId; turn; call; mode }
| { type: "tool_timeout"; runId; turn; callId; timeoutMs }
```

Existing events remain meaningful:

```text
turn_start
  ↓
text_delta / tool_call_delta ...
  ↓
assistant_message
  ↓
tool_start / tool_end ...
  ↓
turn_end
```

For parallel tools, `tool_end` may occur out of call order. The appended `ToolResultMessage[]` must still be ordered.

---

## 10. Structured run trace

Events are live notifications; a trace is an inspectable record.

Add a subscriber-based recorder instead of hard-coding tracing into the loop:

```ts
interface TraceRecord {
  sequence: number;
  timestamp: number;
  event: AgentEvent;
}

interface RunTrace {
  runId: string;
  startedAt: number;
  endedAt?: number;
  records: TraceRecord[];
}
```

Design goals:

- monotonic sequence numbers;
- timestamps/durations for provider and tool activity;
- deterministic serialization;
- useful for examples/tests/debugging;
- no dependency from core message types onto a UI or telemetry backend.

Tracing should be implemented by subscribing to EventBus.

---

## 11. Proposed file layout

```text
src/
├── core/
│   ├── agent-loop.ts              # orchestration only
│   ├── events.ts                  # runtime event union
│   ├── tool.ts                    # unchanged execution contract
│   └── ...
│
├── llm/
│   ├── types.ts
│   ├── openai-compatible.ts
│   └── streaming/
│       ├── sse-parser.ts
│       └── assistant-stream-assembler.ts
│
├── scheduler/
│   ├── types.ts
│   ├── sequential-scheduler.ts
│   ├── parallel-scheduler.ts
│   └── policy.ts
│
└── tracing/
    └── trace-recorder.ts
```

Tests:

```text
tests/
├── stream-assembler.test.ts
├── sse-parser.test.ts
├── sequential-scheduler.test.ts
├── parallel-scheduler.test.ts
├── scheduler-timeout.test.ts
├── cancellation.test.ts
├── event-order.test.ts
└── streaming-agent.test.ts
```

Examples:

```text
examples/
├── 07-streaming-agent.ts
├── 08-parallel-tools.ts
└── 09-trace.ts
```

---

## 12. `runAgentLoop()` target shape

The loop should become more declarative, not larger.

Target pseudocode:

```ts
while (state.turn < maxTurns) {
  emit(turn_start);

  const request = prepareRequest(...);

  const assistant = provider.stream
    ? await consumeStream(provider.stream(request), assembler, events)
    : await provider.complete(request);

  append(assistant);

  if (assistant.toolCalls.length === 0) {
    if (injectFollowupsIfAny()) continue;
    return finalResult;
  }

  const results = await scheduler.execute(
    assistant.toolCalls,
    schedulerContext
  );

  appendInOrder(results);
  injectSteeringIfAny();
  emit(turn_end);
}
```

`runAgentLoop()` should not contain:

- SSE framing logic;
- fragmented JSON assembly details;
- concurrency batching algorithm;
- timeout implementation details;
- tracing storage logic.

---

## 13. Tests and invariants

### Streaming assembler

Must prove:

- text fragments join exactly;
- a tool name may arrive in fragments;
- JSON arguments may arrive one character at a time;
- two interleaved tool calls assemble independently by index;
- malformed final JSON fails deterministically;
- missing IDs receive deterministic runtime IDs;
- tool order follows index, not arrival timing.

### Sequential scheduler

Must prove:

- exactly one tool runs at a time;
- input order == execution order == result order;
- failures become result observations;
- cancellation stops remaining work.

### Parallel scheduler

Must prove:

- parallel-safe calls overlap;
- exclusive calls form barriers;
- unknown tools/policies default conservatively;
- physical completion order may differ;
- returned result order remains stable;
- one tool failure does not reorder siblings.

### Timeout/cancellation

Must prove:

- provider streaming respects abort;
- active tools receive abort;
- timed-out tool is represented deterministically;
- explicit run abort is distinguishable from one tool timeout;
- no new calls are launched after root cancellation.

### Event ordering

Must prove a valid partial order rather than assuming fully sequential timestamps.

Example invariant:

```text
agent_start
  < turn_start
  < assistant_message
  < every tool_start
  < corresponding tool_end
  < turn_end
  < agent_end
```

For parallel calls, sibling `tool_start/tool_end` ordering is intentionally not fixed.

---

## 14. Explicit non-goals

v0.2 must **not** add:

- token counting or context compaction;
- summarization memory;
- Skills/SKILL.md loader;
- extension hooks/plugin lifecycle;
- MCP transport/client;
- session tree/branching;
- permission prompts or sandbox runtime;
- DAG/dependency inference between arbitrary tool calls;
- retries/backoff framework;
- distributed scheduling;
- speculative model execution;
- UI/TUI framework.

These belong to later versions in `Plan.md`.

---

## 15. Migration constraints

Existing v0.1 examples and tests should continue to work with the sequential/default configuration.

Compatibility targets:

- `Tool` public execution shape remains stable;
- `ScriptedLLM` remains valid for deterministic non-network tests;
- providers without `stream()` remain supported;
- sequential tool execution remains the default/reference behavior;
- session format does not require a breaking migration merely because execution becomes streamed.

---

## 16. Recommended implementation sequence

Implement in this order:

```text
v0.2.1
LLM stream assembler
      ↓
v0.2.2
OpenAI-compatible SSE stream path
      ↓
v0.2.3
ToolScheduler + SequentialScheduler
      ↓
v0.2.4
ParallelScheduler + conservative policy
      ↓
v0.2.5
per-tool timeout + cancellation hardening
      ↓
v0.2.6
structured trace + event-order tests
      ↓
v0.2.7
examples, docs, regression validation
```

Do not start with parallelism. First make streaming and sequential scheduling behavior explicit and tested.

---

## 17. Definition of Done

v0.2 can be frozen only when:

- [ ] `AssistantStreamAssembler` has fragmented/interleaved stream tests;
- [ ] real OpenAI-compatible SSE path exists;
- [ ] non-streaming provider fallback remains valid;
- [ ] `ToolScheduler` contract exists;
- [ ] `SequentialScheduler` is the default/reference scheduler;
- [ ] `ParallelScheduler` only overlaps explicitly safe calls;
- [ ] result order is deterministic;
- [ ] run cancellation reaches provider and active tools;
- [ ] per-tool timeout behavior is deterministic;
- [ ] event partial-order tests pass;
- [ ] trace recorder exists and is serializable;
- [ ] streaming example works;
- [ ] parallel-tool example demonstrates real overlap;
- [ ] all v0.1 regression tests still pass;
- [ ] `npm run check` passes on the exact final branch state;
- [ ] `version.md` reflects completed behavior;
- [ ] validated final state is synchronized back into `main`.

---

## 18. Learning goals

After v0.2, a reader should be able to explain:

1. why streamed bytes are not yet an `AssistantMessage`;
2. why tool-call JSON often must be assembled incrementally;
3. why malformed stream data differs from a tool execution error;
4. why tool execution policy belongs outside `Tool`;
5. why parallel completion order should not define model observation order;
6. why conservative concurrency is safer than parallelizing every tool call;
7. how cancellation flows across model transport and environment work;
8. why timeout is a runtime/scheduler concern;
9. why event streams and durable traces are related but different abstractions;
10. how the same Agent Loop semantics survive asynchronous implementation.

---

## 19. Next version

v0.3 should build on the now-observable asynchronous runtime to introduce **Context Budget + Compaction**:

```text
full durable history
       ↓
token / context budget
       ↓
compaction policy
       ↓
model-visible context
```

That work should remain separate from streaming and scheduling so v0.2 stays focused on execution-time semantics.
