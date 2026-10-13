# v0.4 Skills Architecture

## 1. Objective

v0.4 answers one architectural question:

```text
How can an Agent gain task-specific workflow knowledge
without hard-coding that workflow into the runtime?
```

Answer:

```text
Skill package
   ↓
discovery
   ↓
compact descriptor catalog
   ↓
on-demand loading
   ↓
run-scoped activation
   ↓
budgeted context material
```

The runtime remains responsible for execution. Skills remain responsible for guidance.

---

## 2. Layering

```text
Application / CLI
      │
      ▼
Skill activation request
      │
      ▼
Skill subsystem
  ┌───┼───────────────┐
  ▼   ▼               ▼
Source Registry     Loader
  │      │             │
  └──────┴──────┬──────┘
                ▼
         ActiveSkillStore
                │
                ▼
        Context supplements
                │
                ▼
          ContextRuntime
                │
                ▼
           AgentLoop
```

Forbidden dependencies:

```text
Skill parser -> AgentLoop
Skill registry -> provider HTTP
Skill loader -> shell execution
Skill discovery -> script execution
AgentLoop -> concrete Skill names
```

---

## 3. Data model

### SkillManifest

```ts
interface SkillManifest {
  name: string;
  description: string;
  metadata?: Record<string, string>;
}
```

### SkillDescriptor

```ts
interface SkillDescriptor {
  name: string;
  description: string;
  root: string;
  manifestPath: string;
  metadata?: Record<string, string>;
}
```

Descriptor properties:

- cheap to keep in memory;
- enough for catalog rendering;
- no full instructions;
- no executable callback;
- immutable after registration.

### LoadedSkill

```ts
interface LoadedSkill {
  descriptor: SkillDescriptor;
  instructions: string;
}
```

A loaded Skill is still data. Loading must not execute scripts.

### ActiveSkill

```ts
interface ActiveSkill {
  skill: LoadedSkill;
  activatedAtTurn: number;
}
```

Activation state belongs to one Agent run in v0.4.

---

## 4. Parser boundary

`SkillManifestParser` owns only text parsing/validation:

```text
raw SKILL.md
    ↓
frontmatter parser
    ↓
validated manifest + body
```

It does not know:

```text
filesystem discovery
Agent state
context budget
activation
shell execution
```

Recommended result:

```ts
interface ParsedSkillDocument {
  manifest: SkillManifest;
  instructions: string;
}
```

Parsing must be deterministic and network-free.

---

## 5. Discovery boundary

```ts
interface SkillSource {
  discover(context: SkillDiscoveryContext): Promise<SkillDescriptor[]>;
}
```

Reference `ProjectSkillSource` searches:

```text
<cwd>/.mini-pi/skills/*/SKILL.md
```

Discovery does:

```text
locate file
read enough manifest metadata
validate
return descriptor
```

Discovery does not:

```text
load references
load scripts
activate Skill
execute anything
inject context
```

---

## 6. Registry boundary

```ts
class SkillRegistry {
  register(descriptor: SkillDescriptor): void;
  replace?(descriptor: SkillDescriptor): void; // only if later justified
  get(name: string): SkillDescriptor | undefined;
  list(): readonly SkillDescriptor[];
}
```

v0.4 reference policy:

```text
duplicate normalized name => DuplicateSkillError
```

No silent override.

Ordering should be deterministic by normalized name unless source precedence is explicitly required.

---

## 7. Loader boundary

```ts
interface SkillLoader {
  load(descriptor: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill>;
}
```

Loader responsibilities:

```text
resolve manifest path under root
read SKILL.md
parse again
verify manifest identity
return full instructions
```

Loader does not preload:

```text
references/*
scripts/*
assets/*
```

This is critical to progressive disclosure.

---

## 8. Path safety

Skill package root:

```text
/root/to/code-review
```

Allowed Skill-local helper path:

```text
references/security.md
→ /root/to/code-review/references/security.md
```

Rejected:

```text
../../outside.txt
```

Any Skill-specific resolver must prove:

```text
resolvedPath is inside descriptor.root
```

