# mini-pi-agent v0.4

## Version identity

- **Branch:** `v0.4`
- **Base:** completed `v0.3`
- **Current package:** `0.3.0` until final freeze
- **Target package:** `0.4.0`
- **Status:** active implementation snapshot
- **Theme:** Skills + progressive disclosure

Primary invariant:

> A Skill changes model guidance, not runtime execution semantics.

## Current architecture

```text
ProjectSkillSource
  ↓
SkillDescriptor[]
  ↓
SkillRegistry ─────────────→ compact catalog
  ↓ selected
FilesystemSkillLoader
  ↓
LoadedSkill
  ↓
SkillActivationService
  ├─ load_skill Tool
  └─ ManualSkillActivator
  ↓
ActiveSkillStore
  ↓
active-skill supplements
  ↓
ContextRuntime
  ↓
ContextPlanner
  ↓
PreparedContext
```

Lifecycle observation is metadata-only:

```text
skill_activation_start
skill_activated
skill_activation_reused
skill_activation_failed
```

`SkillEventBus` listener failures are isolated from activation behavior.

## Progressive disclosure

```text
Level 0  descriptor catalog                 ✅
Level 1  selected SKILL.md instructions     ✅
Level 2  references                         ordinary read-tool path only
Level 3  scripts/assets                     ordinary execution/tool path only
```

Strict rules:

```text
discover != load
load != activate
activate != execute
Skill body != load_skill ToolResult
ContextSupplement != AgentMessage
manual activation == same SkillActivationService as load_skill
```

## Completed increments

```text
v0.4.1  manifest parser + core types                         ✅
v0.4.2  ProjectSkillSource + SkillRegistry                  ✅
v0.4.3  SkillLoader + path/root validation                  ✅
v0.4.4  catalog + ContextSupplement budget integration      ✅
v0.4.5  ActiveSkillStore + activation + load_skill          ✅
v0.4.6  references boundary + events + manual activation    ✅
v0.4.7  Agent integration + examples + 0.4.0 freeze         ← next
```

## v0.4.6 implemented

Added:

```text
src/skills/events.ts
src/skills/manual-activation.ts
src/skills/activation-service.ts
src/skills/load-skill-tool.ts
src/skills/index.ts

tests/skill-events.test.ts
examples/08-skill-manual-activation.ts
```

### Event semantics

Events expose only activation metadata such as name, normalized identity, manifest path, origin, and compact error metadata. Full instructions are never emitted.

Origins are explicit:

```text
api
manual
tool
```

Observation is non-authoritative: a failing event listener cannot turn a successful activation into a failed one.

### Manual activation

`ManualSkillActivator` is intentionally thin:

```text
ManualSkillActivator.activate()
      ↓
SkillActivationService.activate(... origin=manual)
```

There is no second manual Skill runtime.

### References/scripts boundary

Activation/loading still reads only `SKILL.md`.

```text
references/foo.md
→ only through an explicit ordinary read tool

scripts/check.*
→ only through an explicit ordinary execution/shell tool
```

The v0.4.6 test places a real reference and a script with an observable side effect; Skill activation neither exposes the reference content through events nor executes the script.

### Verification

Strict TypeScript source-subset compilation passed with:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
manual activation          → activated
same Skill via tool origin → already-active
loader calls               → 1
active store entries       → 1
event body leakage         → false
listener failure           → isolated
```

The full repository Vitest suite is not claimed as run in the current execution environment.

## Next — v0.4.7

Final integration will make Agent own the per-run Skill lifecycle:

```text
run start
→ discover/register Skills
→ clear ActiveSkillStore
→ expose compact catalog + load_skill
→ active bodies become next-turn supplements
→ emit/bridge lifecycle events
→ run end clears active state
```

Then package/runtime/docs advance to `0.4.0` and the branch freezes as a historical learning snapshot.
