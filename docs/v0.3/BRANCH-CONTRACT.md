# v0.3 Branch Contract

This file defines how the `v0.3` branch is used.

---

# 1. Branch purpose

`v0.3` is the educational snapshot for:

```text
Context Budget
+
Context Planning
+
Tool Result Reduction
+
Compaction / Summary Checkpoints
```

It exists so a reader can switch directly to the branch and study this mental model without depending on later Skills, Extensions, MCP, session branching, permissions, or RPC work.

---

# 2. Current state

The branch begins as a **design-complete snapshot**.

Design-complete means:

- version identity exists;
- architecture boundaries are defined;
- target source layout is defined;
- staged implementation order is defined;
- acceptance invariants are defined;
- test matrix is defined;
- non-goals are explicit.

It does **not** mean the v0.3 runtime code is already implemented.

Never describe a planned mechanism as working until source + tests exist on this branch.

---

# 3. Relationship to v0.2

v0.3 depends conceptually on v0.2's stable runtime semantics:

```text
v0.2
streaming + scheduler + cancellation/order
        ↓
v0.3
prepare bounded model context before each model call
```

Therefore code implementation should proceed only against a base that contains the earlier validated runtime contracts required by v0.3.

If `main` has not yet integrated those v0.2 contracts, keep v0.3 implementation work limited to mechanisms that are independent of them, such as:

```text
budget arithmetic
estimator
context units
tool-result reduction
summary data contracts
```

Do not invent duplicate temporary versions of missing v0.2 contracts merely to make v0.3 compile.

---

# 4. Implementation order is mandatory

Follow:

```text
v0.3.1 budget/estimator
      ↓
v0.3.2 semantic units
      ↓
v0.3.3 tool-result reduction
      ↓
v0.3.4 deterministic planner
      ↓
v0.3.5 summary artifacts/store
      ↓
v0.3.6 progressive compaction
      ↓
v0.3.7 Agent integration
```

Skipping directly to LLM summarization is not allowed.

---

# 5. Required reading order on this branch

Before changing v0.3 code:

1. `Agents.md`
2. `version.md`
3. `docs/versions/v0.3.md`
4. `docs/v0.3/ARCHITECTURE.md`
5. `docs/v0.3/IMPLEMENTATION.md`
6. `docs/v0.3/TEST-PLAN.md`
7. relevant source files
8. relevant tests

`Plan.md` remains the repository-wide roadmap.

---

# 6. Scope lock

Allowed on v0.3:

```text
context budget
estimation
semantic context units
tool result reduction
prepared context
summary artifacts
summary store
summarizer seam
progressive compaction
context lifecycle events
Agent/context integration
```

Not allowed on v0.3:

```text
Skills implementation
Extension hooks
MCP
session branching DAG
permissions/sandbox
RPC/headless protocol
vector DB / generic RAG platform
```

Record those in later version docs instead of pulling them forward.

---

# 7. Integration rule

A v0.3 increment can be considered validated only when:

```text
source
+
tests
+
docs
+
relevant examples
```

agree on the same behavior.

When repository policy requires `main` to remain the newest validated state, validated implementation increments should be synchronized without rewriting the educational history of this branch.

---

# 8. Freeze rule

Freeze `v0.3` only after the Definition of Done in root `version.md` is satisfied.

Frozen means:

```text
v0.3 = stable historical learning snapshot
```

After freeze, normal feature work moves to v0.4. Only narrow v0.3 bug/doc fixes that preserve its scope should be accepted.
