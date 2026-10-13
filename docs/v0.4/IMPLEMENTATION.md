# v0.4 Implementation Plan

Primary invariant:

> A Skill changes model guidance, not runtime execution semantics.

Secondary invariant:

> Full Skill bodies are exposed progressively rather than globally injected.

## Completed

```text
v0.4.1  Skill manifest parser + core types                   ✅
v0.4.2  ProjectSkillSource + SkillRegistry                  ✅
v0.4.3  SkillLoader + path/root validation                  ✅
v0.4.4  catalog renderer + ContextSupplement seam           ✅
v0.4.5  run-scoped activation + load_skill adapter          ✅
v0.4.6  references boundary + events + manual activation    ✅
```

## v0.4.6 — References + events + manual activation ✅

Implemented:

```text
src/skills/events.ts
src/skills/manual-activation.ts
src/skills/activation-service.ts
src/skills/load-skill-tool.ts
src/skills/index.ts

tests/skill-events.test.ts
examples/08-skill-manual-activation.ts
```

### Lifecycle events

Metadata-only event contract:

```text
skill_activation_start
skill_activated
skill_activation_reused
skill_activation_failed
```

Origins:

```text
api | manual | tool
```

Events may include name, normalized name, manifest path, and compact error name/message. They never include `LoadedSkill.instructions`.

`SkillEventBus` isolates listener failures so observation cannot alter activation semantics.

### Shared activation path

```text
load_skill Tool
      ┐
      ├→ SkillActivationService → ActiveSkillStore
      │
ManualSkillActivator
      ┘
```

`ManualSkillActivator` is only a thin origin-marking facade; it owns no registry, loader, or store.

### Reference/script boundary

No new resource execution protocol exists.

```text
references/*.md
→ ordinary read/file ToolCall only

scripts/*
→ ordinary explicit shell/execution ToolCall only
```

Activation and loading still touch only the selected `SKILL.md`.

### Verification

Strict TypeScript source-subset checking passed with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.

Runtime smoke verified one shared store/service across manual and tool-origin activation, normalized idempotency, one loader call, metadata-only events, and listener-failure isolation.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.4.7 — Agent integration + examples + 0.4.0 freeze ← next

### Goal

Integrate the complete Skills lifecycle with `Agent` while keeping `AgentLoop` generic and freezing an end-to-end educational snapshot.

### Add/update

```text
src/core/agent.ts
src/core/agent-loop.ts only if a generic supplement-provider seam is needed
src/core/events.ts for bridged Agent-level Skill metadata events
src/index.ts
README.md
package.json
src/version.ts
version.md
CHANGELOG.md
examples/09-progressive-skills.ts
tests/agent-skills-integration.test.ts
```

### Target run lifecycle

```text
Agent.prompt() starts
      ↓
clear ActiveSkillStore
      ↓
compact Skill catalog supplied to context
      ↓
load_skill available as ordinary tool
      ↓
model activates one Skill
      ↓
next provider request contains active Skill supplement
      ↓
other Skill bodies remain unloaded/unexposed
      ↓
run ends
      ↓
active state clears before next run
```

### Must prove

- Agent configuration can discover/register project Skills deterministically;
- catalog is visible without loading all bodies;
- `load_skill` uses the shared activation service;
- active bodies appear only on turns after activation;
- active state is per run and cleared between prompts;
- Skill lifecycle events can be bridged to Agent observation without body leakage;
- durable history contains ordinary tool calls/results, never ContextSupplements;
- references/scripts retain ordinary tool-path semantics;
- package/runtime version becomes `0.4.0` only after acceptance checks;
- docs describe implemented architecture, not future targets.

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
- [x] references remain ordinary file-tool reads
- [x] scripts remain ordinary tool executions
- [x] Skill lifecycle events
- [x] shared manual activation surface
- [ ] deterministic Agent end-to-end integration tests
- [x] manual activation educational example
- [ ] progressive Agent Skills example
- [ ] package/version/docs finalization

Only then freeze `v0.4`.
