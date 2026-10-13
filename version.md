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
Skill package roots
   ↓
SkillSource / discovery
   ↓
SkillRegistry
   ↓
SkillLoader / activation
   ↓
Context supplements
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
name + description

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

The default context must never inject every full Skill body.

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

Parser entry point:

```ts
parseSkillDocument(source: string): ParsedSkillDocument
```

The v0.4.1 frontmatter subset is intentionally narrow and deterministic:

```text
---
name: code-review
description: Review changes for bugs and regressions.
owner: platform
---
# Code Review
...
```

Supported:

- required opening/closing `---` delimiters;
- non-empty `name` and `description`;
- non-empty Markdown instructions body;
- additional scalar metadata;
- single/double-quoted scalar values;
- BOM and CRLF/CR normalization;
- blank/comment lines inside frontmatter.

Explicitly rejected:

- duplicate keys;
- nested/indented mappings;
- arrays and objects;
- YAML block scalars;
- malformed `key: value` lines;
- missing required fields/body.

Errors use:

```text
SkillError
└── InvalidSkillManifestError
```

with line provenance where available.

### v0.4.1 invariant

```text
string SKILL.md
      ↓
pure parser
      ↓
manifest + instructions
```

No filesystem scan, registry mutation, Skill activation, context injection, or script execution occurs in this stage.

### Verification

The source subset passed strict TypeScript checking with:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified quoted metadata, BOM/CRLF normalization, duplicate-key rejection, and rejection of unsupported list metadata.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## 6. Planned increments

```text
v0.4.1  Skill manifest parser + core types                   ✅ implemented
v0.4.2  ProjectSkillSource + SkillRegistry                  ← next
v0.4.3  SkillLoader + path/root validation
v0.4.4  compact catalog + context supplement seam
v0.4.5  run-scoped activation + load_skill adapter
v0.4.6  references + events + manual activation surface
v0.4.7  Agent integration + examples + 0.4.0 freeze
```

The order is intentional:

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

## 7. Next increment — v0.4.2

The next problem is no longer “what is a valid Skill document?” v0.4.1 now answers that.

The next problem is:

```text
Given a project workspace,
which Skills exist,
and how do we expose a deterministic cheap catalog
without loading every Skill body into model context?
```

v0.4.2 introduces:

```text
SkillDiscoveryContext
SkillDescriptor
SkillSource
ProjectSkillSource
SkillRegistry
```

Reference root:

```text
<cwd>/.mini-pi/skills/*/SKILL.md
```

Discovery may read enough of `SKILL.md` to obtain manifest metadata, but it must return descriptors only and must never execute scripts/references.

---

## 8. Explicit non-goals

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

## 9. Branch rule

`v0.4` is the canonical branch for the Skills mental model.

```text
v0.3 remains frozen
v0.4 receives Skills-only deltas
package remains 0.3.0 until final v0.4 freeze
```

Only after all v0.4 acceptance checks pass should package/version metadata advance to `0.4.0`.
