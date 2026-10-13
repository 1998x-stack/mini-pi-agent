# v0.4 Implementation — Complete

Primary invariant:

> **A Skill changes model guidance, not runtime execution semantics.**

Secondary invariant:

> **Full Skill bodies are exposed progressively rather than globally injected.**

## Completed increments

```text
v0.4.1  Skill manifest parser + core types                   ✅
v0.4.2  ProjectSkillSource + SkillRegistry                  ✅
v0.4.3  SkillLoader + path/root validation                  ✅
v0.4.4  catalog renderer + ContextSupplement seam           ✅
v0.4.5  run-scoped activation + load_skill adapter          ✅
v0.4.6  references boundary + events + manual activation    ✅
v0.4.7  Agent integration + examples + 0.4.0 freeze         ✅
```

---

## v0.4.7 — Agent integration + freeze ✅

### Added/updated

```text
src/skills/runtime.ts
src/core/agent.ts
src/core/agent-loop.ts
src/core/events.ts
src/skills/index.ts
src/index.ts

tests/agent-skills-integration.test.ts
examples/09-progressive-skills.ts

package.json
src/version.ts
README.md
version.md
CHANGELOG.md
docs/v0.4/ARCHITECTURE.md
docs/versions/v0.4.md
```

### Composition root

`SkillRuntime` now owns the Agent-lifetime Skills composition:

```text
ProjectSkillSource
      ↓
SkillRegistry
      ↓
SkillActivationService
      ↓
ActiveSkillStore
      ↓
LoadSkillTool + ManualSkillActivator + SkillEventBus
```

Discovery/catalog state persists for the Agent lifetime.

Active state is explicitly cleared at each `Agent.prompt()` boundary.

### Agent configuration

```ts
const agent = await Agent.create({
  provider,
  cwd,
  context: {
    planner,
    budget
  },
  skills: {}
});
```

`skills` requires `context`.

Reason:

```text
Skill catalog/body
must be present before ContextPlanner budgeting
```

Legacy `ContextTransform` is therefore not a supported Skills injection path.

### AgentLoop seam

`runAgentLoop()` remains unaware of SkillRegistry, SkillLoader, activation, or concrete Skill names.

Its generic addition is:

```ts
contextSupplements?: () => readonly ContextSupplement[]
```

Each model turn performs:

```text
contextSupplements()
      ↓
ContextRuntime.prepare(... supplements ...)
      ↓
PreparedContext
```

This is why a Skill activated through a tool call in turn N appears naturally in model context on turn N+1.

### Run lifecycle

```text
Agent.prompt() start
      ↓
clear ActiveSkillStore
      ↓
first turn sees compact catalog
      ↓
model calls load_skill(name)
      ↓
compact ToolResult enters durable history
      ↓
next turn sees catalog + active Skill body
      ↓
prompt() finally
      ↓
clear ActiveSkillStore
```

The next prompt starts with catalog-only context again.

### Agent event bridge

Metadata-only Skill lifecycle events are bridged into the normal Agent event stream with:

```text
runId
turn
origin
Skill metadata
```

Core events define their own bridged origin type so `core/events.ts` does not depend on the Skills subsystem.

### End-to-end proof

`tests/agent-skills-integration.test.ts` proves:

```text
2 project Skills discovered
      ↓
request 1
catalog contains both descriptors
no Skill body visible
      ↓
model calls load_skill("code-review")
      ↓
loader called for code-review only
      ↓
durable ToolResult is compact
      ↓
request 2
code-review body visible
release body still absent
      ↓
run ends
      ↓
request 3 in new prompt
catalog still visible
code-review body absent again
```

It also verifies Agent-level Skill events contain no full instructions and that Skills cannot be enabled without ContextRuntime.

### Example

```bash
npm run demo:skills
```

`examples/09-progressive-skills.ts` creates a self-contained temporary project Skill catalog and demonstrates the full progressive disclosure loop.

---

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
- [x] deterministic Agent end-to-end integration tests added
- [x] manual activation educational example
- [x] progressive Agent Skills example
- [x] package/runtime version finalized as `0.4.0`
- [x] README/version/architecture docs finalized

---

## Verification status

Performed during v0.4 increments:

```text
strict TypeScript source-subset checking
noUncheckedIndexedAccess
exactOptionalPropertyTypes
filesystem loading smoke
activation smoke
context-supplement budget smoke
Agent progressive-Skills integration smoke
```

Final v0.4.7 smoke produced the expected sequence:

```text
catalog-only
→ catalog + selected Skill body
→ catalog-only on next prompt
```

The full repository Vitest suite is **not claimed as executed** in the current environment because repository dependencies cannot be installed through the unavailable network path.

`v0.4` is now frozen as the canonical historical learning branch for Skills.
