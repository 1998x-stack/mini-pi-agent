# mini-pi-agent

A small, extensible **Pi-style Agent Runtime** written from first principles in TypeScript.

The repository is organized as educational version snapshots. The `v0.4` branch focuses on one mental model:

> **A Skill is discoverable workflow knowledge, not an executor.**

It builds directly on the v0.3 invariant:

> **Durable history is not the same thing as model-visible context.**

Together they produce a clean separation:

```text
knowledge
!=
execution
!=
durable history
!=
model-visible context
```

## 1. Core feedback loop

```text
User
  ↓
Agent Loop
  ↓
LLM(context, tools)
  ├──────── no tool calls ───────► final answer
  │
  └──────── tool calls
               ↓
          runtime executes
               ↓
          ToolResultMessage
               └─────────────────► next model turn
```

v0.4 does not replace this loop. Skills sit above it and reuse the existing ToolCall → ToolResult feedback mechanism.

## 2. v0.4 Skills architecture

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
          │         │
          │         └──── compact catalog ───────────┐
          │ selected descriptor                      │
          ▼                                          │
    FilesystemSkillLoader                            │
          │                                          │
          ▼                                          │
       LoadedSkill                                   │
          │                                          │
          ▼                                          │
 SkillActivationService                              │
          │                                          │
          ▼                                          │
   ActiveSkillStore                                  │
          │                                          │
          └──── active-skill supplements ─────────────┘
                             │
                             ▼
                     ContextSupplement[]
                             │
                             ▼
                       ContextRuntime
                             │
                             ▼
                       ContextPlanner
                             │
                             ▼
                      PreparedContext
                             │
                             ▼
                        LLMProvider
```

`runAgentLoop()` remains Skill-agnostic. It only knows an optional generic `contextSupplements()` provider.

## 3. Progressive disclosure

```text
Level 0
SkillDescriptor
name + description

        ↓ activate

Level 1
selected SKILL.md instructions

        ↓ explicit need

Level 2
references/*
read through ordinary file tools

        ↓ explicit execution

Level 3
scripts/assets/templates
use ordinary execution/file tools
```

A project may contain many Skills while only a compact catalog and the explicitly activated bodies enter the model context.

## 4. Skill package format

Reference layout:

```text
.mini-pi/skills/
└── code-review/
    ├── SKILL.md
    ├── references/
    ├── scripts/
    └── assets/
```

Only `SKILL.md` is required.

```markdown
---
name: code-review
description: Review code changes for bugs and regressions.
owner: project
---

# Code Review

1. Inspect the diff.
2. Identify behavior changes.
3. Check tests and regression risk.
```

v0.4 intentionally supports a deterministic scalar frontmatter subset rather than a full YAML implementation.

## 5. Discovery and loading are different

```text
discover
→ descriptor only

load
→ selected SKILL.md body only

activate
→ run-scoped active state

execute
→ ordinary tools only
```

The reference loader validates lexical containment, file type, symlink behavior, canonical `realpath`, and descriptor/manifest identity before returning `LoadedSkill`.

It does **not** automatically traverse or execute `references/`, `scripts/`, or `assets/`.

## 6. Model-driven activation

When Skills are enabled, the Agent automatically registers the ordinary tool:

```text
load_skill(name)
```

Flow:

```text
model sees compact catalog
      ↓
load_skill("code-review")
      ↓
SkillActivationService
      ↓
ActiveSkillStore
      ↓
compact durable ToolResult
      ↓
next model turn
      ↓
full code-review instructions via ContextSupplement
```

The ToolResult stays small:

```text
Skill 'code-review' activated.
```

The full Skill body is never duplicated into durable tool history.

## 7. Context budgeting

Skills require `AgentOptions.context`.

This is intentional: catalog and active Skill bodies must be included **before** `ContextPlanner.prepare()` so token accounting remains correct.

```text
base system prompt
      ↓
summary checkpoint
      ↓
Skill catalog + active Skill supplements
      ↓
ContextPlanner
      ↓
PreparedContext
```

If mandatory Skill material itself makes the input budget impossible, the runtime fails explicitly rather than appending text after planning or silently dropping an active Skill.

## 8. Run-scoped activation

Active Skills live for one `Agent.prompt()` run:

```text
prompt() start
   ↓
active store cleared
   ↓
model may activate Skills
   ↓
active bodies persist across turns in this run
   ↓
prompt() finally
   ↓
active store cleared
```

The catalog persists for the Agent lifetime, but active bodies do not leak into the next prompt.

## 9. Skill lifecycle events

Skill activation emits metadata-only events:

```text
skill_activation_start
skill_activated
skill_activation_reused
skill_activation_failed
```

Origins are:

```text
api | manual | tool
```

Events never contain full Skill instructions. Agent integration bridges these events into the regular Agent event stream with `runId` and `turn` metadata.

## 10. Minimal configuration

```ts
const estimator = new ApproximateTokenEstimator();

const agent = await Agent.create({
  provider,
  cwd: process.cwd(),
  context: {
    planner: new KeepRecentContextPlanner({ estimator }),
    budget: {
      contextWindow: 32_000,
      outputReserve: 4_000,
      safetyMargin: 1_000
    }
  },
  skills: {}
});

await agent.prompt("Review this change.");
```

Project Skills are discovered from:

```text
<cwd>/.mini-pi/skills/*/SKILL.md
```

## 11. Project structure

```text
src/
├── core/
│   ├── agent.ts
│   ├── agent-loop.ts
│   └── events.ts
├── context/
│   ├── runtime.ts
│   ├── supplements.ts
│   └── ...
├── skills/
│   ├── manifest-parser.ts
│   ├── project-source.ts
│   ├── registry.ts
│   ├── paths.ts
│   ├── loader.ts
│   ├── catalog.ts
│   ├── active-store.ts
│   ├── activation-service.ts
│   ├── load-skill-tool.ts
│   ├── events.ts
│   ├── manual-activation.ts
│   └── runtime.ts
└── index.ts

examples/
├── 07-context-compaction.ts
├── 08-skill-manual-activation.ts
└── 09-progressive-skills.ts
```

## 12. Run

```bash
npm install
npm run check
npm run demo:context
npm run demo:skills
```

`demo:skills` shows the complete v0.4 learning path:

```text
first model request
→ compact catalog only

model calls load_skill
→ compact ToolResult

second model request
→ catalog + selected full Skill body

next Agent.prompt()
→ catalog only again
```

## 13. Version snapshots

```text
v0.1  core feedback loop
v0.2  streaming + scheduling
v0.3  context budget + compaction
v0.4  Skills + progressive disclosure
v0.5  extensions/hooks
v0.6  MCP
v0.7  session tree
v0.8  permissions/sandbox
v0.9  RPC/headless runtime
v1.0  stable public API
```

`v0.4` is a frozen educational snapshot for the Skills mental model.
