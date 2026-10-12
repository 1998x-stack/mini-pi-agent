# Agents.md — mini-pi-agent Development Contract

> **Mandatory for every future iteration:** read this file before changing code, tests, documentation, branch scope, version scope, or architecture.
>
> This document defines repository invariants. It is an engineering contract, not optional advice.

---

# 1. Repository mission

`mini-pi-agent` is a small, educational, Pi-style Agent Runtime written from first principles in TypeScript.

Its purpose is to expose one layer of agent-runtime "magic" at a time so a reader can understand, test, and extend the mechanisms behind modern coding agents.

The project optimizes for:

1. a tiny, inspectable core loop;
2. explicit runtime boundaries;
3. correctness and deterministic tests;
4. separation of mechanism from policy;
5. extension seams that survive future versions;
6. examples that reveal why each abstraction exists;
7. conceptual transfer to Pi / OpenCode / Claude Code / Codex-like runtimes without cloning them.

It does **not** optimize for:

- feature parity with any production agent;
- provider API completeness;
- maximum autonomy;
- a large built-in tool catalog;
- hiding runtime behavior behind a framework;
- performance before the scheduling model is understandable.

The guiding sequence is:

```text
one version
   ↓
one primary runtime idea
   ↓
small reference mechanism
   ↓
invariant + failure tests
   ↓
runnable example
   ↓
only then move outward
```

---

# 2. The irreducible mental model

Every design decision should remain understandable relative to this loop:

```text
User input
   ↓
append UserMessage
   ↓
LLM(messages, tools)
   ↓
AssistantMessage
   ├── no tool calls ───────────────► finish
   │
   └── tool calls
          ↓
      runtime executes tools
          ↓
      ToolResultMessage(s)
          ↓
      append observations
          └─────────────────────────► LLM again
```

Or, conceptually:

```text
Reason → Act → Observe → Repeat
```

A new subsystem must either:

- implement this mechanism more faithfully;
- expose a necessary runtime concern around it; or
- live outside the core as policy/workflow.

If a feature can be layered on top, do not put it into `agent-loop.ts`.

---

# 3. Mandatory reading order before work

First determine the current branch.

## On `main`

Read in this order:

1. `Agents.md`
2. `Plan.md`
3. `version.md`
4. `docs/ARCHITECTURE.md`
5. `docs/EXTENSION-POINTS.md`
6. the relevant `docs/versions/vX.Y.md`
7. source files in the subsystem being changed
8. tests for that subsystem

`Plan.md` is the canonical forward architecture and version sequence.

## On a version branch such as `v0.2`

Read:

1. `Agents.md`
2. `version.md`
3. the matching section in `Plan.md` if present on the branch
4. relevant source files
5. relevant tests and examples

A historical version branch is a learning snapshot. Never assume it should contain later-version features.

---

# 4. Branch model

## 4.1 `main` invariant

`main` must always represent the newest integrated, validated repository state.

Allowed:

```text
v0.2 branch ── focused implementation/testing ──► validated increment
                                                  │
                                                  └──► main
```

Forbidden:

```text
v0.2 branch = newer working runtime
main        = stale older runtime
```

Once an increment is validated and intended to become current behavior, synchronize it into `main`.

## 4.2 Version branches

Version branches are educational snapshots, not long-lived divergent products.

Expected sequence:

- `v0.1` — core feedback loop and runtime seams
- `v0.2` — streaming protocol and tool scheduling
- `v0.3` — context budgets and compaction
- `v0.4` — skills
- `v0.5` — extensions/hooks
- `v0.6` — MCP tool source
- `v0.7` — session tree/branching
- `v0.8` — permissions/sandbox policy
- `v0.9` — RPC/headless runtime
- `v1.0` — stable runtime extension contracts

Every version branch must contain:

- `Agents.md`
- `version.md`
- tests proving its new mechanism
- at least one educational example when the mechanism is user-visible

## 4.3 Historical branch freeze

