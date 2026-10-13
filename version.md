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

## 2. Current Skills architecture

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
              ├── lexical path validation
              ├── lstat file-type validation
              ├── canonical realpath validation
              ├── manifest identity validation
              └── parse selected SKILL.md only
              │
              ▼
          LoadedSkill
              │
              ▼
 future catalog/context/activation layers
```

The Agent Loop still contains no Skill-specific branch.

---

## 3. Progressive disclosure state

```text
Level 0 — descriptor catalog                         ✅
name + description + package identity

Level 1 — selected SKILL.md instructions             ✅ loading primitive

Level 2 — optional references                        not auto-loaded

Level 3 — scripts/assets/templates                   not auto-executed
```

Strict rule:

```text
discover != load
load != execute
```

---

## 4. Completed increments

### v0.4.1 — Skill manifest parser + core types ✅

Implemented deterministic, dependency-free parsing for the educational `SKILL.md` scalar-frontmatter subset.

Core contracts:

```ts
interface SkillManifest {
  name: string;
  description: string;
  metadata?: Record<string, string>;
}

interface ParsedSkillDocument {
  manifest: SkillManifest;
  instructions: string;
}
```

### v0.4.2 — ProjectSkillSource + SkillRegistry ✅

Implemented project-local one-level discovery and deterministic descriptor cataloging.

```text
<cwd>/.mini-pi/skills/*/SKILL.md
          ↓
SkillDescriptor[]
          ↓
SkillRegistry
```

Registry identity is `trim + lowercase`; normalized duplicates fail explicitly.

### v0.4.3 — SkillLoader + path/root validation ✅

Implemented:

```text
src/skills/loader.ts
src/skills/paths.ts
src/skills/types.ts
src/skills/errors.ts
src/skills/index.ts

tests/skill-loader.test.ts
tests/skill-paths.test.ts
```

Public contracts:

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

Path safety is intentionally layered:

```text
1. descriptor root must be absolute
2. descriptor manifestPath must be absolute
3. manifestPath must stay lexically under root
4. manifestPath must be exactly <root>/SKILL.md
5. root must be a real directory, not a symlink
6. manifest must be a real regular file, not a symlink
7. realpath(manifest) must stay under realpath(root)
8. canonical manifest must still equal <canonical-root>/SKILL.md
```

Identity validation:

```text
descriptor.name
      ↓ normalize(trim + lowercase)
parsed SKILL.md name
```

A mismatch fails through `SkillIdentityMismatchError` rather than silently loading a different Skill.

Path/file-type violations fail through `SkillPathError`.

The returned descriptor is cloned, including metadata, so loading does not expose or mutate shared descriptor state.

Most importantly, the loader reads only the selected `SKILL.md`. It does not traverse `references/`, `scripts/`, or `assets/`.

### v0.4.3 verification

The Skills source subset passed TypeScript checking under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Filesystem runtime smoke verified:

```text
normal selected Skill
→ instructions loaded
→ source descriptor unchanged
→ returned descriptor is a copy

broken reference under references/
→ ignored by loader
→ Skill still loads

manifest name drift
→ SkillIdentityMismatchError

symlink package root
→ SkillPathError

symlink SKILL.md
→ SkillPathError

pre-aborted signal
→ original abort reason propagated
```

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## 5. Implementation stages

```text
v0.4.1  Skill manifest parser + core types                   ✅
v0.4.2  ProjectSkillSource + SkillRegistry                  ✅
v0.4.3  SkillLoader + path/root validation                  ✅
v0.4.4  compact catalog + context supplement seam           ← next
v0.4.5  run-scoped activation + load_skill adapter
v0.4.6  references + events + manual activation surface
v0.4.7  Agent integration + examples + 0.4.0 freeze
```

---

## 6. Next increment — v0.4.4

The next problem is:

```text
We can discover Skills and safely load one selected Skill.
How do compact descriptors and active Skill instructions enter model context
without bypassing the v0.3 token budget?
```

v0.4.4 introduces:

```text
Skill catalog renderer
ContextSupplement
supplement-aware ContextRuntime / planner composition
```

Required invariant:

> **Skill text must be budgeted before the provider request is finalized. Never append Skill text after context planning.**

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
