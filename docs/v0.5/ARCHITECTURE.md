# v0.5 Extensions Architecture

## 1. Objective

v0.5 introduces trusted executable runtime customization without turning Agent/AgentLoop into an extension-specific dispatcher.

```text
Skill      = workflow knowledge
Tool       = environment execution
Extension  = trusted runtime customization
```

The core owns lifecycle semantics. Extensions participate only through public registrations and named hooks.

## 2. Layering

```text
Application
   ↓
Agent
   ↓
ExtensionHost
   ├── ExtensionDefinition[]
   ├── scoped ExtensionAPI
   ├── owned Tool registrations
   └── owned Hook registrations
          │
          ▼
      HookPipeline
          │
          ▼
      AgentLoop seams
```

Forbidden dependency direction:

```text
core → concrete Extension names        ❌
Extension → mutable Agent internals     ❌
Hook → provider-specific transport      ❌
Extension → hidden execution path       ❌
```

## 3. Extension definition

```ts
export interface ExtensionDefinition {
  name: string;
  version?: string;
  setup(api: ExtensionAPI): void | Promise<void>;
}
```

The definition receives a scoped capability API, not `Agent`.

## 4. Extension API

First public surface:

```ts
export interface ExtensionAPI {
  readonly extensionName: string;
  registerTool(tool: Tool): Disposable;
  on<K extends HookName>(hook: K, handler: HookHandler<K>): Disposable;
}
```

Future capabilities may be added only when an explicit runtime boundary exists. v0.5 does not expose private state graphs.

## 5. Registration ownership

Every registration records an owner:

```text
extensionName
registration kind
registration identity
registration order
```

This allows:

```text
load A
load B
unload A

→ remove only A hooks/tools
→ B remains unchanged
```

Ownership is required even though hot reload/package management is out of scope.

## 6. Hook names

```ts
type HookName =
  | "before_run"
  | "before_model"
  | "after_model"
  | "before_tool"
  | "after_tool"
  | "after_turn"
  | "after_run";
```

A hook is a public architectural commitment. Do not mirror every internal function.

## 7. Event vs Hook

```text
EventBus
→ observe
→ logging / UI / tracing / metrics

HookPipeline
→ participate
→ transform / gate / cleanup
```

Event listeners must not become an undocumented mutation API.

## 8. Deterministic ordering

v0.5 ordering:

```text
1. extension load order
2. handler registration order inside extension
```

No numeric priorities.

The pipeline stores a monotonic sequence number so ordering remains stable independent of Map/Object iteration details.

## 9. Hook categories

### Observe

```text
after_model
after_turn
after_run
```

These do not replace core artifacts in v0.5.

### Transform

```text
before_model
after_tool
```

Transforms must return structured values. No direct mutation of prior durable history.

### Gate + Transform

```text
before_tool
```

Reference decision:

```ts
type BeforeToolDecision =
  | { action: "continue" }
  | { action: "replace"; arguments: Record<string, JsonValue> }
  | { action: "block"; reason: string };
```

Composition:

```text
original call
   ↓ A continue
call v1
   ↓ B replace args
call v2
   ↓ C continue
call v2
   ↓
ToolRegistry validation
   ↓
Tool.execute
```

A block stops later `before_tool` handlers and becomes an explicit failed ToolResult.

## 10. Context contributions

Extensions may contribute model-visible context only through `ContextSupplement` before `ContextRuntime` planning.

Required:

```text
Extension supplements
        ↓
ContextRuntime.prepare()
        ↓
ContextPlanner
        ↓
PreparedContext
```

Forbidden:

```text
PreparedContext
        ↓
append extension prompt afterwards   ❌
```

This preserves the v0.3/v0.4 budget invariant.

## 11. Tool registration

An Extension-registered Tool is an ordinary Tool:

```text
registerTool(tool)
     ↓
ToolRegistry
     ↓
before_tool hooks
     ↓
Tool.execute
     ↓
after_tool hooks
```

No special extension execution protocol.

Tool-name collision is explicit failure by default. v0.5 does not silently replace existing tools.

## 12. Failure semantics

Intercepting hook failure:

```text
handler throws
→ ExtensionHookError
→ include extensionName + hook + cause
→ current operation/run fails visibly
```

Cleanup/observational hook failure:

```text
record ExtensionHookError
continue remaining cleanup handlers where safe
```

v0.5 will define which hooks are strict vs cleanup in code/tests rather than swallowing all exceptions.

## 13. Cancellation

Every async handler receives:

```ts
interface HookContext {
  signal: AbortSignal;
}
```

Abort propagates through hook execution. Extensions must not spawn uncancellable hidden work in the synchronous run path.

## 14. Unload

`ExtensionHost.unload(name)` must:

```text
identify extension
remove owned hooks
remove owned tools
run extension cleanup if defined
remove loaded extension record
```

Unload is not hot reload. Reload/file watching remain future work.

## 15. Non-goals

- MCP
- session trees
- permissions/sandbox
- RPC
- extension marketplace
- remote code download
- hot reload/file watching
- numeric hook priorities
- unrestricted message mutation
- provider-specific hooks
- background task manager
