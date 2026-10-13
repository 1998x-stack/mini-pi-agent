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

### Goal

Load exactly one selected Skill body while preserving package-root safety and descriptor identity.

### Implemented

```text
src/skills/loader.ts
src/skills/paths.ts
src/skills/types.ts
src/skills/errors.ts
src/skills/index.ts

tests/skill-loader.test.ts
tests/skill-paths.test.ts
```

### Contracts

```ts
interface LoadedSkill {
  descriptor: SkillDescriptor;
  instructions: string;
}

interface SkillLoader {
  load(descriptor: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill>;
}

class FilesystemSkillLoader implements SkillLoader
```

### Pure lexical path checks

`validateSkillDescriptorPaths()` requires:

```text
root is absolute
manifestPath is absolute
manifestPath is inside root
manifestPath is exactly root/SKILL.md
```

`isPathWithinRoot()` distinguishes true `..` parent traversal from legal names that merely begin with `..`.

### Filesystem/canonical checks

`FilesystemSkillLoader` additionally requires:

```text
lstat(root)      → real directory, not symlink
lstat(SKILL.md)  → real regular file, not symlink
realpath(manifest) remains within realpath(root)
canonical manifest == canonical root/SKILL.md
```

This keeps symlink/path behavior explicit instead of trusting path strings alone.

### Identity rule

After loading and parsing, normalized manifest identity must equal the selected descriptor identity:

```text
normalizeSkillName(parsed.manifest.name)
==
normalizeSkillName(descriptor.name)
```

Failure throws:

```text
SkillIdentityMismatchError
```

Path/file-type violations throw:

```text
SkillPathError
```

### Progressive-disclosure boundary

The loader reads only the requested `SKILL.md`.

It does not traverse or execute:

```text
references/
scripts/
assets/
```

A broken resource below `references/` therefore cannot break normal Skill body loading unless the model later explicitly asks an ordinary file tool to read it.

### Immutability/cancellation

- input descriptor remains unchanged;
- returned descriptor is cloned, including metadata;
- `AbortSignal` is checked before and between filesystem phases;
- pre-aborted signals preserve the original abort reason.

### Verification performed

Strict TypeScript source-subset compilation passed under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime filesystem smoke verified normal load, broken-reference non-traversal, descriptor cloning, identity-drift rejection, symlink-root rejection, symlink-manifest rejection, and cancellation propagation.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.4.4 — Catalog renderer + context supplement seam ← next

### Goal

Expose compact Skill availability and selected Skill bodies through the same budget-accounted v0.3 context path.

### Add/update

```text
src/skills/catalog.ts
src/context/supplements.ts
src/context/runtime.ts
src/context/types.ts
src/context/index.ts

tests/skill-catalog.test.ts
tests/context-supplements.test.ts
```

### Target model

```ts
interface ContextSupplement {
  id: string;
  kind: "skill-catalog" | "active-skill";
  content: string;
  required: boolean;
}
```

### Required semantics

- Skill catalog is deterministic and compact;
- catalog contains descriptors only, never full Skill instructions;
- supplements are model-only derived context, never durable `AgentMessage`s;
- supplement text is included in token accounting before final provider context is accepted;
- active Skill instructions are required context while active and cannot be silently dropped;
- summary checkpoint behavior from v0.3 remains valid;
- impossible supplement + history budgets fail explicitly rather than bypass planning.

### Forbidden shortcut

```text
planner.prepare(...)
      ↓
PreparedContext
      ↓
append Skill text afterwards   ❌
```

Required:

```text
Skill supplements
      ↓
budget-aware context construction
      ↓
PreparedContext
```

---

## v0.4.5 — Run-scoped activation + load_skill adapter

Add `ActiveSkillStore`, shared activation service, and a small `load_skill(name)` Tool adapter. Activation must be idempotent and the tool result must acknowledge activation without duplicating the full body.

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
- [ ] compact catalog renderer
- [ ] context supplement budget integration
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