After a version is frozen, only the following are normally acceptable:

- documentation corrections;
- test corrections that preserve the historical scope;
- narrow bug fixes required for behavior promised by that version.

Do not backport future architecture merely for convenience.

---

# 5. Version lifecycle

Every version follows the same lifecycle.

## Phase A — define the mental model

Before implementation:

1. name the single primary idea;
2. explain why it depends on the previous version;
3. identify subsystem ownership;
4. define dependency direction;
5. state explicit non-goals;
6. define acceptance criteria;
7. update `version.md`;
8. verify consistency with `Plan.md`.

## Phase B — implement the smallest reference mechanism

Priority order:

```text
correctness
   ↓
clarity
   ↓
observability
   ↓
testability
   ↓
extensibility
   ↓
performance
```

Do not hide the educational path merely to imitate a production optimization.

## Phase C — prove invariants

Tests must verify mechanism, not only final text output.

Examples:

- Agent loop: a tool result is appended before the next model call.
- Tool registry: unknown/invalid arguments fail deterministically.
- Scheduler: result ordering is defined even if execution is concurrent.
- Context compaction: durable history is preserved while model context shrinks.
- Skills: loading a skill must not require a branch inside the core loop.
- Extensions: hook ordering and failure isolation are explicit.
- MCP: remote tools adapt to the same `Tool` contract as local tools.
- Session tree: branching does not destructively rewrite historical entries.
- Permission system: policy can deny an invocation before execution.

## Phase D — integrate

After validation:

1. update docs;
2. update `version.md` status/delta;
3. synchronize validated state to `main`;
4. ensure `main` is not behind the active branch.

## Phase E — freeze

A version becomes a historical learning snapshot only after its Definition of Done is satisfied.

---

# 6. Starting a new version branch

When beginning `vX.Y`:

1. verify `main` is the newest validated state;
2. create `vX.Y` from latest `main`;
3. update root `version.md` immediately;
4. keep `Agents.md` on the branch;
5. state the exact delta from the previous version;
6. implement only that version's planned mechanisms;
7. integrate validated increments back to `main`;
8. freeze the branch after Definition of Done.

Never start a later version from an older historical branch when `main` already contains newer integrated work.

---

# 7. Required `version.md` contract

`version.md` must answer:

1. What version/branch is this?
2. What is the version theme?
3. What changed relative to the previous version?
4. Why is the change sequenced here?
5. What mechanisms were added?
6. What mechanisms intentionally remain unchanged?
7. What is the mental model / architecture diagram?
8. Which source files matter most?
9. Which tests prove the version?
10. Which examples demonstrate it?
11. What should the reader understand after finishing it?
12. What is explicitly out of scope?
13. What work remains if the version is active?
14. What dependency does the next version build on?

The most important section is always:

> **What changed from the previous version, and why does that architectural delta matter?**

---

# 8. Architecture rules

## 8.1 Keep the core dependency direction inward

Preferred dependency model:

```text
Applications / CLI / future TUI / RPC
               │
               ▼
            Agent facade
               │
               ▼
            Agent Loop
      ┌────────┼───────────┐
      ▼        ▼           ▼
LLMProvider  ToolRegistry  ContextTransform
                         \
                          \── SessionStore / Events

Concrete adapters depend on these contracts:

OpenAI-compatible provider ─► LLMProvider
JSONL session             ─► SessionStore
local file/shell tools    ─► Tool
future MCP adapter        ─► Tool source / Tool
```

Core runtime code must not depend on CLI rendering, a specific provider, JSONL details, MCP transport, or a concrete skill loader.

## 8.2 Keep `Agent` small

`Agent` is a stateful facade. It should coordinate state and user-facing operations such as:

- `prompt`
- `steer`
- `followUp`
- `abort`
- event subscription

The runtime mechanism belongs in `runAgentLoop()` and related focused components.

Do not turn `Agent` into a god object.

## 8.3 Separate mechanism from policy

Examples:

