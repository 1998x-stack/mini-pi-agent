# mini-pi-agent v0.4

## 1. Version identity

- **Branch:** `v0.4`
- **Base snapshot:** completed `v0.3`
- **Current package:** `0.3.0` until v0.4 is frozen
- **Target package:** `0.4.0`
- **Theme:** Skills, progressive disclosure, and workflow knowledge above the runtime
- **Status:** **active design snapshot**

Primary mental model:

> **A Skill is discoverable workflow knowledge. It changes what the model knows how to do without changing how the Agent Runtime executes.**

The second invariant is inherited directly from v0.3:

> **Available knowledge is not the same thing as model-visible context.**

A repository may contain hundreds of Skills while a normal turn should expose only a compact catalog and a small number of explicitly activated Skill bodies.

---

## 2. Architectural delta from v0.3

v0.3 established:

```text
durable history
      ↓
ContextRuntime
      ↓
budgeted PreparedContext
      ↓
LLMProvider
```

v0.4 adds a workflow-knowledge layer above those mechanisms:

```text
Skill roots
    ↓
SkillSource / discovery
    ↓
SkillRegistry
    │
    ├── compact descriptors ───────┐
    │                              │
    └── selected descriptor        │
             ↓                     │
         SkillLoader               │
             ↓                     │
         LoadedSkill               │
             └──────────────┬──────┘
                            ↓
                    Context supplements
                            ↓
                     ContextRuntime
                            ↓
                    PreparedContext
                            ↓
                       AgentLoop
```

The Agent Loop must not grow branches such as:

```ts
if (skill.name === "code-review") {
  // forbidden special runtime behavior
}
```

---

## 3. Skill != Tool != Extension

```text
Skill
────────────────────────
metadata
instructions
references
scripts/assets as package resources
changes model guidance

Tool
────────────────────────
schema
executor
changes environment

Extension (v0.5)
────────────────────────
trusted executable registration/hooks
changes runtime behavior
```

A Skill may tell the model to call ordinary tools, but the Skill itself is not an executor.

Strict rule:

```text
discover != execute
load != execute
```

Scripts shipped inside a Skill execute only through normal tools such as the opt-in shell path. v0.4 creates no hidden execution channel.

---

## 4. Progressive disclosure

v0.4 is organized around four levels:

```text
Level 0
name + description
cheap catalog metadata

        ↓ activated

Level 1
full SKILL.md instructions

        ↓ requested when useful

Level 2
references/*.md and similar resources
loaded through ordinary file tools

        ↓ explicitly executed when useful

Level 3
scripts / assets / templates
still governed by ordinary tool/runtime policy
```

The default model context must not inject every full Skill body.

---

## 5. Target package model

Recommended minimal package:

```text
.mini-pi/skills/
└── code-review/
    ├── SKILL.md              required
    ├── references/           optional
    ├── scripts/              optional
    └── assets/               optional
```

Educational `SKILL.md` subset:

```markdown
---
name: code-review
description: Review changes for bugs, regressions, missing tests and maintainability risks.
---

# Code Review

## Workflow
...
```

Initial metadata deliberately stays small:

```ts
interface SkillManifest {
  name: string;
  description: string;
  metadata?: Record<string, string>;
}
```

---

## 6. Core contracts

Discovery object:

```ts
interface SkillDescriptor {
  name: string;
  description: string;
  root: string;
  manifestPath: string;
  metadata?: Record<string, string>;
}
```

Loaded body:

```ts
interface LoadedSkill {
  descriptor: SkillDescriptor;
  instructions: string;
}
```

Source:

```ts
interface SkillSource {
  discover(context: SkillDiscoveryContext): Promise<SkillDescriptor[]>;
}
```

Registry:

```ts
interface SkillRegistry {
  list(): readonly SkillDescriptor[];
  get(name: string): SkillDescriptor | undefined;
}
```

Loader:

```ts
interface SkillLoader {
  load(descriptor: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill>;
}
```

Activation state is run-scoped in v0.4.

---

## 7. Activation model

The reference activation mechanism reuses the existing tool feedback loop through a tiny adapter:

```text
available descriptors
       ↓
LLM chooses
       ↓
load_skill(name)
       ↓
SkillActivationTool
       ↓
SkillRegistry + SkillLoader
       ↓
run-scoped ActiveSkillStore
       ↓
next context preparation includes loaded instructions
```

`load_skill` is an adapter over Skill mechanics; conceptually a Skill remains workflow knowledge rather than an environment capability.

Explicit/manual activation may also be exposed later through CLI syntax such as `/skill:code-review`, but CLI behavior must call the same activation mechanism rather than create a second Skill runtime.

---

## 8. Context integration rule

Skill material must participate in v0.3 budgeting.

Preferred shape:

```ts
interface ContextSupplement {
  id: string;
  kind: "skill-catalog" | "active-skill";
  content: string;
  required: boolean;
}
```

Exact fields may evolve during v0.4.4, but the invariant is fixed:

```text
SkillRegistry / ActiveSkills
            ↓
Context supplements
            ↓
ContextRuntime / ContextPlanner
            ↓
PreparedContext
```

Forbidden shortcut:

```text
Skill text
   ↓
raw string append after planner
```

No Skill content may bypass context-budget accounting.

---

## 9. Reference/source loading

`SkillLoader` loads only `SKILL.md`.

Optional references remain discoverable through instructions and are read using existing file tools:

```text
LoadedSkill
   ↓
"For security review read references/security.md"
   ↓
normal read tool
```

This avoids inventing a separate reference execution protocol.

Skill-relative helper paths, when implemented, must remain inside the Skill root. Workspace file tools retain their existing workspace-root safety rules; the two roots must not be conflated.

---

## 10. Planned increments

```text
v0.4.1  Skill manifest parser + core types
v0.4.2  filesystem discovery + SkillRegistry
v0.4.3  SkillLoader + path/root validation
v0.4.4  compact catalog + context supplement seam
v0.4.5  run-scoped activation + load_skill adapter
v0.4.6  references/events/manual activation surface
v0.4.7  Agent integration + examples + freeze
```

Each increment must preserve one dominant learning objective. Do not jump directly to activation before descriptor discovery/loading contracts are proven.

---

## 11. Explicit non-goals

Keep out of v0.4:

- executable Extension hooks;
- MCP servers/tools/resources;
- marketplace/package installation;
- remote Skill registry;
- semantic vector search over Skills;
- automatic script execution;
- permission/sandbox implementation;
- persistent global activation;
- Skill dependency graphs;
- numeric Skill priorities;
- hot reload;
- subagents;
- provider-specific Skill protocols.

Those belong to later versions or require evidence before adding complexity.

---

## 12. Branch rule

`v0.4` is now the canonical branch for the Skills mental model.

During design and implementation:

```text
v0.3 remains frozen
v0.4 receives Skills-only deltas
package remains 0.3.0 until the v0.4 final freeze
```

Only after all v0.4 acceptance checks pass should the branch be marked an implemented historical snapshot and the package/version metadata advance to `0.4.0`.
