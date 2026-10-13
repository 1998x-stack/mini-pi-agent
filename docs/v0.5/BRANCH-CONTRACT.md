# v0.5 Branch Contract

## 1. Purpose

`v0.5` is the canonical learning branch for:

```text
Extensions + lifecycle hooks
```

It starts from frozen `v0.4.0` and adds trusted imperative runtime customization only.

## 2. Allowed work

This branch may change:

```text
src/extensions/**
src/core/agent.ts for Extension composition
src/core/agent-loop.ts for generic hook seams
src/core/events.ts for metadata-only Extension lifecycle events
src/context/** only for generic pre-budget supplement composition
src/index.ts
examples/** Extension examples
tests/** Extension tests
docs/v0.5/**
docs/versions/v0.5.md
version.md
README.md / CHANGELOG.md during freeze
package.json / src/version.ts only at final v0.5 freeze
```

## 3. Forbidden work

Do not pull forward:

```text
v0.6 MCP client/transport
v0.7 session DAG/branching
v0.8 permission/sandbox system
v0.9 RPC/headless protocol
remote Extension marketplace
code download/install/update
hot reload/file watching
numeric hook priority graph
background task manager
provider-specific hook APIs
subagent framework
```

## 4. Ancestry

```text
v0.4  frozen Skills snapshot
  │
  └── v0.5  active Extensions branch
```

Do not rewrite v0.4 to support Extensions.

## 5. Version rule

Until final acceptance:

```text
package.json version = 0.4.0
MINI_PI_VERSION      = 0.4.0
```

Only v0.5.7 may advance both to `0.5.0`.

## 6. Increment order

Mandatory sequence:

```text
0.5.1 HookPipeline/types
  ↓
0.5.2 ExtensionHost/API/ownership
  ↓
0.5.3 owned Tool registration
  ↓
0.5.4 before_tool integration
  ↓
0.5.5 model/run/context hooks
  ↓
0.5.6 failure/cancellation/cleanup/observability
  ↓
0.5.7 Agent integration/freeze
```

Do not mark a later stage complete while an earlier dependency remains conceptual.

## 7. Completion rule per increment

An increment may be marked implemented only when:

```text
source exists on v0.5
public exports are correct
focused tests exist
strict TypeScript subset passes
runtime smoke covers the dominant invariant where useful
docs status is updated
full-suite status is stated honestly
```

## 8. Core invariants

Every change must preserve:

```text
Event != Hook
Skill != Extension
Tool != Extension
Extension-owned Tool == ordinary Tool
AgentLoop never branches on Extension name
Extension has no direct mutable AgentState access
Extension context participates in budget accounting
hook ordering is deterministic
registration ownership is explicit
unload removes only owned registrations
```

## 9. Mutation rule

No general hook may receive mutable durable history.

Allowed transformations are explicit and narrow:

```text
before_tool → arguments / block decision
before_model → ContextSupplement contribution
potential after_tool → constrained result transform
```

Not allowed:

```text
messages.push(...) from Extension
rewrite arbitrary prior AgentMessage
replace AssistantMessage silently
overwrite private Agent fields
```

## 10. Context rule

All Extension model-visible content must be composed before final ContextPlanner budgeting.

Forbidden:

```text
PreparedContext
  ↓
append Extension prompt after budget   ❌
```

## 11. Execution rule

Extension-registered Tools use the existing Tool contract and execution path.

No `Extension.executeTool()` bypass.

## 12. Ordering rule

v0.5 ordering is only:

```text
Extension load order
then handler registration order
```

No priority integers, before/after dependency graph, or topological ordering in this version.

## 13. Error rule

Hook errors must carry owner + hook provenance.

Do not silently swallow intercepting hook failures.
Do not let one cleanup-hook failure prevent all later cleanup attempts.

## 14. Cancellation rule

All async hook execution receives the active AbortSignal and checks/propagates cancellation.

Extensions must not start hidden uncancellable background work as part of the run path.

## 15. Freeze rule

Freeze v0.5 only after:

```text
all v0.5.1–v0.5.7 increments complete
end-to-end Extension lifecycle proven
v0.4 invariants preserved
package/runtime updated to 0.5.0
README/CHANGELOG/version docs reflect implemented behavior
branch marked historical learning snapshot
```

After freeze, new architecture work moves to `v0.6` rather than expanding v0.5 indefinitely.