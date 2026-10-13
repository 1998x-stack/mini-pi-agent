# v0.4 Skills Architecture — Implemented Snapshot

## 1. Objective

v0.4 answers one question:

```text
How can an Agent gain task-specific workflow knowledge
without hard-coding workflows into runtime execution mechanics?
```

Implemented answer:

```text
Skill package
   ↓
descriptor discovery
   ↓
compact catalog
   ↓
on-demand safe loading
   ↓
run-scoped activation
   ↓
budgeted ContextSupplement
```

A Skill teaches. Tools execute. Extensions in v0.5 will customize runtime behavior.

---

## 2. Final layering

```text
Agent
 │
 ├── ToolRegistry ─────────────── load_skill Tool
 │                                  │
 │                                  ▼
 │                         SkillActivationService
 │                                  │
 │                         ┌────────┴────────┐
 │                         ▼                 ▼
 │                    SkillRegistry      SkillLoader
 │                         │                 │
 │                         └────────┬────────┘
 │                                  ▼
 │                           ActiveSkillStore
 │                                  │
 │                                  ▼
 │                        active Skill supplements
 │
 ├── SkillRuntime
 │      ├── compact catalog supplement
 │      └── active Skill supplements
 │
 └── ContextRuntime
        ↓
    ContextPlanner
        ↓
   PreparedContext
        ↓
    LLMProvider
```

The concrete Skill subsystem does not belong inside `runAgentLoop()`.

The loop only receives:

```ts
contextSupplements?: () => readonly ContextSupplement[]
```

That generic seam can later serve other model-only context producers.

---

## 3. Core data model

```ts
interface SkillManifest {
  name: string;
  description: string;
  metadata?: Record<string, string>;
}

interface SkillDescriptor {
  name: string;
  description: string;
  root: string;
  manifestPath: string;
  metadata?: Record<string, string>;
}

interface LoadedSkill {
  descriptor: SkillDescriptor;
  instructions: string;
}
```

There is intentionally no separate mutable `ActiveSkill` object in v0.4. Run-scoped active state is represented by `ActiveSkillStore<LoadedSkill>` semantics.

---

## 4. Progressive disclosure

```text
Level 0
SkillDescriptor
name + description

Level 1
LoadedSkill.instructions
selected SKILL.md only

Level 2
references/*
ordinary explicit file-tool reads

Level 3
scripts/assets/templates
ordinary explicit tool paths
```

This means:

```text
100 discovered Skills
!=
100 loaded Skill bodies
!=
100 bodies in model context
```

---

## 5. Discovery

Reference location:

```text
<cwd>/.mini-pi/skills/*/SKILL.md
```

`ProjectSkillSource` scans one child-directory level and returns descriptors only.

Discovery does not:

```text
activate Skills
traverse references
execute scripts
inject context
```

A missing Skill root means an empty catalog.

---

## 6. Registry

`SkillRegistry` owns descriptor identity.

Normalization:

```text
trim + lowercase
```

Therefore case/outer-whitespace variants are the same identity.

Duplicate normalized names fail with `DuplicateSkillError` rather than using source order as hidden precedence.

Registry list/get operations return copies.

---

## 7. Safe on-demand loading

`FilesystemSkillLoader` loads exactly one selected `SKILL.md`.

Validation layers:

```text
1. root is absolute
2. manifestPath is absolute
3. manifest remains lexically under root
4. manifestPath == root/SKILL.md
5. root is a real directory, not a symlink
6. manifest is a real regular file, not a symlink
7. realpath(manifest) remains under realpath(root)
8. canonical manifest == canonical-root/SKILL.md
9. parsed manifest name matches descriptor normalized identity
```

It does not preload optional package resources.

---

## 8. Catalog and active context

Catalog representation exposes only:

```text
name
description
```

Never:

```text
instructions
root
manifestPath
metadata
reference/script contents
```

Selected `LoadedSkill` bodies are rendered as `active-skill` supplements.

Generic contract:

```ts
interface ContextSupplement {
  id: string;
  kind: "skill-catalog" | "active-skill";
  content: string;
  required: boolean;
}
```

Supplements are model-only context artifacts:

```text
ContextSupplement != AgentMessage
```

---

## 9. Budget integration

Composition order:

```text
base system prompt
      ↓
summary checkpoint
      ↓
normalized ContextSupplement[]
      ↓
ContextPlanner.prepare()
      ↓
PreparedContext
```

No Skill text is appended after planning.

The v0.4 reference policy treats supplied supplements as mandatory. If they make the system material exceed the resolved input budget, the runtime raises `ContextBudgetExceededError`.

---

## 10. Activation

Active store:

```ts
interface ActiveSkillStore {
  list(): readonly LoadedSkill[];
  get(name: string): LoadedSkill | undefined;
  activate(skill: LoadedSkill): LoadedSkill;
  clear(): void;
}
```

Reference semantics:

```text
normalized-name idempotency
first active body wins for the current run
clone-on-read/write
explicit clear()
```

Shared service:

```text
requested name
      ↓
ActiveSkillStore
      ↓ not active
SkillRegistry
      ↓
SkillLoader
      ↓
post-load active re-check
      ↓
ActiveSkillStore.activate
```

Both model-driven and manual activation use this service.

---

## 11. `load_skill`

Model-driven activation reuses the existing Tool protocol:

```text
LLM ToolCall
   ↓
load_skill(name)
   ↓
SkillActivationService
   ↓
compact ToolResult
```

Example ToolResult:

```text
Skill 'code-review' activated.
```

The ToolResult never contains full instructions. The body appears on the next model turn through `ActiveSkillStore → ContextSupplement`.

---

## 12. Run scope

`Agent.create()` discovers project Skills once and builds the catalog/runtime.

`Agent.prompt()` owns active lifetime:

```text
prompt start
→ clear active store

turns
→ Skills may activate and remain active

prompt finally
→ clear active store
```

This prevents cross-prompt active-body leakage while keeping project discovery stable.

---

## 13. Events

Skill lifecycle:

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

Events contain metadata, never full instructions.

`SkillEventBus` isolates observer failures. `Agent` bridges Skill events into the normal Agent event stream with `runId` and `turn` when activation happens inside a run.

---

## 14. Reference/script boundary

Skills do not introduce hidden execution channels.

```text
references/foo.md
→ ordinary read/file ToolCall

scripts/check.mjs
→ ordinary explicit execution ToolCall
```

This keeps later permission/sandbox policy in the ordinary intent → execution path.

---

## 15. Architectural invariants

```text
Skill != Tool
Skill != Extension

discover != load
load != activate
activate != execute

available knowledge != model-visible context
model-visible Skill context != durable history
```

Those invariants define the frozen v0.4 learning snapshot.
