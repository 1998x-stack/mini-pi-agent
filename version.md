# mini-pi-agent v0.4

## 1. Version identity

- **Branch:** `v0.4`
- **Base snapshot:** completed `v0.3`
- **Current package:** `0.3.0` until v0.4 is frozen
- **Target package:** `0.4.0`
- **Theme:** Skills, progressive disclosure, and workflow knowledge above the runtime
- **Status:** **active implementation snapshot**

Primary mental model:

> **A Skill is discoverable workflow knowledge. It changes what the model knows how to do without changing how the Agent Runtime executes.**

Inherited v0.3 invariant:

> **Available knowledge is not the same thing as model-visible context.**

A repository may contain hundreds of Skills while a normal turn should expose only a compact catalog and a small number of explicitly activated Skill bodies.

---

## 2. Architectural delta from v0.3

```text
v0.3
Durable History
   ↓
ContextRuntime
   ↓
PreparedContext
   ↓
LLMProvider

v0.4 adds:
Project Skill packages
   ↓
ProjectSkillSource
   ↓
SkillDescriptor[]
   ↓
SkillRegistry
   ↓
future SkillLoader / activation
   ↓
future context supplements
   ↓
existing ContextRuntime
```

The Agent Loop must not grow Skill-specific branches.

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

Strict rule:

```text
discover != execute
load != execute
```

A Skill can instruct the model to use ordinary tools, but no Skill discovery/loading path executes scripts.

---

## 4. Progressive disclosure

```text
Level 0
SkillDescriptor
name + description + package identity

        ↓ activate

Level 1
full SKILL.md instructions

        ↓ explicit need

Level 2
references

        ↓ explicit tool execution

Level 3
scripts / assets / templates
```

v0.4.2 completes Level 0. The default context still does not expose full Skill bodies.

---

## 5. v0.4.1 — Skill manifest parser + core types ✅

Implemented:

```text
src/skills/types.ts
src/skills/errors.ts
src/skills/manifest-parser.ts
src/skills/index.ts
src/index.ts

tests/skill-manifest.test.ts
```

Public model:

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

`parseSkillDocument()` parses an intentionally small deterministic frontmatter subset. It rejects duplicate keys, malformed lines, nested YAML, arrays/objects, block scalars, and empty required fields/body.

---

## 6. v0.4.2 — ProjectSkillSource + SkillRegistry ✅

Implemented:

```text
src/skills/source.ts
src/skills/project-source.ts
src/skills/registry.ts
src/skills/types.ts
src/skills/errors.ts
src/skills/index.ts

tests/skill-discovery.test.ts
tests/skill-registry.test.ts
```

### Discovery contracts

```ts
interface SkillDescriptor {
  name: string;
  description: string;
  root: string;
  manifestPath: string;
  metadata?: Record<string, string>;
}

interface SkillDiscoveryContext {
  cwd: string;
  signal: AbortSignal;
}

interface SkillSource {
  discover(context: SkillDiscoveryContext): Promise<SkillDescriptor[]>;
}
```

Reference source:

```ts
class ProjectSkillSource implements SkillSource
```

Reference root:

```text
<cwd>/.mini-pi/skills/*/SKILL.md
```

Discovery semantics:

- only one package-directory level is scanned;
- only real directories are considered packages;
- packages without `SKILL.md` are ignored;
- non-file/symlink `SKILL.md` entries are ignored by the reference source;
- nested `references/scripts/assets` are not traversed;
- missing project Skill root returns `[]`;
- invalid top-level `SKILL.md` propagates `InvalidSkillManifestError`;
- cancellation is checked before, during, and after discovery;
- returned values are descriptors only and do not contain `instructions`.

### Registry model

```ts
class SkillRegistry {
  list(): readonly SkillDescriptor[];
  get(name: string): SkillDescriptor | undefined;
}
```

Name identity is normalized using:

```text
trim + lowercase
```

Therefore:

```text
Code-Review
code-review
 CODE-REVIEW 
```

are the same registry identity. Duplicate normalized names fail with `DuplicateSkillError` including both manifest paths.

Registry ordering is deterministic by normalized Skill name. Construction, `list()`, and `get()` clone descriptors/metadata so callers cannot mutate internal catalog state through shared references.

### v0.4.2 invariant

```text
project filesystem
      ↓
ProjectSkillSource
      ↓
SkillDescriptor[]
      ↓
SkillRegistry
```

No selected Skill body is loaded into active model context in this stage.

### Verification

The source subset passed TypeScript checking with:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified two discovered packages, descriptor-only output, deterministic registry ordering, case-insensitive lookup, duplicate rejection, and cancellation propagation.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## 7. Implementation stages

```text
v0.4.1  Skill manifest parser + core types                   ✅ implemented
v0.4.2  ProjectSkillSource + SkillRegistry                  ✅ implemented
v0.4.3  SkillLoader + path/root validation                  ← next
v0.4.4  compact catalog + context supplement seam
v0.4.5  run-scoped activation + load_skill adapter
v0.4.6  references + events + manual activation surface
v0.4.7  Agent integration + examples + 0.4.0 freeze
```

The order remains intentional:

```text
document format
    ↓
discovery/catalog
    ↓
on-demand loading
    ↓
context representation
    ↓
activation
    ↓
lifecycle surfaces
    ↓
end-to-end runtime integration
```

---

## 8. Next increment — v0.4.3

The next problem is now:

```text
The registry knows a Skill exists.
How do we safely load exactly that Skill's full SKILL.md instructions
without allowing package-root escape or identity drift?
```

v0.4.3 introduces:

```text
LoadedSkill
SkillLoader
FilesystemSkillLoader
Skill path/root validation
SkillPathError
SkillIdentityMismatchError
```

Required invariants:

- descriptor root and manifest path are validated;
- manifest path must remain under Skill root;
- parsed manifest name must match descriptor normalized identity;
- full instructions are loaded only for the requested descriptor;
- references/scripts/assets remain unloaded;
- source descriptor objects remain unchanged;
- cancellation propagates.

---

## 9. Explicit non-goals

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

---

## 10. Branch rule

`v0.4` is the canonical branch for the Skills mental model.

```text
v0.3 remains frozen
v0.4 receives Skills-only deltas
package remains 0.3.0 until final v0.4 freeze
```

Only after all v0.4 acceptance checks pass should package/version metadata advance to `0.4.0`.
