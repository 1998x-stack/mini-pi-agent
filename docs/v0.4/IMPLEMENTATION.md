# v0.4 Implementation Plan

Primary invariant:

> A Skill changes model guidance, not runtime execution semantics.

Secondary invariant:

> Full Skill bodies are loaded and exposed progressively rather than globally injected.

Do not skip ahead to activation before discovery/loading contracts are stable.

---

## v0.4.1 — Skill manifest parser + core types ✅ implemented

Implemented:

```text
src/skills/types.ts
src/skills/errors.ts
src/skills/manifest-parser.ts
src/skills/index.ts
src/index.ts

tests/skill-manifest.test.ts
```

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

The parser is deterministic, dependency-free, side-effect free, and deliberately supports only a simple scalar frontmatter subset.

---

## v0.4.2 — ProjectSkillSource + SkillRegistry ✅ implemented

### Goal

Discover cheap Skill descriptors from project-local roots and own them in a deterministic catalog without activating or context-injecting any Skill body.

### Implemented

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

### Contracts

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

Reference registry:

```ts
class SkillRegistry {
  list(): readonly SkillDescriptor[];
  get(name: string): SkillDescriptor | undefined;
}
```

Name identity:

```text
normalizeSkillName(name)
=
trim + lowercase
```

Duplicate normalized names fail through:

```text
DuplicateSkillError
```

with both manifest paths preserved for diagnosis.

### Discovery semantics

- missing Skill root returns an empty descriptor list;
- only one child-directory level is considered;
- only directory packages with a regular `SKILL.md` are discovered;
- nested resources are not traversed;
- invalid top-level manifests propagate their parser error;
- cancellation is checked before, during, and after discovery;
- descriptors expose metadata/package identity only, never `instructions`.

### Registry semantics

- ordering is deterministic by normalized name;
- lookups use normalized names;
- duplicate normalized names fail instead of choosing a winner;
- input descriptors are cloned during construction;
- `list()` and `get()` return clones so external mutation cannot change the internal catalog.

### Verification performed

Strict TypeScript source-subset compilation passed under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
2 project packages
→ 2 SkillDescriptor objects
→ no instructions field

SkillRegistry
→ deterministic order
→ case-insensitive/trimmed lookup
→ duplicate normalized name rejected

pre-aborted discovery
→ original abort reason propagated
```

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.4.3 — SkillLoader + root/path validation ← next

### Goal

Load exactly one selected `SKILL.md` body while preserving package-root safety and descriptor identity.

### Add

```text
src/skills/loader.ts
src/skills/paths.ts
src/skills/types.ts
src/skills/errors.ts

tests/skill-loader.test.ts
tests/skill-paths.test.ts
```

### Target contracts

```ts
interface LoadedSkill {
  descriptor: SkillDescriptor;
  instructions: string;
}

interface SkillLoader {
  load(descriptor: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill>;
}
```

Reference implementation:

```ts
class FilesystemSkillLoader implements SkillLoader
```

### Must prove

- descriptor root and manifest path are absolute/canonical enough for deterministic checks;
- manifest path remains under Skill root;
- root escape such as `../other/SKILL.md` is rejected with `SkillPathError`;
- symlink/path behavior is explicit rather than silently trusted;
- parsed manifest normalized name matches descriptor normalized identity;
- identity mismatch fails with a typed error;
- full instructions are returned only for the requested descriptor;
- references/scripts/assets remain unloaded;
- source descriptor is not mutated;
- returned descriptor is a safe copy;
- cancellation propagates.

---

## v0.4.4 — Catalog renderer + context supplement seam

### Goal

Expose compact Skill availability and activated Skill bodies through the same v0.3 context-budget path.

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

### Must prove

- descriptor catalog is deterministic and compact;
- no full instructions appear in catalog;
- catalog/active bodies are accounted before final budget validation;
- already-active Skill instructions are never silently omitted;
- supplements do not become durable AgentMessages;
- existing summary checkpoint semantics remain intact.

---

## v0.4.5 — Run-scoped activation + load_skill adapter

### Goal

Allow model-driven on-demand Skill activation while reusing the existing tool-call feedback loop.

### Add

```text
src/skills/active-store.ts
src/skills/activation-service.ts
src/skills/load-skill-tool.ts

tests/skill-activation.test.ts
tests/load-skill-tool.test.ts
```

### Target flow

```text
catalog
  ↓
LLM calls load_skill(name)
  ↓
activation service
  ↓
registry lookup
  ↓
loader
  ↓
ActiveSkillStore
  ↓
next context preparation includes instructions
```

### Must prove

- activation is idempotent by Skill name;
- unknown names fail explicitly;
- full body is not duplicated as an oversized ToolResult;
- active instructions appear on the next model request;
- active bodies clear between Agent runs;
- durable history records only real tool call/result messages.

---

## v0.4.6 — References + events + manual activation surface

### Goal

Complete the Skill lifecycle while keeping references/scripts on normal tool paths.

### Add/update

```text
src/core/events.ts
src/core/agent.ts
examples/08-skill-manual-activation.ts

tests/skill-events.test.ts
```

### Semantics

- references are mentioned by Skill instructions and read through ordinary `read` tool;
- scripts execute only through ordinary shell/tool path;
- events expose metadata, not full instructions;
- explicit activation and model activation share one activation service.

Potential CLI syntax:

```text
/skill:code-review
```

CLI support is optional if it would distort the runtime API.

---

## v0.4.7 — Agent integration + examples + freeze

### Goal

Create a complete end-to-end Skills learning snapshot and freeze package `0.4.0`.

### Add/update

```text
src/core/agent.ts
src/core/agent-loop.ts only if a generic orchestration seam is required
src/index.ts
README.md
CHANGELOG.md
version.md
examples/09-progressive-skills.ts
tests/agent-skills-integration.test.ts
```

### End-to-end proof

```text
Agent starts
  ↓
discovers 20 Skills
  ↓
provider initially sees 20 compact descriptors only
  ↓
model activates code-review
  ↓
next provider request sees full code-review instructions
  ↓
other 19 Skill bodies remain unloaded/unexposed
  ↓
run ends
  ↓
next run has catalog but no active code-review body
```

### Freeze requirements

- package/version becomes `0.4.0`;
- docs describe implemented architecture rather than targets;
- all v0.4 Definition of Done items checked;
- branch status changes to implemented historical learning snapshot.

---

## Final Definition of Done

- [x] manifest parser and typed errors
- [x] descriptor/discovery contracts
- [x] deterministic SkillRegistry
- [ ] safe on-demand SkillLoader
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
