# mini-pi-agent v0.4

## 1. Version identity

- **Branch:** `v0.4`
- **Base snapshot:** completed `v0.3`
- **Current package:** `0.3.0` until v0.4 is frozen
- **Target package:** `0.4.0`
- **Theme:** Skills, progressive disclosure, and workflow knowledge above the runtime
- **Status:** **active implementation snapshot**

Primary mental model:

> **A Skill is discoverable workflow knowledge. It changes model guidance without changing runtime execution semantics.**

Inherited v0.3 invariant:

> **Available knowledge is not the same thing as model-visible context.**

---

## 2. Current architecture

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
              │ selected descriptor
              ▼
    FilesystemSkillLoader
              │
              ▼
          LoadedSkill
              │
       ┌──────┴─────────┐
       ▼                ▼
compact catalog     active body
       │                │
       └──────┬─────────┘
              ▼
      ContextSupplement[]
              │
              ▼
        ContextRuntime
              │
     summary + supplements
     rendered before planner
              │
              ▼
     KeepRecentContextPlanner
              │
              ▼
       PreparedContext
              │
              ▼
          LLMProvider
```

The Agent Loop still contains no Skill-specific branch.

---

## 3. Progressive disclosure state

```text
Level 0 — descriptor catalog                         ✅
name + description only in model catalog

Level 1 — selected SKILL.md instructions             ✅ primitive + context supplement

Level 2 — optional references                        not auto-loaded

Level 3 — scripts/assets/templates                   not auto-executed
```

Strict rules:

```text
discover != load
load != activate
activate != execute
knowledge source != durable history
```

---

## 4. Completed increments

### v0.4.1 — Skill manifest parser + core types ✅

Implemented deterministic parsing for the educational scalar-frontmatter `SKILL.md` subset.

### v0.4.2 — ProjectSkillSource + SkillRegistry ✅

Implemented one-level project discovery and deterministic descriptor identity/order semantics.

### v0.4.3 — SkillLoader + path/root validation ✅

Implemented safe on-demand loading of exactly one selected `SKILL.md`, including lexical containment, real file/symlink checks, canonical `realpath` checks, identity-drift detection, descriptor cloning, and cancellation propagation.

### v0.4.4 — Catalog renderer + context supplement seam ✅

Implemented:

```text
src/skills/catalog.ts
src/context/supplements.ts
src/context/errors.ts
src/context/runtime.ts
src/context/index.ts
src/skills/index.ts

tests/skill-catalog.test.ts
tests/context-supplements.test.ts
```

Generic model-only context contract:

```ts
interface ContextSupplement {
  id: string;
  kind: "skill-catalog" | "active-skill";
  content: string;
  required: boolean;
}
```

Skill producers:

```ts
renderSkillCatalog(descriptors)
createSkillCatalogSupplement(descriptors)
createLoadedSkillSupplement(loadedSkill)
skillSupplementId(name)
```

Catalog semantics:

```text
SkillDescriptor[]
      ↓ deterministic normalized-name order
<available_skills>
{"name":"code-review","description":"Review changes."}
{"name":"release","description":"Prepare a release."}
</available_skills>
```

The catalog deliberately excludes:

```text
instructions
metadata
root
manifestPath
references/scripts/assets
```

Active Skill semantics:

```text
LoadedSkill
   ↓
required active-skill ContextSupplement
   ↓
full instructions for that selected Skill only
```

ContextRuntime now accepts:

```ts
interface ContextRuntimePrepareInput {
  systemPrompt: string;
  history: readonly AgentMessage[];
  supplements?: readonly ContextSupplement[];
  signal: AbortSignal;
}
```

Composition order:

```text
base system prompt
      ↓
summary checkpoint, if any
      ↓
normalized context supplements
      ↓
ContextPlanner.prepare()
      ↓
final budget validation
```

Therefore Skill material cannot bypass token accounting by being appended after planning.

The reference runtime currently treats every supplied supplement as mandatory model-visible system material. `required` is explicit policy metadata for later strategies; v0.4.4 does not silently drop optional or required supplements.

Supplement identity/order semantics:

- ids are validated and unique;
- catalog renders before active Skill bodies;
- active bodies are deterministically ordered by supplement id;
- safe Skill names get readable ids such as `skill:name:code-review`;
- other names use collision-safe UTF-8 hex ids;
- invalid/duplicate supplements fail through `InvalidContextSupplementError`.

Most importantly:

```text
ContextSupplement
!=
AgentMessage
```

Catalog, active instructions, and summary checkpoints are provider-context artifacts only. They are never appended to durable conversation history.

### v0.4.4 verification

The source subset passed TypeScript checking under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
Skill catalog + active Skill + existing summary
→ all rendered once in model-only system context
→ estimator/planner includes them in input budget
→ provider-visible messages begin after summary coverage
→ durable history remains unchanged

oversized active Skill supplement
→ ContextBudgetExceededError
→ no post-planner bypass
```

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## 5. Implementation stages

```text
v0.4.1  Skill manifest parser + core types                   ✅
v0.4.2  ProjectSkillSource + SkillRegistry                  ✅
v0.4.3  SkillLoader + path/root validation                  ✅
v0.4.4  compact catalog + context supplement seam           ✅
v0.4.5  run-scoped activation + load_skill adapter          ← next
v0.4.6  references + events + manual activation surface
v0.4.7  Agent integration + examples + 0.4.0 freeze
```

---

## 6. Next increment — v0.4.5

The next problem is now:

```text
The runtime can discover Skills, safely load one,
and budget catalog/active bodies.

How does the model request activation during a run?
```

v0.4.5 introduces:

```text
ActiveSkillStore
SkillActivationService
load_skill Tool adapter
```

Target flow:

```text
compact catalog
      ↓
model calls load_skill(name)
      ↓
SkillActivationService
      ↓
SkillRegistry lookup
      ↓
SkillLoader.load()
      ↓
run-scoped ActiveSkillStore
      ↓
next ContextRuntime.prepare()
      ↓
active-skill supplement
```

Key invariant:

> `load_skill` acknowledges activation with a compact ToolResult; it must not duplicate the entire Skill body inside durable tool history.

---

## 7. Explicit non-goals

Keep out of v0.4:

- executable Extension hooks;
- MCP;
- remote Skill marketplace/registry;
- vector-search Skill selection;
- automatic script execution;
- permissions/sandbox implementation;
- persistent global activation;
- dependency graphs;
- hot reload;
- subagents;
- provider-specific Skill protocols.

---

## 8. Branch rule

`v0.3` remains frozen. `v0.4` receives Skills-only deltas. Package metadata remains `0.3.0` until the complete v0.4 acceptance contract passes and the branch freezes as `0.4.0`.
