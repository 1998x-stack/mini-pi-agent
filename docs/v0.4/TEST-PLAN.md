# v0.4 Test Plan — Implemented

## Testing philosophy

v0.4 proves Skills as a workflow-knowledge layer without requiring a live model or network service.

Reference strategy:

```text
fixture SKILL.md files
temporary project roots
deterministic fake/capturing provider
filesystem loader smoke
focused unit/integration tests
```

The important assertions are architectural invariants, not only parsing happy paths.

---

## Implemented test files

```text
tests/skill-manifest.test.ts
tests/skill-discovery.test.ts
tests/skill-registry.test.ts
tests/skill-loader.test.ts
tests/skill-paths.test.ts
tests/skill-catalog.test.ts
tests/context-supplements.test.ts
tests/skill-activation.test.ts
tests/load-skill-tool.test.ts
tests/skill-events.test.ts
tests/agent-skills-integration.test.ts
```

---

## Manifest parser

Proves:

```text
valid scalar frontmatter
required name/description/body
extra scalar metadata
quoted values
BOM / CRLF normalization
duplicate-key rejection
unsupported nested/list/object/block YAML rejection
deterministic repeated parse
```

Parsing is side-effect free.

---

## Discovery / Registry

Proves:

```text
missing root → empty catalog
one-level package discovery only
descriptor-only results
deterministic ordering
invalid manifest propagation
cancellation propagation
trim+lowercase identity
duplicate normalized name rejection
clone-safe list/get behavior
```

---

## Loader / path safety

Proves:

```text
load one requested SKILL.md only
absolute paths required
manifest stays under root
manifest == root/SKILL.md
../ escape rejected
symlink root rejected
symlink manifest rejected
canonical containment
manifest identity drift rejected
references/scripts/assets not traversed
source descriptor unchanged
cancellation preserved
```

---

## Catalog / ContextSupplement

Proves:

```text
catalog exposes name + description only
full instructions never appear in catalog
deterministic catalog order
active body becomes active-skill supplement
supplement ids deterministic and valid
summary + supplements coexist
supplements enter token estimation before final budget check
supplements never become AgentMessage history
oversized required supplement → ContextBudgetExceededError
```

---

## ActiveSkillStore / activation service

Proves:

```text
normalized-name idempotency
sequential repeat does not reload
deterministic active listing
clone-safe get/list/activate
clear removes run state
unknown Skill → UnknownSkillError
cancellation propagation
post-load active re-check for near-concurrent completion
```

---

## load_skill adapter

Proves:

```text
ordinary Tool schema
non-empty name validation
unknown name failure
compact activation acknowledgement
full SKILL.md body absent from ToolResult
repeated activation reports already-active
active body available through ContextSupplement path
```

---

## Events / resource boundary

Proves:

```text
skill_activation_start
skill_activated
skill_activation_reused
skill_activation_failed

origins: api | manual | tool
```

Event payloads contain metadata only, never instructions.

Listener failures do not change activation behavior.

A real package fixture also proves:

```text
activation does not expose reference contents
activation does not execute scripts
```

---

## Agent end-to-end integration

`tests/agent-skills-integration.test.ts` proves the final lifecycle:

```text
Agent.create()
→ discovers two project Skills
→ registers load_skill

first request
→ catalog contains both descriptors
→ no full Skill body

model calls load_skill("code-review")
→ loader called for code-review only
→ compact durable ToolResult

second request
→ code-review body visible
→ release body still absent

run ends
→ active state cleared

next Agent.prompt()
→ catalog still visible
→ code-review body absent again
```

It also proves:

```text
Skill events bridge into Agent events
full body absent from Agent event payloads
ContextSupplement never enters durable history
Skills require AgentOptions.context
```

---

## Verification status

Increment-level and final integration source subsets were compiled with:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smokes covered parser/discovery/loading, context budgeting, activation, events, and final progressive Agent behavior.

The full repository `vitest run` / `npm run check` suite is **not claimed as executed** in the current environment because repository dependency installation is unavailable through the network path.

No test result is inferred from source presence alone.
