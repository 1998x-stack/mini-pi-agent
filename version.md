# mini-pi-agent v0.5

## Version identity

- **Branch:** `v0.5`
- **Base snapshot:** frozen `v0.4.0`
- **Current package/runtime:** `0.4.0` until v0.5 freeze
- **Target package/runtime:** `0.5.0`
- **Theme:** Extensions + lifecycle hooks
- **Status:** **active design/implementation snapshot**

Primary mental model:

> **A Skill teaches the model how to work; an Extension is trusted executable code that changes runtime behavior only through explicit lifecycle contracts.**

Second invariant:

> **Event observes. Hook participates.**

---

## Target architecture

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

Agent / AgentLoop
        │
        ├── before_run
        ├── before_model
        ├── after_model
        ├── before_tool
        ├── after_tool
        ├── after_turn
        └── after_run
                 │
                 ▼
            HookPipeline
                 │
                 ▼
       extension handlers in
       deterministic order
```

`AgentLoop` may know hook names and generic hook results. It must never know concrete Extension names or policies.

---

## Extension / Skill / Tool boundary

```text
Skill
→ declarative workflow knowledge
→ changes model guidance

Tool
→ environment capability
→ executes an action

Extension
→ trusted runtime customization
→ registers capabilities and lifecycle handlers
```

Forbidden:

```text
Extension gets mutable Agent internals
Extension mutates durable history directly
Extension appends model text after ContextPlanner budgeting
AgentLoop branches on extension name
```

---

## Hook ordering

Reference v0.5 order is intentionally simple:

```text
extension load order
then
handler registration order within extension
```

No numeric priority system in v0.5.

---

## Initial hook surface

```text
before_run
before_model
after_model
before_tool
after_tool
after_turn
after_run
```

Categories:

```text
Observe   → after_model / after_turn / after_run
Transform → before_model / after_tool
Gate      → before_tool
```

The strongest initial interception point is `before_tool`:

```text
ToolCall
   ↓
before_tool handlers
   ├── continue
   ├── replace arguments
   └── block with explicit reason
   ↓
ordinary Tool execution
```

---

## Implementation stages

```text
v0.5.1  hook contracts + deterministic HookPipeline           ← next
v0.5.2  ExtensionDefinition + ExtensionHost + ownership
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
- extension package marketplace;
- dynamic remote code download;
- hot reload/file watching;
- numeric hook priorities;
- background task manager;
- direct mutable AgentState access;
- provider-specific hook APIs.

---

## Branch rule

`v0.4` remains frozen. Package/runtime stays `0.4.0` until all v0.5 acceptance checks pass. Only v0.5.7 may freeze the branch as `0.5.0`.