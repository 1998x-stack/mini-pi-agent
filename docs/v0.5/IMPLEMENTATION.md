# v0.5 Implementation Plan

Primary invariant:

> Extensions may change runtime behavior only through explicit registrations and named lifecycle hooks.

Secondary invariant:

> AgentLoop must remain extension-name agnostic.

## Completed

```text
v0.5.1  hook contracts + deterministic HookPipeline          ✅
v0.5.2  ExtensionDefinition + ExtensionHost + ownership      ✅
```

## v0.5.1 — Hook contracts + deterministic HookPipeline ✅

Implemented typed lifecycle contracts, deterministic sequential HookPipeline execution, explicit `before_tool` continue/replace/block semantics, constrained `after_tool` transformation, context-contribution results, cancellation propagation, mutation isolation, `Disposable` hook registrations, and `ExtensionHookError` provenance.

Reference ordering remains registration order only; there is no numeric priority system.

---

## v0.5.2 — ExtensionDefinition + scoped ExtensionAPI + ExtensionHost ✅

### Implemented

```text
src/extensions/types.ts
src/extensions/api.ts
src/extensions/host.ts
src/extensions/registrations.ts
src/extensions/errors.ts
src/extensions/index.ts

tests/extension-host.test.ts
```

### Public contracts

```ts
interface ExtensionDefinition {
  readonly name: string;
  readonly version?: string;
  setup(api: ExtensionAPI): void | Promise<void>;
}

interface ExtensionAPI {
  readonly extensionName: string;

  on<K extends HookName>(
    hook: K,
    handler: HookHandler<K>
  ): Disposable;
}

interface LoadedExtension {
  readonly name: string;
  readonly normalizedName: string;
  readonly version?: string;
  readonly loadIndex: number;
}
```

`ScopedExtensionAPI` and the owned registration set are Host implementation details, not package-level API.

### Deterministic host semantics

`ExtensionHost` serializes `load()` / `unload()` operations.

This makes async setup deterministic:

```text
load(A) called
load(B) called

A setup start
A awaits
A setup end
B setup start
```

Hook registration order therefore follows Extension load invocation order rather than Promise completion timing.

Extension identity uses:

```text
trim + lowercase
```

so `Policy`, `policy`, and ` POLICY ` collide explicitly through `DuplicateExtensionError`.

### Setup-scoped capability rule

`ExtensionAPI` is open only while `setup()` is executing.

```text
setup starts
  ↓
api.on(...) allowed
  ↓
setup resolves/rejects
  ↓
API closes
```

An Extension cannot retain the API and register hidden handlers later from a timer or unrelated callback. Attempts after setup fail with `ExtensionApiClosedError`.

### Atomic setup / rollback

Setup is transaction-like:

```text
validate ExtensionDefinition
      ↓
create owned registration set
      ↓
open scoped API
      ↓
run setup()
      ↓
SUCCESS                       FAILURE
  │                              │
close API                    close API
  │                              │
commit LoadedExtension       dispose all owned registrations
                                 │
                              no Host record
                                 │
                           ExtensionSetupError
```

Registrations are disposed in reverse registration order, mirroring stack unwinding.

A failed setup cannot leave partially installed hooks behind.

### Unload ownership

Every setup registration is tracked by exactly one Host record.

```text
Extension A → A1, A2
Extension B → B1

unload(A)
→ dispose A2
→ dispose A1
→ B1 remains
```

Unknown unload targets fail explicitly through `UnknownExtensionError`.

### Verification performed

The extension source subset passed TypeScript checking under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
Alpha setup → hook installed
Beta setup  → hook installed
Broken setup registers hook then throws
→ broken registration rolled back
→ host list contains only Alpha/Beta

captured setup API after success
→ closed

unload Alpha
→ only Beta hook remains
```

Focused tests additionally cover normalized duplicates, async load serialization, setup failure cause preservation, clone semantics, definition validation, unknown unload, and API closure after failed setup.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.5.3 — Extension-owned Tool registration + unload cleanup ← next

### Goal

Allow Extensions to register ordinary `Tool` objects while preserving ToolRegistry semantics and registration ownership.

### Add/update

```text
src/extensions/api.ts
src/extensions/host.ts
src/extensions/registrations.ts
src/extensions/tool-registrations.ts
src/core/tool-registry.ts only through a generic removable-registration seam

tests/extension-tools.test.ts
```

### Required flow

```text
Extension.setup(api)
      ↓
api.registerTool(tool)
      ↓
owned Tool registration
      ↓
ordinary ToolRegistry
      ↓
LLM sees ordinary Tool
```

### Must prove

- extension Tools use the same Tool contract as built-ins;
- no separate ExtensionTool executor exists;
- tool-name collision fails explicitly;
- failed setup rolls back both hook and Tool registrations;
- unload removes only Tools owned by the target Extension;
- other built-in/Extension Tools remain registered;
- duplicate/replacement shortcuts are not introduced;
- no Agent integration yet.

---

## v0.5.4 — `before_tool` gate/replace integration

Integrate HookPipeline into the ordinary tool execution path. Only arguments may be replaced; blocked calls become explicit error ToolResults and the actual tool must not execute.

---

## v0.5.5 — Model/run hooks + budgeted context contributions

Integrate `before_run`, `before_model`, `after_model`, `after_tool`, `after_turn`, and `after_run`. Extension model context must enter as `ContextSupplement[]` before ContextRuntime budgeting.

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
- [ ] extension Tool registration
- [ ] Tool unload cleanup
- [ ] before_tool Agent/runtime integration
- [ ] budgeted before_model contributions
- [ ] remaining run/model/tool hooks
- [ ] failure/cancellation cleanup semantics
- [ ] extension lifecycle observability
- [ ] deterministic Agent integration tests
- [ ] educational example
- [ ] package/runtime/docs finalized as `0.5.0`

Only then freeze `v0.5`.
