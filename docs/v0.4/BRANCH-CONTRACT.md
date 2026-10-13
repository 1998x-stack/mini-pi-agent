# v0.4 Branch Contract — Frozen

## Purpose

`v0.4` is the canonical historical learning branch for:

```text
Skills + progressive disclosure
```

It starts from the completed `v0.3` context-runtime snapshot and adds workflow-knowledge mechanisms without changing the meaning of tool execution.

## Final ancestry

```text
v0.3  implemented/frozen context snapshot
  │
  └── v0.4  implemented/frozen Skills snapshot
```

New architectural work belongs on `v0.5`.

---

## Completed increment order

```text
0.4.1 manifest parser/types                    ✅
0.4.2 discovery/registry                       ✅
0.4.3 loader/path safety                       ✅
0.4.4 catalog/context supplements              ✅
0.4.5 activation/load_skill                    ✅
0.4.6 events/references/manual activation      ✅
0.4.7 Agent integration/freeze                 ✅
```

Package/runtime version is now:

```text
0.4.0
```

---

## Frozen architectural invariants

```text
Skill != Tool
Skill != Extension
available Skills != fully loaded Skills
loaded Skill != executed script
durable history != Skill context
Skill context participates in budget accounting
AgentLoop remains workflow-agnostic
discovery/load remain non-executing
```

No code may append Skill bodies after context planning.

```text
Skill catalog / active bodies
      ↓
ContextSupplement[]
      ↓
ContextRuntime
      ↓
ContextPlanner
      ↓
PreparedContext
```

---

## Execution boundary

Skill package resources never receive privileged execution semantics.

```text
reference file
→ ordinary file/read tool

script
→ ordinary explicit shell/execution tool

asset/template
→ ordinary file/tool path
```

There is no `SkillLoader.execute()` path.

---

## Activation boundary

v0.4 activation is:

```text
run-scoped
idempotent by normalized Skill name
observable through metadata-only events
cleared before/after Agent.prompt()
```

Model-driven `load_skill`, manual activation, and API activation all share the same `SkillActivationService` and `ActiveSkillStore` semantics.

---

## AgentLoop boundary

The final loop contains no concrete Skill registry/loader/activation logic.

Its only v0.4 seam is generic:

```ts
contextSupplements?: () => readonly ContextSupplement[]
```

Concrete Skills orchestration remains in `SkillRuntime` and `Agent`.

---

## Deferred work

Still explicitly outside v0.4:

```text
v0.5 Extension hooks
v0.6 MCP
v0.7 session tree
v0.8 permissions/sandbox
v0.9 RPC/headless protocol
remote Skill marketplace/install/update
semantic Skill search
persistent/global Skill activation
subagents
provider-specific Skill protocols
```

The branch is frozen; these concerns must not be retrofitted into the v0.4 snapshot.
