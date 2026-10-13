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
          │         │
          │         └──────── compact catalog ───────┐
          │ selected descriptor                      │
          ▼                                          │
    FilesystemSkillLoader                            │
          │                                          │
          ▼                                          │
       LoadedSkill                                   │
          │                                          │
          ▼                                          │
 SkillActivationService                              │
          │                                          │
          ▼                                          │
 InMemoryActiveSkillStore                            │
          │                                          │
          └──────── active Skill supplements ─────────┘
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

Model-driven activation reuses the ordinary tool loop through:

```text
LLM
 ↓ tool_call
load_skill(name)
 ↓
SkillActivationService
 ↓
ActiveSkillStore
 ↓ compact ToolResult acknowledgement
next model turn
 ↓
active-skill ContextSupplement
```

The Agent Loop still contains no Skill-specific branch.

---

## 3. Progressive disclosure state

```text
Level 0 — compact descriptor catalog                 ✅
Level 1 — selected SKILL.md instructions             ✅
Level 2 — optional references                        not auto-loaded
Level 3 — scripts/assets/templates                   not auto-executed
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

## 4. Completed increments

### v0.4.1 — Skill manifest parser + core types ✅

Deterministic parser for the educational scalar-frontmatter `SKILL.md` subset.

### v0.4.2 — ProjectSkillSource + SkillRegistry ✅

Descriptor-only one-level project discovery plus deterministic normalized-name catalog semantics.

### v0.4.3 — SkillLoader + path/root validation ✅

Safe on-demand loading of exactly one selected `SKILL.md`, including lexical/canonical containment, symlink rejection and identity-drift detection.

### v0.4.4 — Catalog renderer + context supplement seam ✅

Compact descriptor catalogs and selected Skill bodies now enter model context through generic `ContextSupplement[]` before planner/token-budget validation. Supplements remain model-only derived context and never become durable conversation messages.

### v0.4.5 — Run-scoped activation + `load_skill` adapter ✅

Implemented:

```text
src/skills/active-store.ts
src/skills/activation-service.ts
src/skills/load-skill-tool.ts
src/skills/errors.ts
src/skills/index.ts

tests/skill-activation.test.ts
tests/load-skill-tool.test.ts
```

Run-scoped active state:

```ts
interface ActiveSkillStore {
  list(): readonly LoadedSkill[];
  get(name: string): LoadedSkill | undefined;
  activate(skill: LoadedSkill): LoadedSkill;
  clear(): void;
}

class InMemoryActiveSkillStore implements ActiveSkillStore
```

Semantics:

- active identity uses the same `trim + lowercase` rule as `SkillRegistry`;
- activation is idempotent by normalized Skill name;
- first active body wins for the current store lifetime;
- `list()` is deterministic by normalized name;
- construction/storage/read boundaries clone descriptors and metadata;
- `clear()` explicitly ends the run-scoped active state.

Shared activation service:

```text
requested name
      ↓
check ActiveSkillStore
      ↓ not active
SkillRegistry.get()
      ↓
SkillLoader.load()
      ↓
re-check ActiveSkillStore after async load
      ↓
ActiveSkillStore.activate()
```

The post-load re-check makes concurrent completion semantics consistent: if another activation committed while loading, the second result reports `already-active` rather than pretending to be the first activation.

Unknown names fail through:

```text
UnknownSkillError
```

Direct invalid activation arguments fail through:

```text
InvalidSkillActivationError
```

Model activation adapter:

```ts
class LoadSkillTool implements Tool
```

Tool contract:

```text
name: load_skill
args: { name: string }
additionalProperties: false
```

Compact results:

```text
Skill 'code-review' activated.

Skill 'code-review' is already active.
```

The full Skill instructions are deliberately absent from this ToolResult. They remain in `ActiveSkillStore` and become model-visible on the next turn only through:

```text
ActiveSkillStore.list()
      ↓
createLoadedSkillSupplement()
      ↓
ContextRuntime.prepare(... supplements ...)
```

This prevents one large Skill body from being duplicated in both durable tool history and model-only active Skill context.

### v0.4.5 verification

Strict TypeScript source-subset compilation passed under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
20KB Skill body
→ first load_skill activates it
→ compact 30-character acknowledgement
→ body absent from ToolResult
→ body present in active-skill supplement

second normalized activation
→ loader call count remains 1
→ status = already-active

store get/list
→ cloned values

clear()
→ active catalog empty
```

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## 5. Implementation stages

```text
v0.4.1  Skill manifest parser + core types                   ✅
v0.4.2  ProjectSkillSource + SkillRegistry                  ✅
v0.4.3  SkillLoader + path/root validation                  ✅
v0.4.4  compact catalog + context supplement seam           ✅
v0.4.5  run-scoped activation + load_skill adapter          ✅
v0.4.6  references + events + manual activation surface     ← next
v0.4.7  Agent integration + examples + 0.4.0 freeze
```

---

## 6. Next increment — v0.4.6

The next problem is lifecycle observability and a shared explicit activation surface.

v0.4.6 will establish:

```text
Skill lifecycle events
manual/explicit activation using the same SkillActivationService
references remain ordinary read-tool inputs
scripts remain ordinary shell/tool executions
```

No second hidden Skill execution channel will be introduced.

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
