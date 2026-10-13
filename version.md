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
```

The Host now guarantees:

```text
normalized unique Extension identity
deterministic serialized setup order
setup-scoped registration capability
atomic rollback across mixed hook/tool registrations
exact owned-registration cleanup on unload
```

`Agent` and `AgentLoop` are not integrated with Extension hooks yet.

## Tool registration invariant

Extension Tools are ordinary Tools:

```text
ExtensionAPI.registerTool(tool)
      ↓
ToolRegistry.register(tool)
      ↓
ToolRegistry.get / validate
      ↓
Tool.execute
```

There is no separate Extension Tool executor.

`ToolRegistry.register()` returns an identity-safe removable handle. Disposing an old registration cannot remove a later replacement under the same name.

Duplicate Tool names fail explicitly through `ToolAlreadyRegisteredError`; Extension setup preserves that typed error as `ExtensionSetupError.cause` and rolls back earlier registrations from the same setup.

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

`before_tool` is the strongest initial gate/transform seam:

```text
ToolCall
  ↓
continue / replace arguments / block
```

Only explicit handler return values have runtime meaning. Handler mutation of cloned event input does not.

## Ordering

Reference v0.5 order remains intentionally simple:

```text
Extension load invocation order
then
handler registration order within each setup
```

Host operations are serialized so async setup completion timing cannot change registration ordering.

No numeric hook priorities exist in v0.5.

## Completed increments

```text
v0.5.1  hook contracts + deterministic HookPipeline          ✅
v0.5.2  ExtensionDefinition + ExtensionHost + ownership      ✅
v0.5.3  Extension-owned Tool registration + unload cleanup   ✅
```

## Next increment

```text
v0.5.4  before_tool gate/replace Runtime integration          ← next
```

The next step inserts the already-defined HookPipeline into the ordinary ToolCall → ToolRegistry.validate → Tool.execute path, preserving ToolCall id/name and turning blocks into explicit error ToolResults.

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