General workspace tools keep their existing workspace-root policy.

---

## 9. Catalog architecture

Catalog renderer input:

```text
SkillDescriptor[]
```

Output:

```text
compact deterministic string
```

It must never require loading full Skill bodies.

Recommended representation:

```text
<available_skills>
<skill name="code-review">...</skill>
<skill name="release">...</skill>
</available_skills>
```

The renderer must escape representation-sensitive content.

---

## 10. Context supplements

v0.4 should generalize model-visible non-message context into explicit supplements.

Conceptual type:

```ts
interface ContextSupplement {
  id: string;
  kind: "skill-catalog" | "active-skill";
  content: string;
  required: boolean;
}
```

Possible future kinds:

```text
extension context
MCP prompt/resource
project instructions
```

But v0.4 implements only Skill-related kinds.

Supplements must enter before final budget verification.

---

## 11. Budget semantics

Context budget now contains several classes of model-visible material:

```text
base system prompt
summary checkpoint
Skill catalog
active Skill bodies
recent durable messages
```

Reference priority policy for v0.4:

```text
required base system                  mandatory
active Skill instructions            mandatory once activated
compact catalog                      mandatory while Skills enabled
summary checkpoint                   existing v0.3 behavior
recent causal message tail           existing planner behavior
```

If required Skill material makes the request impossible, fail explicitly with a context-budget error. Do not silently drop an already activated Skill body.

---

## 12. Activation architecture

`load_skill` adapter:

```text
ToolCall load_skill(name)
        ↓
SkillActivationTool
        ↓
registry.get(name)
        ↓
loader.load(descriptor)
        ↓
activeStore.activate(...)
        ↓
ToolResult("Skill 'code-review' activated")
```

The full Skill body is not returned as an unbudgeted giant ToolResult. Its primary role is run-scoped activation state consumed by the next context preparation.

This avoids duplicating the full Skill text both as a ToolResult and as active context.

---

## 13. Activation lifetime

At `agent_start`:

```text
ActiveSkillStore.clear()
```

During run:

```text
activate code-review
activate code-review again
→ one active record
```

At run end/error:

```text
clear active bodies
```

Descriptor catalog remains available across runs because it is discovery state, not activation state.

---

## 14. Explicit activation

Manual activation such as:

```text
/skill:code-review
```

must call the same activation service/store used by `load_skill`.

Architecture:

```text
CLI explicit activation ─┐
                        ├─► SkillActivationService
model load_skill call ──┘
```

Do not duplicate activation semantics in CLI and tool code.

---

## 15. Events

Events remain observational:

```text
skill_discovery_start
skill_discovery_end
skill_activation_start
skill_activated
skill_activation_error
skill_context_prepared
```

No event listener may be required for correctness.

Useful metadata:

```text
runId
turn
skillName
activeSkillCount
catalogSkillCount
estimatedSkillTokens
```

Avoid emitting full instructions.

---

## 16. Error model

```ts
class SkillError extends Error {}
class InvalidSkillManifestError extends SkillError {}
class DuplicateSkillError extends SkillError {}
class SkillNotFoundError extends SkillError {}
class SkillPathError extends SkillError {}
class SkillLoadError extends SkillError {}
```

Errors should identify Skill name/path where safe and useful.

---

## 17. Core invariants

```text
1. Skills never require a Skill-name branch in AgentLoop
2. discovery never executes package code
3. loading one Skill does not recursively load all package resources
4. descriptor catalog remains compact
5. duplicate names fail explicitly
6. activated Skill bodies are run-scoped
7. repeat activation is idempotent
8. Skill context participates in v0.3 budgeting
9. Skill activation never rewrites durable history
10. scripts use ordinary tools
11. full instructions are not exposed until activation
12. deterministic tests do not require a provider/network
```

---

## 18. Future compatibility

v0.4 should prepare for:

```text
v0.5 Extensions
  executable lifecycle customization

v0.6 MCP
  remote tools/resources/prompts can become other catalog/context sources

v0.8 Permission policy
  Skill-provided scripts remain subject to ordinary execution mediation
```

It must not implement those versions early.
