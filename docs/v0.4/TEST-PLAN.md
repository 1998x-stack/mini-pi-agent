# v0.4 Test Plan

## 1. Testing philosophy

v0.4 must prove Skills as a workflow-knowledge layer without requiring a live model or network service.

Reference strategy:

```text
fixture SKILL.md files
+ temporary project roots
+ deterministic fake loader/provider
+ existing ScriptedLLM / capturing provider
```

The important tests are architectural invariants, not only happy-path parsing.

---

## 2. Manifest parser tests

File:

```text
tests/skill-manifest.test.ts
```

Cases:

```text
valid minimal frontmatter
valid extra scalar metadata
missing frontmatter
missing name
empty name
missing description
empty description
empty instructions
malformed delimiter
malformed key/value line
duplicate reserved key
Unicode content
deterministic repeated parse
source text remains unchanged
```

Must prove parsing has no filesystem or execution side effects.

---

## 3. Discovery tests

File:

```text
tests/skill-discovery.test.ts
```

Fixture tree:

```text
project/
└── .mini-pi/skills/
    ├── alpha/SKILL.md
    ├── beta/SKILL.md
    └── ignored/no-skill.txt
```

Cases:

- missing root returns empty result;
- only valid Skill packages discovered;
- descriptors contain root/manifestPath/name/description only;
- deterministic ordering regardless of filesystem enumeration order;
- invalid manifest fails with typed error and path context;
- cancellation propagates;
- scripts/references are not read/executed during discovery.

---

## 4. Registry tests

File:

```text
tests/skill-registry.test.ts
```

Cases:

```text
register one descriptor
list deterministic order
lookup exact normalized name
duplicate name rejected
registry source object cannot be mutated through returned list
unknown name => undefined
```

If normalization is case-sensitive in v0.4, test that explicitly. If normalization changes, tests become the source of truth.

---

## 5. Loader/path tests

Files:

```text
tests/skill-loader.test.ts
tests/skill-paths.test.ts
```

Cases:

- load requested Skill only;
- descriptor root preserved;
- manifest identity matches descriptor;
- changed manifest name after discovery rejected;
- empty body rejected;
- manifest path escape rejected;
- Skill-relative helper path inside root accepted;
- `../` root escape rejected;
- symlink behavior documented/tested according to implementation policy;
- references/scripts not loaded by SkillLoader;
- abort before/during read propagated.

---

## 6. Catalog tests

File:

```text
tests/skill-catalog.test.ts
```

Cases:

```text
empty catalog
one descriptor
many descriptors
stable ordering
special-character escaping
full SKILL.md body never appears
duplicate descriptors impossible after registry validation
catalog rendering deterministic
```

Size assertion:

For a fixture with several large Skill bodies, catalog size must depend on descriptor text only, not instruction-body length.

---

## 7. Context supplement tests

File:

```text
tests/context-supplements.test.ts
```

Must prove:

```text
catalog supplement participates in token estimation
active-skill supplement participates in token estimation
summary checkpoint still works
recent message tail still works
supplements do not become AgentMessage history
required supplement overflow produces typed budget failure
ordering is deterministic
```

Critical regression assertion:

```text
state.messages before prepare
==
state.messages after prepare
```

---

## 8. ActiveSkillStore tests

File:

```text
tests/skill-activation.test.ts
```

Cases:

```text
starts empty
activate one
activate second
repeat same name is idempotent
activation order deterministic
get/list return safe copies/views
clear removes all active bodies
turn metadata preserved
```

---

## 9. load_skill adapter tests

File:

```text
tests/load-skill-tool.test.ts
```

Cases:

- schema accepts Skill name;
- unknown name => SkillNotFoundError represented as normal recoverable tool failure;
- known Skill invokes loader once;
- repeated activation does not duplicate active body;
- tool result is concise activation status, not full instruction dump;
- cancellation propagates;
- loader error remains observable;
- no hidden script execution.

---

## 10. Lifecycle event tests

File:

```text
tests/skill-events.test.ts
```

Expected ordering example:

```text
skill_activation_start
skill_activated
context_prepare_start
skill_context_prepared
context_prepared
```

Tests should verify metadata but avoid depending on full instruction text in events.

Event listeners must remain observational: removing all listeners cannot change activation correctness.

---

## 11. End-to-end Agent test

File:

```text
tests/agent-skills-integration.test.ts
```

Fixture:

```text
Skills:
  code-review (large body)
  release (large body)
  incident (large body)
```

Scripted provider sequence:

```text
request 1
→ sees catalog descriptors only
→ returns load_skill(code-review)

runtime
→ activates code-review

request 2
→ sees catalog + full code-review instructions
→ does not see full release/incident bodies
→ returns final answer
```

Assertions:

```text
AgentLoop remains generic
state.messages contains real user/assistant/tool messages only
full Skill body not persisted as fake conversation message
active body visible only after activation
unselected Skill bodies absent
next Agent run clears active body
catalog still available next run
```

---

## 12. Budget stress test

Create many descriptors and one large active Skill.

Cases:

```text
catalog + active body + recent tail fits
→ provider request succeeds

catalog alone exceeds budget
→ explicit ContextBudgetExceededError

active required Skill body exceeds remaining budget
→ explicit ContextBudgetExceededError

large inactive Skill bodies
→ must not affect request token estimate
```

This is the core progressive-disclosure proof.

---

## 13. Security/trust invariant tests

Tests should prove negative behavior:

```text
discovery never imports .js/.ts scripts
loader never executes scripts
activation never spawns a process
reference directories are not recursively ingested
path resolver cannot escape Skill root
```

v0.4 is not a sandbox, but it must not create unnecessary hidden execution paths.

---

## 14. Compatibility tests

Existing v0.3 behavior must remain valid when Skills are disabled:

```text
Agent without Skill configuration
→ ContextRuntime behavior unchanged
→ legacy ContextTransform path unchanged where still supported
```

When Skills are enabled but no Skill root exists:

```text
empty catalog
normal Agent behavior
```

---

## 15. Verification policy

Before marking each increment complete:

```text
TypeScript strict checking
noUncheckedIndexedAccess
exactOptionalPropertyTypes
focused runtime smoke
matching unit tests added
```

Do not claim full `npm run check` unless it was actually run successfully in the execution environment.

---

## 16. Final acceptance matrix

```text
Manifest parsing                         [ ]
Project discovery                       [ ]
Duplicate collision behavior            [ ]
Safe one-Skill loading                  [ ]
Path-root invariants                    [ ]
Compact catalog                         [ ]
Context-budget integration              [ ]
Run-scoped activation                   [ ]
Idempotent activation                   [ ]
load_skill adapter                      [ ]
Reference/script ordinary-tool path     [ ]
Skill events                            [ ]
End-to-end progressive disclosure       [ ]
Run reset                               [ ]
v0.3 regression compatibility           [ ]
Package/docs freeze                     [ ]
```