- `Tool` describes execution capability; `ToolScheduler` decides execution strategy.
- `SessionStore` preserves history; `ContextTransform` decides what the model sees.
- EventBus observes runtime lifecycle; extension hooks may later intercept lifecycle.
- Skills provide instructions/resources; they are not a new execution engine.
- MCP provides remote tools; it is not a special branch in the agent loop.
- Permission middleware decides whether an invocation is allowed; tool implementations should not own global policy.

## 8.4 AgentMessage is not provider protocol

Internal runtime messages must remain provider-neutral.

```text
AgentMessage[]
      │
      ▼
provider adapter
      │
      ▼
OpenAI / Anthropic / other wire format
```

Provider-specific serialization/parsing belongs inside provider adapters.

## 8.5 Full runtime history is not model context

Preserve this distinction:

```text
durable session history
          │
          ▼
ContextTransform / budget / compaction
          │
          ▼
model-visible context
```

Never destructively truncate durable history merely to fit a context window.

## 8.6 Tools are environment syscalls

A tool is conceptually:

```text
schema + executor + execution context
```

The model proposes an invocation; the runtime executes it.

Do not allow a provider adapter to directly touch the filesystem/shell as a shortcut.

## 8.7 Tool failures are normally observations

An expected tool failure should usually become:

```text
ToolResultMessage(isError=true)
```

so the model can inspect the environment failure and recover.

Reserve fatal runtime errors for failures that prevent the loop itself from proceeding safely.

---

# 9. Scope discipline

Each version should introduce one dominant architectural idea.

Before implementing a feature, ask:

1. Is it required to teach the current version's idea?
2. Is it required by an acceptance criterion?
3. Is it a dependency for the current mechanism?
4. Can it be expressed as a future adapter/policy instead?
5. Would adding it now hide a more fundamental boundary?

If it belongs later, document it in `Plan.md` instead of implementing it immediately.

Examples:

- Do not add a dependency-aware parallel scheduler before sequential streaming semantics are explicit.
- Do not implement compaction by mutating JSONL session history.
- Do not hard-code `SKILL.md` behavior into `Agent`.
- Do not add MCP-specific message roles to the core message model merely because an MCP server exists.
- Do not put permission prompts into each tool implementation.

---

# 10. API design rules

Prefer tiny interfaces that express stable runtime seams.

Important contracts include:

- `LLMProvider`
- `Tool`
- `ToolRegistry`
- `ContextTransform`
- `SessionStore`
- `AgentEvent`
- future `ToolScheduler`
- future extension hook interfaces

Rules:

1. avoid provider-specific fields in core interfaces unless generalized;
2. prefer data structures that can be serialized and tested;
3. make cancellation explicit via `AbortSignal` where work can block;
4. make ordering rules deterministic;
5. keep defaults safe and educational;
6. document material simplifications versus production systems.

---

# 11. Testing requirements

Every new subsystem should include, where applicable:

## A. Happy-path tests

Prove the normal mechanism works.

## B. Invariant tests

Prove the architectural rule itself.

## C. Failure-path tests

Malformed tool calls, unknown tools, denied permissions, provider failures, timeouts, cancellation, corrupt session data, or invalid hook behavior must fail predictably.

## D. Deterministic runtime tests

Prefer `ScriptedLLM` for unit tests. Tests should not depend on paid/network LLM calls.

## E. Integration example/test

Connect the new subsystem to the surrounding runtime.

Current validation commands:

```bash
npm run typecheck
npm test
npm run build
npm run check
```

Zero-dependency smoke validation of the checked-in release artifact, when available locally:

```bash
node scripts/smoke.mjs
```

Never state that a command passed unless it was actually run successfully on the exact state being reported.

---

# 12. Safety and environment rules

## 12.1 File tools

File tools must remain rooted to the configured workspace and reject path traversal outside that root.

## 12.2 Shell

Shell execution is powerful and must remain opt-in.

Future versions should add policy/sandbox layers rather than silently making shell execution unrestricted by default.

