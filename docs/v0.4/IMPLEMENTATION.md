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

Implemented descriptor-only project discovery from:

```text
<cwd>/.mini-pi/skills/*/SKILL.md
```

and deterministic `SkillRegistry` identity/order semantics.

---

## v0.4.3 — SkillLoader + root/path validation ✅ implemented

Implemented safe on-demand loading of exactly one selected `SKILL.md`, including lexical and canonical path checks, symlink rejection, identity-drift detection, descriptor cloning, and cancellation propagation.

---

## v0.4.4 — Catalog renderer + context supplement seam ✅ implemented

### Goal

Expose compact Skill availability and selected Skill bodies through the same budget-accounted v0.3 context path.

### Implemented

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

### Generic context contract

```ts
interface ContextSupplement {
  id: string;
  kind: "skill-catalog" | "active-skill";
  content: string;
  required: boolean;
}
```

Context helpers:

```ts
normalizeContextSupplements()
renderContextSupplements()
```

Validation requires:

- non-empty, valid supplement ids;
- unique ids;
- supported kinds;
- non-empty content;
- deterministic ordering.

Reference order:

```text
skill-catalog first
active-skill bodies next, ordered by id
```

Invalid supplements fail with:

```text
InvalidContextSupplementError
```

### Skill catalog

```ts
renderSkillCatalog(descriptors)
createSkillCatalogSupplement(descriptors)
```

The catalog renders only:

```text
name
description
```

and deliberately omits:

```text
instructions
metadata
root
manifestPath
package resources
```

This is the Level-0 progressive-disclosure representation.

### Active Skill supplement

```ts
createLoadedSkillSupplement(loadedSkill)
```

produces one required `active-skill` supplement containing the selected Skill's Level-1 instructions.

`skillSupplementId(name)` provides deterministic valid ids. Safe normalized names remain readable; names containing spaces or non-ASCII characters use collision-safe UTF-8 hex encoding.

### ContextRuntime integration

`ContextRuntimePrepareInput` now accepts:

```ts
supplements?: readonly ContextSupplement[];
```

Runtime composition is:

```text
base system prompt
      ↓
summary checkpoint
      ↓
context supplements
      ↓
ContextPlanner.prepare()
      ↓
final budget validation
```

This ordering is the central v0.4.4 invariant.

Forbidden:

```text
planner.prepare(...)
      ↓
PreparedContext
      ↓
append Skill text afterwards   ❌
```

Required:

```text
Skill material
      ↓
ContextSupplement[]
      ↓
planner-visible system material
      ↓
budget accounting
      ↓
PreparedContext
```

### Current required semantics

The v0.4.4 reference runtime does not silently drop any supplied supplement. Catalog and active bodies are therefore mandatory once supplied.

The `required` field remains explicit policy metadata for future selection/degradation policies; it is not yet used to remove supplements.

If supplement material makes the system prompt exceed budget:

```text
ContextBudgetExceededError
```

is raised explicitly.

### Durable-history invariant

```text
ContextSupplement
!=
AgentMessage
```

Supplements and summary checkpoints are model-only derived context. They are never appended to durable history.

### Verification performed

Strict TypeScript source-subset compilation passed under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
catalog + active Skill + stored summary
→ rendered once into system context
→ all included in estimator/planner budget
→ only post-summary durable tail remains as messages
→ durable history unchanged

oversized active supplement
→ ContextBudgetExceededError
```

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.4.5 — Run-scoped activation + load_skill adapter ← next

### Goal

Allow model-driven Skill activation while reusing the existing ToolCall → ToolResult feedback loop.

### Add

```text
src/skills/active-store.ts
src/skills/activation-service.ts
src/skills/load-skill-tool.ts
src/skills/errors.ts
src/skills/index.ts

tests/skill-activation.test.ts
tests/load-skill-tool.test.ts
```

### Target contracts

```ts
interface ActiveSkillStore {
  list(): readonly LoadedSkill[];
  get(name: string): LoadedSkill | undefined;
  activate(skill: LoadedSkill): void;
  clear(): void;
}
```

Reference behavior is run-scoped and idempotent by normalized Skill name.

Activation service flow:

```text
requested name
      ↓
SkillRegistry.get()
      ↓
SkillLoader.load()
      ↓
ActiveSkillStore.activate()
      ↓
activation result
```

Unknown Skill names must fail through a typed error rather than returning `undefined` deep inside tool execution.

### load_skill adapter

Expose a small ordinary Tool:

```text
load_skill(name)
```

The adapter reuses the existing agent action/observation loop.

Its ToolResult must remain compact, for example:

```text
Skill 'code-review' activated.
```

It must **not** return the full Skill instructions because those instructions are already supplied on the next model turn through `ContextSupplement`.

### Must prove

- activation is normalized-name idempotent;
- repeated activation does not re-load or duplicate active state;
- unknown names fail explicitly;
- activation preserves cancellation;
- store returns clones rather than shared mutable LoadedSkill state;
- `load_skill` ToolResult is compact and contains no full body;
- active Skill instructions can be converted into supplements for the next context preparation;
- no SessionStore or Agent integration yet beyond ordinary tool semantics.

---

## v0.4.6 — References + events + manual activation surface

References remain ordinary file-tool reads; scripts remain ordinary shell/tool executions. Add metadata-only Skill lifecycle events and a shared explicit activation surface.

---

## v0.4.7 — Agent integration + examples + freeze

Prove end-to-end progressive disclosure, update package/runtime version to `0.4.0`, finalize docs/examples, and freeze the branch.

---

## Final Definition of Done

- [x] manifest parser and typed errors
- [x] descriptor/discovery contracts
- [x] deterministic SkillRegistry
- [x] safe on-demand SkillLoader
- [x] compact catalog renderer
- [x] context supplement budget integration
- [ ] run-scoped ActiveSkillStore
- [ ] shared activation service
- [ ] `load_skill` adapter
- [ ] references remain ordinary file-tool reads
- [ ] scripts remain ordinary tool executions
- [ ] Skill lifecycle events
- [ ] deterministic end-to-end tests
- [ ] educational examples
- [ ] package/version/docs finalization

Only then freeze `v0.4`.
