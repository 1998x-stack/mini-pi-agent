# v0.5 Implementation Plan

Primary invariant:

> Extensions may change runtime behavior only through explicit registrations and named lifecycle hooks.

Secondary invariant:

> AgentLoop must remain extension-name agnostic.

## v0.5.1 — Hook contracts + deterministic HookPipeline ✅ implemented

### Implemented

```text
src/extensions/hooks.ts
src/extensions/errors.ts
src/extensions/pipeline.ts
src/extensions/index.ts
src/index.ts

tests/extension-hooks.test.ts
```

### Hook surface

```text
before_run
before_model
after_model
before_tool
after_tool
after_turn
after_run
```

`HookPipeline.register(owner, hook, handler)` records explicit extension ownership and returns an idempotent `Disposable`.

Ordering is deliberately simple:

```text
registration order only
```

There is no numeric priority system.

### Mutation model

Handlers receive cloned event objects. Direct mutation of the event clone has no runtime meaning.

Only explicit return values participate in behavior:

```text
before_run / before_model
→ ContextSupplement contributions

after_model / after_turn / after_run
→ observe only

before_tool
→ continue
→ replace arguments
→ block with reason

after_tool
→ constrained current ToolResult replacement
```

`before_tool` replacement preserves ToolCall `id` and `name`; only `arguments` may change. Each later handler observes the transformed arguments produced by the previous handler.

A block short-circuits remaining handlers and returns blocking `extensionName` provenance.

### Error and cancellation semantics

Normal handler exceptions become:

```text
ExtensionHookError
```

with:

```text
extensionName
hook
cause
```

If the run AbortSignal is cancelled, the original abort reason propagates rather than being wrapped as an extension failure. Cancellation is checked before and after every awaited handler, so later handlers do not run after abort.

Blank owner names fail through `InvalidHookRegistrationError`.

### Verification performed

The extension source subset passed TypeScript checking under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
handler A sees n=1 → replace n=2
handler B sees n=2 → replace n=3
gate sees n=3 → block

final call arguments.n = 3
blocking extension = gate
source event unchanged
```

It also verified original abort-reason propagation and `ExtensionHookError` cause/owner/hook provenance.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.5.2 — ExtensionDefinition + ExtensionHost + ownership ← next

### Goal

Create a scoped setup API and one owner for loaded Extensions.

### Add

```text
src/extensions/types.ts
src/extensions/api.ts
src/extensions/host.ts
src/extensions/registrations.ts

tests/extension-host.test.ts
```

### Target API

```ts
interface ExtensionDefinition {
  name: string;
  version?: string;
  setup(api: ExtensionAPI): void | Promise<void>;
}

interface ExtensionAPI {
  readonly extensionName: string;

  on<K extends HookName>(
    hook: K,
    handler: HookHandler<K>
  ): Disposable;
}
```

### Required semantics

- normalized duplicate extension names fail explicitly;
- extension load order is deterministic;
- handler registration order inside each extension is preserved;
- every registration is owned by exactly one extension;
- failed setup is atomic and leaves no registrations behind;
- unload removes exactly the target extension's registrations;
- an extension receives capabilities, not mutable Agent internals;
- no Agent integration yet.

---

## v0.5.3 — Extension-owned Tool registration + unload cleanup

Add `registerTool()` to ExtensionAPI and owned ToolRegistry integration. Built-in and extension Tools must share the ordinary Tool path; collisions fail explicitly and unload removes only owned Tools.

---

## v0.5.4 — `before_tool` gate/replace integration

Integrate the v0.5.1 pipeline into ordinary tool execution:

```text
Assistant ToolCall
      ↓
before_tool
      ↓
continue / replaced arguments / blocked
      ↓
ToolRegistry.validate(final args)
      ↓
Tool.execute
```

Blocked calls become explicit error ToolResults rather than disappearing.

---

## v0.5.5 — Model/run hooks + budgeted context contributions

Integrate `before_run`, `before_model`, `after_model`, `after_tool`, `after_turn`, and `after_run` at stable lifecycle points.

Extension-added model context must enter as ContextSupplements before ContextRuntime/ContextPlanner budgeting.

---

## v0.5.6 — Failure + cancellation + cleanup + observability

Refine strict-vs-cleanup failure semantics and add metadata-only extension lifecycle/hook trace events. `after_run` cleanup attempts must remain deterministic even when one cleanup handler fails.

---

## v0.5.7 — Agent integration + examples + `0.5.0` freeze

Expose `AgentOptions.extensions`, prove the complete lifecycle end to end, add an educational example, finalize package/runtime version `0.5.0`, update docs, and freeze the branch.

## Final Definition of Done

- [x] typed hook contracts
- [x] deterministic HookPipeline
- [x] ExtensionHookError provenance
- [x] cancellation propagation through hooks
- [x] handler mutation isolation
- [ ] ExtensionDefinition + scoped ExtensionAPI
- [ ] ExtensionHost + registration ownership
- [ ] unload cleanup
- [ ] extension Tool registration
- [ ] before_tool gate/replace Agent integration
- [ ] budgeted before_model contributions
- [ ] remaining run/model/tool hook integration
- [ ] failure/cancellation cleanup semantics
- [ ] extension lifecycle observability
- [ ] deterministic Agent integration tests
- [ ] educational example
- [ ] package/runtime/docs finalized as `0.5.0`

Only then freeze `v0.5`.
