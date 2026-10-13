# v0.4 Implementation Plan

Primary invariant:

> A Skill changes model guidance, not runtime execution semantics.

Secondary invariant:

> Full Skill bodies are loaded and exposed progressively rather than globally injected.

Do not skip ahead to activation before discovery/loading contracts are stable.

---

## v0.4.1 — Skill manifest parser + core types ✅ implemented

### Goal

Define the smallest valid Skill document and parse it deterministically without filesystem discovery or Agent integration.

### Implemented

```text
src/skills/types.ts
src/skills/errors.ts
src/skills/manifest-parser.ts
src/skills/index.ts
src/index.ts

tests/skill-manifest.test.ts
```

### Public contracts

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

function parseSkillDocument(source: string): ParsedSkillDocument;
```

### Parser rules

- `SKILL.md` must begin with a frontmatter `---` delimiter;
- closing `---` delimiter is required;
- `name` is required and non-empty;
- `description` is required and non-empty;
- Markdown instructions/body are required and non-empty;
- unknown top-level scalar keys are preserved in `manifest.metadata`;
- duplicate reserved and custom keys are rejected rather than silently overwritten;
- blank lines and comment lines are allowed inside frontmatter;
- UTF-8 BOM and CRLF/CR line endings are normalized;
- single- and double-quoted scalar values are supported;
- array/object/block/nested YAML syntax is deliberately rejected in v0.4.1;
- malformed input fails with `InvalidSkillManifestError` and line provenance when available;
- parsing is deterministic, dependency-free, and side-effect free.

### Explicit boundary

v0.4.1 parses strings only. It does not:

- inspect the filesystem;
- discover Skill roots;
- create descriptors;
- load a selected Skill package;
- register or activate Skills;
- modify context or Agent behavior;
- execute scripts or references.

### Verification performed

The new source subset passed TypeScript checking under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
BOM + CRLF document
quoted name/description
custom owner metadata
→ parsed deterministically

duplicate name
→ InvalidSkillManifestError

list metadata such as [a, b]
→ explicitly rejected
```

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.4.2 — ProjectSkillSource + SkillRegistry ← next

### Goal

Discover cheap Skill descriptors from project-local roots and own them in a deterministic catalog.

### Add

```text
src/skills/source.ts
src/skills/project-source.ts
src/skills/registry.ts

tests/skill-discovery.test.ts
tests/skill-registry.test.ts
```

### Reference root

```text
<cwd>/.mini-pi/skills/*/SKILL.md
```

### Must prove

- discovery returns descriptors only;
- no scripts/references are executed or loaded;
- order is deterministic;
- duplicate normalized names fail with `DuplicateSkillError`;
- cancellation propagates;
- missing Skill root returns empty catalog, not a fatal runtime error.

---

## v0.4.3 — SkillLoader + root/path validation

### Goal

Load exactly one selected `SKILL.md` body while preserving package-root safety.

### Add

```text
src/skills/loader.ts
src/skills/paths.ts

tests/skill-loader.test.ts
tests/skill-paths.test.ts
```

### Must prove

- descriptor manifest path remains under Skill root;
- parsed name matches descriptor identity;
- loader returns full instructions only for requested Skill;
- optional package resources remain unloaded;
- `../` escape is rejected through `SkillPathError`;
- source descriptors are not mutated;
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
- durable history still records only real tool call/result messages.

---

## v0.4.6 — References + events + manual activation surface

### Goal

Complete the Skill lifecycle while keeping references/scripts on normal tool paths.

### Add/update

```text
src/core/events.ts
src/core/agent.ts
src/skills/events-or-service seams as needed
examples/08-skill-manual-activation.ts

tests/skill-events.test.ts
```

### Semantics

- references are mentioned by Skill instructions and read through ordinary `read` tool;
- scripts execute only through ordinary shell/tool path;
- events expose metadata, not full instructions;
- explicit activation and model activation share one service.

Potential CLI syntax:

```text
/skill:code-review
```

CLI support is optional if it would distort the runtime API; the activation service contract is mandatory.

---

## v0.4.7 — Agent integration + examples + freeze

### Goal

Create a complete end-to-end Skills learning snapshot and freeze package `0.4.0`.

### Add/update

```text
src/core/agent.ts
src/core/agent-loop.ts only if orchestration seam requires a generic call, never Skill-specific logic
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
- [ ] descriptor/discovery contracts
- [ ] deterministic SkillRegistry
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
