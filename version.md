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
      ↓
owned registrations
      ↓
HookPipeline
```

The Host now guarantees:

```text
normalized unique Extension identity
deterministic serialized setup order
setup-scoped registration capability
atomic rollback on failed setup
exact owned-registration cleanup on unload
```

`Agent` and `AgentLoop` are not integrated with Extensions yet.

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

## Extension setup lifecycle

```text
ExtensionHost.load(definition)
      ↓
validate name/version/setup
      ↓
create owned registration set
      ↓
open scoped ExtensionAPI
      ↓
await setup(api)
      ↓
SUCCESS                 FAILURE
  │                         │
close API               close API
  │                         │
commit loaded record     rollback registrations
                            │
                       ExtensionSetupError
```

The scoped API cannot be retained and used to register handlers after setup completes.

## Ordering

Reference v0.5 order remains intentionally simple:

```text
Extension load invocation order
then
handler registration order within each setup
```

Host operations are serialized so async setup completion timing cannot change handler ordering.

No numeric hook priorities exist in v0.5.

## Completed increments

```text
v0.5.1  hook contracts + deterministic HookPipeline          ✅
v0.5.2  ExtensionDefinition + ExtensionHost + ownership      ✅
```

## Next increment

```text
v0.5.3  Extension-owned Tool registration + unload cleanup   ← next
```

The next step adds `registerTool()` to the same setup-scoped `ExtensionAPI` and makes Tool registrations participate in the same ownership/rollback/unload model.

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
