# Learning Path

## Stage A — understand the irreducible loop

Read:

1. `src/core/types.ts`
2. `src/core/tool.ts`
3. `src/llm/types.ts`
4. `src/core/agent-loop.ts`

Run:

```bash
npx tsx examples/02-tool-loop.ts
```

Trace exactly these four messages:

```text
user
assistant + tool call
tool result
assistant final
```

If you understand why the third message must be fed back into the next model call, you understand the heart of tool-using agents.

## Stage B — separate mechanism from interface

Read:

- `src/core/agent.ts`
- `src/core/events.ts`

Run:

```bash
npx tsx examples/03-events.ts
```

Notice that the UI consumes events. The agent loop does not print anything.

## Stage C — understand environment capability

Read:

- `src/tools/read.ts`
- `src/tools/write.ts`
- `src/tools/edit.ts`
- `src/tools/shell.ts`

Ask:

> Why can four primitive tools create a capable coding agent?

The answer is composability. `shell(command)` delegates a huge action vocabulary to the operating system rather than representing every command as a separate LLM tool.

## Stage D — persistence and event sourcing

Read:

- `src/session/jsonl-session.ts`

Run:

```bash
npx tsx examples/04-session.ts
cat .sandbox/session/demo.jsonl
```

Observe that "memory" begins as persisted interaction state, not magic.

## Stage E — interactive control

Read:

- `src/core/queues.ts`
- steering/follow-up branches in `src/core/agent-loop.ts`

Run:

```bash
npx tsx examples/05-steering-followup.ts
```

Understand the semantic distinction:

```text
steering = modify active work
follow-up = schedule work after active work
```

## Stage F — provider boundary

Read:

- `src/llm/openai-compatible.ts`

Trace conversion from internal messages to provider messages.

The critical insight is that provider protocol is an adapter detail. Agent state must not become an OpenAI-specific or Anthropic-specific data structure.

## Stage G — implement one future feature yourself

Recommended order:

1. token counter
2. summary compaction
3. parallel independent tool execution
4. skill markdown loader
5. hook-based extension manager
6. MCP client tool adapter
7. session branching

Implement each as a layer around existing contracts. If you need to rewrite `runAgentLoop()` wholesale, inspect whether the abstraction is leaking.
