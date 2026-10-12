# Extension Points

The project is intentionally designed so future versions can add capability **around** the agent loop instead of rewriting it.

## 1. Add a new model provider

Implement `LLMProvider`:

```ts
class MyProvider implements LLMProvider {
  readonly id = "my-provider";

  async complete(request: LLMRequest): Promise<AssistantMessage> {
    // translate request -> provider protocol
    // translate provider response -> AssistantMessage
  }
}
```

The Agent, tools, session, and UI remain unchanged.

## 2. Add a new tool

Implement `Tool` and register it:

```ts
const searchTool: Tool = {
  name: "search",
  description: "Search a local index",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false
  },
  async execute(args, ctx) {
    return { content: "..." };
  }
};

agent.tools.register(searchTool);
```

This is also the intended path for future MCP tools.

## 3. Add context compaction

Implement `ContextTransform`:

```ts
class SummarizingContext implements ContextTransform {
  async transform(input) {
    // inspect complete runtime history
    // summarize/truncate for the model request only
    return {
      systemPrompt: input.systemPrompt,
      messages: compacted
    };
  }
}
```

Important invariant: compaction should not destroy durable session history.

## 4. Add another session backend

Implement `SessionStore`:

```ts
class SqliteSessionStore implements SessionStore {
  load() { ... }
  append(message) { ... }
  clear() { ... }
}
```

The agent loop only depends on the storage contract.

## 5. Add a UI

Subscribe to events:

```ts
agent.subscribe((event) => {
  // render CLI / TUI / Web / telemetry
});
```

Do not put terminal rendering in `agent-loop.ts`.

## 6. Future extension manager

A future `v0.5` can formalize lifecycle middleware without breaking the current design:

```text
before model
    |
context transform
    |
model
    |
after model
    |
before tool -> permission gate -> tool -> after tool
    |
after turn
```

The event bus already provides observation; a later hook manager can add controlled interception.

## 7. Future MCP adapter

Expected shape:

```text
MCP tools/list
   |
   v
McpToolSource
   |
   +--> ToolRegistry.register(remoteToolAdapter)

MCP tools/call <--- remoteToolAdapter.execute()
```

The key invariant is that `runAgentLoop()` still sees ordinary `Tool` objects.

## 8. Future tool scheduler

Current v0.1 executes tool calls sequentially because it is easiest to reason about.

v0.2 can introduce:

```ts
interface ToolScheduler {
  execute(calls: ToolCall[], context: ...): Promise<ToolResultMessage[]>;
}
```

Possible schedulers:

```text
SequentialScheduler
ParallelScheduler
DependencyAwareScheduler
PermissionAwareScheduler
```

Again, tools themselves should not know how global scheduling works.
