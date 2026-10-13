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

---

## Current architecture

```text
Extension-owned handler
        │
        ▼
   HookPipeline
        │
        ├── deterministic registration order
        ├── cloned HookEvent inputs
        ├── explicit structured results
        ├── cancellation propagation
        └── ExtensionHookError provenance
```

The first implemented runtime primitive is now the hook pipeline itself. It is not connected to Agent/AgentLoop yet.

Target v0.5 architecture remains:

```text
ExtensionDefinition[]
        │
        ▼
   ExtensionHost
        │
        ├── owned Tool registrations ─────► ToolRegistry
        │
        ├── owned Hook registrations ─────► HookPipeline
        │
        └── context contributions ─────────► ContextSupplement[]
                                             │
                                             ▼
                                       ContextRuntime
```

`AgentLoop` may eventually know generic hook names/results, but must never branch on concrete Extension names.

---

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

Current result powers:

```text
before_run / before_model
→ ContextSupplement contributions

after_model / after_turn / after_run
→ observe only

before_tool
→ continue
→ replace arguments
→ block

after_tool
→ constrained ToolResult replacement
```

Direct HookEvent mutation is ignored because every handler receives a clone. Behavioral changes must be returned explicitly.

---

## Ordering

Reference v0.5 ordering is intentionally simple:

```text
registration order
```

Once ExtensionHost exists this naturally means:

```text
extension load order
then handler registration order within each extension
```

No numeric hook priority system exists in v0.5.

---

## Error / cancellation semantics

```text
handler throws
→ ExtensionHookError(extensionName, hook, cause)

AbortSignal aborts
→ original abort reason propagates
→ later handlers do not run
```

A `before_tool` block short-circuits later handlers and records the blocking owner.

---

## Implementation stages

```text
v0.5.1  hook contracts + deterministic HookPipeline           ✅
v0.5.2  ExtensionDefinition + ExtensionHost + ownership       ← next
v0.5.3  extension-owned Tool registration + unload cleanup
v0.5.4  before_tool gate/transform integration
v0.5.5  model/run hooks + budgeted context contributions
v0.5.6  failure/cancellation/events/cleanup semantics
v0.5.7  Agent integration + examples + 0.5.0 freeze
```

---

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
- direct mutable AgentState access;
- provider-specific hook APIs.

---

## Verification status

v0.5.1 source subset passed strict TypeScript checking with:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified transform chaining, block short-circuit/provenance, source-event immutability, original abort-reason propagation, and ExtensionHookError cause provenance.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## Branch rule

`v0.4` remains frozen. Package/runtime stays `0.4.0` until all v0.5 acceptance checks pass. Only v0.5.7 may freeze the branch as `0.5.0`.
