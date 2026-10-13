# v0.4 Implementation Plan

Primary invariant:

> A Skill changes model guidance, not runtime execution semantics.

Secondary invariant:

> Full Skill bodies are loaded and exposed progressively rather than globally injected.

---

## v0.4.1 — Skill manifest parser + core types ✅ implemented

Implemented the minimal `SkillManifest`, `ParsedSkillDocument`, typed manifest errors, and pure `parseSkillDocument()`.

---

## v0.4.2 — ProjectSkillSource + SkillRegistry ✅ implemented

Implemented descriptor-only project discovery from `<cwd>/.mini-pi/skills/*/SKILL.md` and deterministic normalized-name registry semantics.

---

## v0.4.3 — SkillLoader + root/path validation ✅ implemented

Implemented safe on-demand loading of exactly one selected `SKILL.md`, including lexical/canonical containment, symlink rejection, identity-drift detection, descriptor cloning, and cancellation propagation.

---

## v0.4.4 — Catalog renderer + context supplement seam ✅ implemented

Implemented compact descriptor catalogs and active Skill context through generic `ContextSupplement[]` rendered before ContextPlanner budgeting.

---

## v0.4.5 — Run-scoped activation + `load_skill` adapter ✅ implemented

### Goal

Allow model-driven Skill activation while reusing the ordinary ToolCall → ToolResult feedback loop without duplicating full Skill bodies into durable tool history.

### Implemented

```text
src/skills/active-store.ts
src/skills/activation-service.ts
src/skills/load-skill-tool.ts
src/skills/errors.ts
src/skills/index.ts

tests/skill-activation.test.ts
tests/load-skill-tool.test.ts
```

### Active state contract

```ts
interface ActiveSkillStore {
  list(): readonly LoadedSkill[];
  get(name: string): LoadedSkill | undefined;
  activate(skill: LoadedSkill): LoadedSkill;
  clear(): void;
}

class InMemoryActiveSkillStore implements ActiveSkillStore
```

Reference semantics:

- normalized identity is `trim + lowercase`;
- repeated activation is idempotent;
- first active body wins for the store lifetime;
- `list()` is deterministic;
- `get()` / `list()` / `activate()` return safe clones;
- metadata is cloned rather than shared;
- `clear()` is the explicit run-scope reset primitive.

### Shared activation service

```ts
class SkillActivationService {
  activate(name: string, signal: AbortSignal): Promise<SkillActivationResult>;
}
```

Flow:

```text
requested Skill name
      ↓
ActiveSkillStore.get()
      ↓ not active
SkillRegistry.get()
      ↓
SkillLoader.load()
      ↓ async boundary
ActiveSkillStore.get() again
      ↓
ActiveSkillStore.activate()
```

The second store check handles two activations that finish close together: once another call has committed active state, the later call returns `already-active` instead of incorrectly reporting first activation.

Sequential repeated activation does not call the loader again.

Unknown names fail through:

```text
UnknownSkillError
```

Cancellation is propagated before lookup/loading and after loader completion.

### `load_skill` Tool adapter

```ts
class LoadSkillTool implements Tool
```

Tool schema:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" }
  },
  "required": ["name"],
  "additionalProperties": false
}
```

Direct invalid calls also fail through:

```text
InvalidSkillActivationError
```

Compact ToolResult semantics:

```text
Skill 'code-review' activated.

Skill 'code-review' is already active.
```

The adapter never returns full `SKILL.md` instructions.

Required data flow:

```text
load_skill ToolResult
→ compact durable acknowledgement only

ActiveSkillStore
→ LoadedSkill body
→ createLoadedSkillSupplement()
→ next ContextRuntime.prepare()
```

This avoids duplicate full bodies in durable history and active model context.

### Verification performed

Strict TypeScript source-subset compilation passed under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
20KB full Skill body
→ first activation loads once
→ ToolResult length = 30 chars
→ full body absent from ToolResult
→ full body present in active-skill supplement

second normalized activation
→ status = already-active
→ loader calls remain 1

store reads
→ clones

clear()
→ no active Skills
```

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.4.6 — References + events + manual activation surface ← next

### Goal

Complete the observable Skill lifecycle while keeping references/scripts on ordinary tool paths and ensuring explicit/manual activation shares the same activation service as model-driven `load_skill`.

### Add/update

```text
src/core/events.ts
src/skills/activation-service.ts or a thin explicit activation facade
src/core/agent.ts only if a generic explicit activation entry point is needed
examples/08-skill-manual-activation.ts

tests/skill-events.test.ts
```

### Lifecycle event target

Events should expose metadata only, for example:

```text
skill_activation_start
skill_activated
skill_activation_reused
skill_activation_failed
```

Do not emit full Skill instructions by default.

### Explicit activation rule

Manual activation must call the same:

```text
SkillActivationService.activate()
```

used by `load_skill`.

A second Skill runtime is forbidden.

### References/scripts rule

```text
Skill instructions mention references/foo.md
      ↓
model uses ordinary read tool

Skill instructions mention scripts/check.mjs
      ↓
model explicitly uses ordinary shell/tool path
```

No hidden auto-read or auto-execution channel is introduced.

### Must prove

- lifecycle events distinguish new vs reused activation;
- events expose names/status/path metadata, not full body;
- manual and model-driven activation converge on one ActiveSkillStore;
- references are not implicitly loaded;
- scripts are not implicitly executed;
- cancellation/failure events preserve useful metadata without leaking instructions.

---

## v0.4.7 — Agent integration + examples + freeze

Prove the complete progressive-disclosure run lifecycle, clear active Skills between Agent runs, finalize package/runtime version `0.4.0`, update README/examples/docs, and freeze the branch.

---

## Final Definition of Done

- [x] manifest parser and typed errors
- [x] descriptor/discovery contracts
- [x] deterministic SkillRegistry
- [x] safe on-demand SkillLoader
- [x] compact catalog renderer
- [x] context supplement budget integration
- [x] run-scoped ActiveSkillStore
- [x] shared activation service
- [x] `load_skill` adapter
- [ ] references remain ordinary file-tool reads
- [ ] scripts remain ordinary tool executions
- [ ] Skill lifecycle events
- [ ] shared manual activation surface
- [ ] deterministic end-to-end tests
- [ ] educational examples
- [ ] package/version/docs finalization

Only then freeze `v0.4`.
