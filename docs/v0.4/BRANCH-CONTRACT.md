# v0.4 Branch Contract

## 1. Purpose

`v0.4` is the canonical learning branch for:

```text
Skills + progressive disclosure
```

It starts from the completed `v0.3` context-runtime snapshot and adds only workflow-knowledge mechanisms.

---

## 2. Allowed work

This branch may change:

```text
src/skills/**
src/context/** where generic context-supplement integration is required
src/core/agent.ts for generic Skills orchestration
src/core/events.ts for Skill lifecycle events
src/index.ts
examples/** Skills examples
tests/** Skills tests
docs/v0.4/**
docs/versions/v0.4.md
version.md
README.md / CHANGELOG.md during final freeze
package.json / src/version.ts only at final v0.4 freeze
```

AgentLoop may receive only generic orchestration seams. It must not learn concrete Skill names or workflow logic.

---

## 3. Forbidden work

Do not pull forward:

```text
v0.5 Extension hooks
v0.6 MCP transport/client
v0.7 session DAG/branching
v0.8 permission/sandbox implementation
v0.9 RPC/headless protocol
Skill marketplace/install/update
remote Skill catalogs
semantic vector search
subagents
hidden script execution
provider-specific Skill protocol
```

If a requirement appears to need one of those, document it as future work rather than widening v0.4.

---

## 4. Version ancestry

```text
v0.3  implemented/frozen context snapshot
  │
  └── v0.4  active Skills branch
```

Do not rewrite `v0.3` to support v0.4.

Any generic seam missing from v0.3 should be introduced as a v0.4 delta and explained explicitly.

---

## 5. Package version rule

During design and intermediate implementation:

```text
package.json version = 0.3.0
MINI_PI_VERSION      = 0.3.0
```

This communicates that the branch has not yet passed v0.4 acceptance.

Only v0.4.7 freeze may advance these to:

```text
0.4.0
```

---

## 6. Increment order

Mandatory order:

```text
0.4.1 manifest parser/types
  ↓
0.4.2 discovery/registry
  ↓
0.4.3 loader/path safety
  ↓
0.4.4 catalog/context supplements
  ↓
0.4.5 activation/load_skill
  ↓
0.4.6 events/references/manual activation
  ↓
0.4.7 end-to-end integration/freeze
```

Do not mark a later increment implemented while an earlier dependency remains only conceptual.

---

## 7. Completion rule for each increment

An increment may be marked implemented only when all are true:

```text
source exists on v0.4
public exports are correct where applicable
focused tests exist
strict TypeScript subset checks pass
at least one runtime smoke covers the dominant invariant where useful
docs/implementation status is updated
no false claim about full test suite execution
```

---

## 8. Core architectural invariants

Every v0.4 change must preserve:

```text
Skill != Tool
Skill != Extension
available Skills != fully loaded Skills
loaded Skill != executed script
durable history != Skill context
Skill context participates in budget accounting
AgentLoop remains workflow-agnostic
discovery/load remain non-executing
```

---

## 9. Context rule

No code may do this after context planning:

```text
prepared.systemPrompt += giantSkillBody
```

Skill catalog and active bodies must enter through the generic context preparation path before final budget verification.

If that requires extending v0.3 `ContextRuntime`, the extension must remain generic enough for later context sources.

---

## 10. Execution rule

Skill package resources do not receive privileged execution semantics.

```text
reference file
→ normal read path

script
→ normal shell/tool path

asset/template
→ normal file/tool path
```

No `SkillLoader.execute()` API.

---

## 11. Activation rule

v0.4 activation is:

```text
run-scoped
idempotent by Skill name
explicitly observable
cleared across Agent runs
```

Persistent/session-global activation is deferred.

Both model-driven and manual activation must share the same activation service/store.

---

## 12. Branch freeze rule

Freeze v0.4 only after:

```text
all 0.4.1–0.4.7 increments complete
end-to-end progressive disclosure proven
v0.3 invariants preserved
package/version updated to 0.4.0
version.md status = implemented historical learning snapshot
README/CHANGELOG reflect actual implementation
```

After freeze, new architecture work moves to `v0.5` rather than expanding v0.4 indefinitely.
