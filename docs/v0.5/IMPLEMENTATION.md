# v0.5 Implementation Plan

Primary invariant:

> Extensions may change runtime behavior only through explicit registrations and named lifecycle hooks.

Secondary invariant:

> AgentLoop must remain extension-name agnostic.

## Completed

```text
v0.5.1  hook contracts + deterministic HookPipeline          ✅
v0.5.2  ExtensionDefinition + ExtensionHost + ownership      ✅
v0.5.3  Extension-owned Tool registration + unload cleanup   ✅
v0.5.4  before_tool gate/replace Runtime integration         ✅
```

## v0.5.1 — Hook contracts + deterministic HookPipeline ✅

Implemented typed lifecycle contracts, deterministic sequential HookPipeline execution, explicit `before_tool` continue/replace/block semantics, constrained `after_tool` transformation, context-contribution results, cancellation propagation, mutation isolation, `Disposable` hook registrations, and `ExtensionHookError` provenance.

---

## v0.5.2 — ExtensionDefinition + scoped ExtensionAPI + ExtensionHost ✅

Implemented normalized Extension identity, setup-scoped capability access, serialized async setup order, owned registrations, transaction-like setup rollback, reverse-order disposal, and exact hook cleanup on unload.

---

## v0.5.3 — Extension-owned Tool registration + unload cleanup ✅

Implemented setup-scoped `registerTool()`, generic identity-safe removable Tool registrations, typed Tool collisions, mixed hook/tool setup rollback, and exact owned Tool cleanup on unload. Extension Tools use the ordinary `ToolRegistry` and `Tool.execute()` path.

---

## v0.5.4 — `before_tool` gate/replace Runtime integration ✅

### Implemented

```text
src/core/tool-execution.ts
src/core/agent-loop.ts
src/index.ts

tests/before-tool-integration.test.ts
```

### Generic tool-execution seam

`AgentLoop` no longer contains the concrete resolve/validate/execute error wrapper inline. It delegates one ToolCall to:

```ts
executeToolCall({
  call,
  tools,
  hooks?,
  cwd,
  runId,
  turn,
  signal
})
```

The helper is generic runtime infrastructure. It knows `HookPipeline`, but never any concrete Extension name or policy.

### Execution order

```text
Assistant ToolCall
      ↓
AbortSignal check
      ↓
ToolRegistry.get(original name)
      ↓
before_tool HookPipeline
      ├── continue
      ├── replace arguments only
      └── block with extension provenance
      ↓
continue path:
ToolRegistry.validate(final arguments)
      ↓
Tool.execute(final arguments)
      ↓
ToolResultMessage
```

A `replace` preserves ToolCall `id` and `name`; only `arguments` change. The transformed arguments are what schema validation and `Tool.execute()` receive.

### Block semantics

A block is not a hook failure and does not disappear silently.

```text
before_tool → block
      ↓
actual Tool.execute() is skipped
      ↓
ToolResultMessage
  role = tool
  isError = true
  toolCallId = original call id
  toolName = original call name
  content includes blocking extension + reason
      ↓
normal durable AgentMessage history
      ↓
next model turn can observe denial
```

`ToolExecutionOutcome` also exposes `blockedByExtension` for callers that need structured provenance without parsing ToolResult content.

### Failure boundary

Three failure classes remain intentionally distinct:

```text
Extension returns block
→ explicit error ToolResult
→ run continues

ordinary Tool resolve / validate / execute failure
→ explicit error ToolResult
→ run continues

Extension hook throws ExtensionHookError
→ propagated as run-level failure

AbortSignal cancellation
→ original abort reason propagated
```

Hook failures/cancellation are therefore not silently downgraded into ordinary Tool observations.

### One path for every Tool

Built-in Tools, Skill-provided `load_skill`, and Extension-owned Tools all pass through the same `executeToolCall()` seam once a HookPipeline is supplied.

No `ExtensionToolExecutor` exists.

### Verification performed

The changed source subset passed TypeScript checking under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
invalid original args
→ before_tool replaces args
→ final args pass validation
→ Tool executes with replacement

before_tool blocks Tool
→ Tool execute counter unchanged
→ explicit error ToolResult contains blocker + reason
```

Focused integration tests additionally prove:

- ToolCall id/name remain unchanged;
- replacement arguments reach validation and execution;
- built-in and Extension-owned Tools traverse the same hook path;
- `ExtensionHookError` propagates instead of becoming a ToolResult;
- cancellation preserves the original abort reason;
- blocked ToolResults are appended to durable history;
- the following provider request sees the blocked ToolResult;
- the blocked Tool implementation is never executed.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.5.5 — Model/run hooks + budgeted context contributions ← next

### Goal

Integrate the remaining stable lifecycle seams while preserving v0.3/v0.4 context-budget and durable-history invariants.

### Integrate

```text
before_run
before_model
after_model
after_tool
after_turn
after_run
```

### Context rule

Extension model-visible material from `before_run` / `before_model` must enter as `ContextSupplement[]` before `ContextRuntime` / `ContextPlanner` budgeting.

Forbidden:

```text
PreparedContext
      ↓
append Extension prompt text afterwards   ❌
```

### Hook power

```text
before_run    → context contribution only
before_model  → context contribution only
after_model   → observe only
after_tool    → constrained current ToolResult transform
after_turn    → observe only
after_run     → observe / cleanup-oriented
```

Must define precisely whether an `after_tool` transformed result is the durable/model-visible result and retain clear provenance.

---

## v0.5.6 — Failure + cancellation + cleanup + observability

Refine strict-vs-cleanup failure semantics and add metadata-only Extension lifecycle/hook trace events. Cleanup attempts must remain deterministic when one cleanup handler fails.

---

## v0.5.7 — Agent integration + examples + `0.5.0` freeze

Expose `AgentOptions.extensions`, prove the complete lifecycle end to end, add an educational example, finalize package/runtime version `0.5.0`, update docs, and freeze the branch.

## Final Definition of Done

- [x] typed hook contracts
- [x] deterministic HookPipeline
- [x] ExtensionHookError provenance
- [x] cancellation propagation through hooks
- [x] handler mutation isolation
- [x] ExtensionDefinition + scoped ExtensionAPI
- [x] ExtensionHost deterministic load order
- [x] registration ownership
- [x] failed setup rollback
- [x] hook unload cleanup
- [x] extension Tool registration
- [x] Tool unload cleanup
- [x] typed Tool collision semantics
- [x] identity-safe removable Tool registration
- [x] before_tool Agent/runtime integration
- [x] blocked ToolCall becomes durable explicit observation
- [x] built-in / Skill / Extension Tools share one hook-aware Tool path
- [ ] budgeted before_model contributions
- [ ] remaining run/model/tool hooks
- [ ] failure/cancellation cleanup semantics
- [ ] extension lifecycle observability
- [ ] deterministic Agent integration tests
- [ ] educational example
- [ ] package/runtime/docs finalized as `0.5.0`

Only then freeze `v0.5`.
