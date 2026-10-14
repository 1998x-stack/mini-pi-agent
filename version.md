# mini-pi-agent v0.5

## Version identity

- **Branch:** `v0.5`
- **Base snapshot:** frozen `v0.4.0`
- **Current package/runtime:** `0.4.0` until v0.5 freeze
- **Target package/runtime:** `0.5.0`
- **Theme:** Extensions + lifecycle hooks
- **Status:** **active implementation snapshot**

Primary mental model:

> **A Skill teaches the model how to work; an Extension is trusted executable code that changes runtime behavior only through explicit lifecycle contracts.**

Second invariant:

> **Event observes. Hook participates.**

## Current architecture

```text
ExtensionDefinition
      ↓
ExtensionHost
      ↓
scoped ExtensionAPI during setup only
      ├── on(hook, handler)
      │       ↓
      │   HookPipeline
      │
      └── registerTool(tool)
              ↓
          ToolRegistry
              ↓
        executeToolCall()
              ↓
       before_tool pipeline
              ↓
     validate / execute / block
```

The Host guarantees normalized unique identity, deterministic serialized setup, atomic mixed hook/tool rollback, and exact owned-registration cleanup.

## Tool execution invariant

Every Tool category uses the same ordinary execution path:

```text
built-in Tool
Skill Tool such as load_skill
Extension-owned Tool
        │
        ▼
ToolRegistry.get()
        ↓
before_tool HookPipeline
        ├── continue
        ├── replace arguments only
        └── block
        ↓
ToolRegistry.validate(final args)
        ↓
Tool.execute(final args)
```

There is no Extension-specific Tool executor.

A block becomes an explicit durable error `ToolResultMessage`; the blocked Tool implementation is never executed and the following model turn can observe the denial.

`ExtensionHookError` and run cancellation remain run-level failures rather than being downgraded to ToolResults.

## Hook surface

```text
before_run
before_model
after_model
before_tool
after_tool
after_turn
after_run
```

Only explicit Hook return values have runtime meaning. Handler mutation of cloned input does not.

## Ordering

```text
Extension load invocation order
then
handler registration order within each setup
```

No numeric hook priorities exist in v0.5.

## Completed increments

```text
v0.5.1  hook contracts + deterministic HookPipeline          ✅
v0.5.2  ExtensionDefinition + ExtensionHost + ownership      ✅
v0.5.3  Extension-owned Tool registration + unload cleanup   ✅
v0.5.4  before_tool Runtime integration                       ✅
```

## Next increment

```text
v0.5.5  model/run hooks + budgeted context contributions      ← next
```

The next step integrates `before_run`, `before_model`, `after_model`, `after_tool`, `after_turn`, and `after_run`. Any Extension-added model-visible material must enter as `ContextSupplement[]` before ContextRuntime/ContextPlanner budgeting.

## Explicit non-goals

Keep out of v0.5:

- MCP transport/client (`v0.6`);
- session DAG/branching (`v0.7`);
- permission/sandbox implementation (`v0.8`);
- RPC/headless protocol (`v0.9`);
- extension marketplace or remote code download;
- hot reload/file watching;
- numeric hook priorities;
- background task manager;
- direct mutable `AgentState` access;
- provider-specific hook APIs.

## Branch rule

`v0.4` remains frozen. Package/runtime stays `0.4.0` until all v0.5 acceptance checks pass. Only v0.5.7 may freeze the branch as `0.5.0`.
