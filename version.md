# mini-pi-agent v0.4

## Version identity

- **Branch:** `v0.4`
- **Base snapshot:** completed `v0.3`
- **Package/runtime version:** `0.4.0`
- **Theme:** Skills + progressive disclosure
- **Status:** **implemented historical learning snapshot**

Primary mental model:

> **A Skill is discoverable workflow knowledge. It changes model guidance without changing runtime execution semantics.**

Inherited v0.3 invariant:

> **Available knowledge is not the same thing as model-visible context.**

---

## Final architecture

```text
<cwd>/.mini-pi/skills/*/SKILL.md
              │
              ▼
      ProjectSkillSource
              │
              ▼
      SkillDescriptor[]
              │
              ▼
        SkillRegistry
          │         │
          │         └──── compact catalog ───────────┐
          │ selected descriptor                      │
          ▼                                          │
    FilesystemSkillLoader                            │
          │                                          │
          ▼                                          │
       LoadedSkill                                   │
          │                                          │
          ▼                                          │
 SkillActivationService                              │
      ┌───┴──────────────┐                           │
      ▼                  ▼                           │
 load_skill Tool   ManualSkillActivator              │
      │                  │                           │
      └───────┬──────────┘                           │
              ▼                                      │
      ActiveSkillStore                               │
              │                                      │
              └──── active Skill supplements ─────────┘
                             │
                             ▼
                     ContextSupplement[]
                             │
                             ▼
                       ContextRuntime
                             │
                             ▼
                       ContextPlanner
                             │
                             ▼
                      PreparedContext
                             │
                             ▼
                        LLMProvider
```

`AgentLoop` remains Skill-agnostic. Its only v0.4 addition is a generic `contextSupplements()` seam.

---

## Progressive disclosure

```text
Level 0 — SkillDescriptor catalog                  ✅
Level 1 — selected SKILL.md instructions           ✅
Level 2 — references/* via ordinary file tools     ✅ boundary preserved
Level 3 — scripts/assets via ordinary tools        ✅ boundary preserved
```

Strict rules:

```text
discover != load
load != activate
activate != execute
Skill body != load_skill ToolResult
ContextSupplement != AgentMessage
```

---

## Implemented increments

```text
v0.4.1  manifest parser + core types                         ✅
v0.4.2  ProjectSkillSource + SkillRegistry                  ✅
v0.4.3  SkillLoader + path/root safety                      ✅
v0.4.4  compact catalog + ContextSupplement budget seam     ✅
v0.4.5  ActiveSkillStore + ActivationService + load_skill   ✅
v0.4.6  references boundary + events + manual activation    ✅
v0.4.7  Agent integration + examples + 0.4.0 freeze         ✅
```

---

## Agent run lifecycle

```text
Agent.create()
   ↓
discover project Skills once
   ↓
build SkillRegistry
   ↓
register ordinary load_skill Tool

Agent.prompt()
   ↓
clear ActiveSkillStore
   ↓
turn 1: catalog supplement only
   ↓
model may call load_skill(name)
   ↓
compact ToolResult enters durable history
   ↓
turn 2+: catalog + active Skill supplements
   ↓
run ends
   ↓
clear ActiveSkillStore
```

Catalog/discovery state lives for the Agent lifetime. Active Skill bodies are strictly run-scoped.

---

## Context invariant

Skill material is rendered before planner budgeting:

```text
base system prompt
      ↓
summary checkpoint
      ↓
Skill catalog + active bodies
      ↓
ContextPlanner.prepare()
      ↓
PreparedContext
```

Forbidden:

```text
PreparedContext
      ↓
append Skill text afterwards   ❌
```

If mandatory Skill material makes the input budget impossible, the runtime fails explicitly.

---

## Durable-history invariant

```text
Durable AgentMessage[]
contains:
- user messages
- assistant messages
- real tool calls/results

Does not contain:
- Skill catalog supplements
- active Skill supplements
- summary checkpoints
```

`load_skill` writes only a compact acknowledgement such as:

```text
Skill 'code-review' activated.
```

Full Skill instructions become model-visible only through `ContextSupplement` on the next turn.

---

## Observability

Skill lifecycle events:

```text
skill_activation_start
skill_activated
skill_activation_reused
skill_activation_failed
```

Origins:

```text
api | manual | tool
```

Events expose metadata only and never include full instructions. `Agent` bridges them into the regular Agent event stream with `runId` and `turn`.

---

## Safety / package-boundary semantics

`FilesystemSkillLoader` validates:

```text
absolute root
absolute manifestPath
lexical containment
exact <root>/SKILL.md path
non-symlink root
non-symlink manifest
canonical realpath containment
manifest identity stability
```

Loading still touches only the selected `SKILL.md`.

```text
references/*
→ ordinary file/read tools only

scripts/*
→ ordinary explicit execution tools only
```

No hidden resource execution channel exists in v0.4.

---

## Verification performed

Increment-level source subsets were checked under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

The v0.4.7 integration smoke verified:

```text
request 1 → catalog only
load_skill → compact durable acknowledgement
request 2 → catalog + selected active Skill body
request 3 in a new prompt → catalog only again
loader calls for selected Skill → 1
unselected Skill body → never provider-visible
Skill event payloads → no body leakage
```

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## Next version

`v0.4` is frozen. The next architectural theme is `v0.5`:

```text
Extensions / lifecycle hooks
```

A Skill teaches the model what to do. An Extension will be trusted executable runtime customization that changes registrations or lifecycle behavior.