## 12.3 Secrets

Never commit:

- `.env`
- API keys
- auth tokens
- session secrets
- provider credentials

Keep `.env.example` credential-free.

## 12.4 Generated outputs

Do not commit ignored/generated outputs unless a tiny fixture is explicitly required:

- `node_modules/`
- `dist/`
- `.sessions/`
- `.sandbox/`
- transient logs

---

# 13. Documentation rules

Update documentation whenever a change modifies:

- a public interface;
- runtime lifecycle;
- architecture boundary;
- event vocabulary;
- session semantics;
- version scope;
- extension seam;
- tool safety behavior;
- setup/example usage.

For a version change review at minimum:

- `version.md`
- `Plan.md`
- `Agents.md` if policy changed
- `docs/ARCHITECTURE.md`
- relevant `docs/versions/vX.Y.md`
- tests and examples
- `README.md` when user-facing usage changes

`docs/ROADMAP.md` is only a navigation summary. `Plan.md` is canonical.

---

# 14. Commit rules

Prefer commits that communicate architectural intent.

Good examples:

```text
feat(runtime): add streaming delta assembly
feat(scheduler): add sequential tool scheduler contract
test(context): preserve durable history during compaction
feat(skills): load SKILL.md metadata and instructions
feat(mcp): adapt remote tools into ToolRegistry
feat(session): add parent-linked session entries
docs: define v0.3 context-budget invariants
```

Avoid mixing unrelated runtime layers into one commit.

---

# 15. Backward compatibility

Until v1.0, public contracts may evolve, but changes must be intentional.

Before breaking a public API:

1. find internal callers in source/tests/examples;
2. decide whether compatibility teaches a useful concept;
3. migrate internal callers atomically;
4. document the break in `CHANGELOG.md` and `version.md`;
5. keep historical version branches representative of their own snapshot.

From v1.0 onward, stable contracts require explicit migration/deprecation policy.

---

# 16. Performance rule

Do not optimize away the educational mechanism.

Preferred progression:

```text
clear sequential reference
        ↓
correctness/invariant tests
        ↓
structured traces
        ↓
measure
        ↓
parallel/optimized path
        ↓
compare semantics
```

For example, v0.2 should retain a readable sequential scheduler even if a parallel scheduler is added.

---

# 17. External-reference policy

When verifying Pi-style architecture, prefer upstream/public primary sources where practical:

- Pi repository/package documentation;
- protocol/provider specifications;
- Model Context Protocol specification for MCP work;
- provider API documentation for wire-format behavior.

Use external systems to validate concepts, not to copy large implementations.

This repository should contain original educational implementations.

---

# 18. Definition of Done for any version

A version can be frozen only when all applicable items are true:

- [ ] one primary mental model is stated clearly;
- [ ] promised implementation is complete;
- [ ] dependency direction remains clean;
- [ ] unit tests pass;
- [ ] invariant tests pass;
- [ ] important failure paths are tested;
- [ ] deterministic tests avoid live LLM dependency;
- [ ] integration example works;
- [ ] cancellation/ordering semantics are defined where relevant;
- [ ] `version.md` accurately explains the delta;
- [ ] `Plan.md` remains accurate;
- [ ] architecture docs are updated;
- [ ] generated artifacts/secrets are not committed;
- [ ] `main` contains the newest validated state;
- [ ] next version's dependency rationale is documented.

---

# 19. Current directive — `main` / v0.1 baseline

The repository currently establishes the v0.1 core-runtime baseline.

Before beginning v0.2:

1. preserve the readability of `src/core/agent-loop.ts`;
2. preserve deterministic `ScriptedLLM` testing;
3. keep provider/session/tool implementations behind interfaces;
4. do not pull Skills, MCP, permissions, or RPC forward prematurely;
5. implement v0.2 scheduling/streaming through new focused components rather than branching the core loop into a monolith.

The next canonical work is defined by the v0.2 section of `Plan.md`.
