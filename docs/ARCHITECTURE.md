# Architecture

## 1. Runtime layers

```text
┌──────────────────────────────────────────────┐
│ Applications                                 │
│ CLI / TUI / Web / RPC / SDK                  │
└───────────────────┬──────────────────────────┘
                    │ events + API calls
┌───────────────────v──────────────────────────┐
│ Agent facade                                 │
│ prompt / steer / followUp / abort             │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────v──────────────────────────┐
│ Agent Loop                                   │
│ Reason -> Act -> Observe -> Repeat           │
└───────┬───────────────────┬──────────────────┘
        │                   │
        v                   v
┌───────────────┐    ┌────────────────┐
│ LLM Provider  │    │ Tool Registry  │
│ adapter       │    │ + executors    │
└───────────────┘    └───────┬────────┘
                             v
                       Environment
```

## 2. One run, many turns

A **run** begins when `prompt()` receives new user input and ends when the model produces an assistant message with no tool calls and no queued steering/follow-up work.

A **turn** is one model response plus any tool executions requested by that response.

```text
Run
├── Turn 1: model -> read
├── Turn 2: model -> edit
├── Turn 3: model -> shell(test)
└── Turn 4: model -> final text
```

The distinction matters for tracing, limits, retries, and future billing/token accounting.

## 3. Message flow

```text
UserMessage
    |
    v
AssistantMessage(toolCalls=[...])
    |
    v
ToolResultMessage
    |
    v
AssistantMessage(...)
```

The model does not execute tools. It proposes tool calls. The runtime executes them and converts the result into an observation message.

## 4. Why the loop is a standalone function

`Agent` is stateful convenience API. `runAgentLoop()` is the mechanism.

This separation enables future uses:

- run the loop inside a server
- replay a state in tests
- build another facade
- add an RPC process
- experiment with schedulers
- embed it into a larger workflow engine

without inheriting UI concerns.

## 5. Dependency direction

Core depends on abstractions:

```text
Agent Loop ---> LLMProvider interface
          ---> ToolRegistry
          ---> SessionStore interface
          ---> ContextTransform interface
          ---> EventBus
```

The core does not import a concrete HTTP provider, JSONL store, CLI, or filesystem tool.

Concrete adapters depend inward on the contracts.

## 6. Context transform boundary

The runtime's full state is not necessarily the exact prompt sent to a model.

```text
full AgentMessage[]
        |
        v
ContextTransform
        |
        +-- truncate
        +-- compact
        +-- summarize
        +-- inject retrieved context
        +-- normalize provider constraints
        |
        v
LLM request
```

`IdentityContextTransform` is current default. `TailContextTransform` is a tiny demonstration.

Future compaction belongs here, not inside tool execution or the UI.

## 7. Session persistence

The first persistence model is append-only JSONL.

Advantages for learning:

- human-readable
- trivial to inspect
- preserves temporal order
- easy to replay
- maps naturally to future event sourcing

Future branching can build a tree of entries with parent IDs rather than replacing the core message model.

## 8. Steering vs follow-up

### Steering

Changes what the active run should do next.

It is injected after the current model/tool turn completes.

### Follow-up

Represents work that should happen once the current task would otherwise finish.

It is injected only when there are no tool calls and no steering messages waiting.

This distinction prevents a queued secondary request from accidentally changing the current action plan.

## 9. Error model

Tool failures are observations, not normally fatal runtime errors.

```text
Tool throws
   |
   v
ToolResultMessage(isError=true)
   |
   v
LLM can inspect error and recover
```

Fatal errors are reserved for runtime/provider failures or explicit aborts.

This is important: an autonomous loop must be able to reason about environment failures.

## 10. Extension direction

Future extension support should wrap lifecycle boundaries rather than add random branches to `Agent`.

Candidate hooks:

```text
before_model
context
assistant_message
before_tool
permission
around_tool
session_entry
after_turn
before_finish
```

Each hook should be composable and observable.

## 11. MCP direction

MCP should be implemented as a tool-source adapter:

```text
MCP server tools/list
        |
        v
MCP Tool Adapter
        |
        v
ToolRegistry.register(...)
```

The core agent loop should not know whether a tool is local TypeScript, shell-backed, HTTP-backed, or MCP-backed.

That is the abstraction test for a healthy design.
