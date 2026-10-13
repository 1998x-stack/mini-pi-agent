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
```

## v0.5.1 — Hook contracts + deterministic HookPipeline ✅

Implemented typed lifecycle contracts, deterministic sequential HookPipeline execution, explicit `before_tool` continue/replace/block semantics, constrained `after_tool` transformation, context-contribution results, cancellation propagation, mutation isolation, `Disposable` hook registrations, and `ExtensionHookError` provenance.

---

## v0.5.2 — ExtensionDefinition + scoped ExtensionAPI + ExtensionHost ✅

Implemented normalized Extension identity, setup-scoped capability access, serialized async setup order, owned registrations, transaction-like setup rollback, reverse-order disposal, and exact hook cleanup on unload.

---

## v0.5.3 — Extension-owned Tool registration + unload cleanup ✅

### Implemented

```text
src/core/errors.ts
src/core/tool-registry.ts
src/extensions/api.ts
src/extensions/host.ts
src/extensions/tool-registrations.ts
src/index.ts

tests/extension-tools.test.ts
```

### Public setup capability

`ExtensionAPI` now exposes:

```ts
interface ExtensionAPI {
  readonly extensionName: string;

  on<K extends HookName>(
    hook: K,
    handler: HookHandler<K>
  ): Disposable;

  registerTool(tool: Tool): Disposable;
}
```

`registerTool()` is setup-scoped exactly like `on()`. Retaining the API and trying to register a Tool after setup closes fails through `ExtensionApiClosedError`.

### Ordinary Tool path

Extension Tools use the existing runtime Tool contract and registry:

```text
Extension.setup(api)
      ↓
api.registerTool(tool)
      ↓
ToolRegistry.register(tool)
      ↓
ToolRegistry.get / validate
      ↓
Tool.execute
```

There is no `ExtensionToolExecutor` and no second execution protocol.

### Generic removable Tool registration

`ToolRegistry.register()` now returns an idempotent `ToolRegistration` handle while remaining source-compatible with callers that ignore the return value.

```ts
interface ToolRegistration {
  dispose(): void;
}
```

Disposal is identity-safe:

```text
register Tool A under name X
      ↓
replace X with Tool B
      ↓
dispose old registration A
      ↓
Tool B remains
```

This prevents an old Extension registration handle from deleting a later replacement that it does not own.

Duplicate names now fail through the core typed `ToolAlreadyRegisteredError` rather than a generic Error.

### Ownership / rollback / unload

Tool registrations enter the same `ExtensionRegistrationSet` as hook registrations.

Therefore setup remains atomic across mixed registrations:

```text
register hook A
register tool B
register hook C
setup throws
      ↓
dispose C
remove B
.dispose A
      ↓
no loaded Extension record
```

Likewise:

```text
Extension Alpha → alpha_tool + Alpha hooks
Extension Beta  → beta_tool  + Beta hooks
built-in Tool   → builtin

unload(Alpha)
→ alpha_tool removed
→ Alpha hooks removed
→ beta_tool remains
→ Beta hooks remain
→ builtin remains
```

Host accepts an optional shared `ToolRegistry`. If omitted it creates a private registry so existing hook-only v0.5.2 callers remain valid. Agent integration will later pass the Agent's ordinary ToolRegistry explicitly.

### Collision semantics

If an Extension tries to register a Tool name already owned by a built-in or another Extension:

```text
ToolRegistry.register()
→ ToolAlreadyRegisteredError
→ Extension setup fails
→ previous registrations from that setup roll back
→ ExtensionSetupError.cause preserves ToolAlreadyRegisteredError
```

No replacement shortcut is introduced for Extensions.

### Verification performed

The changed source subset passed TypeScript checking under:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Runtime smoke verified:

```text
Extension Tool executes through ordinary ToolRegistry
built-in collision preserves ToolAlreadyRegisteredError cause
failed setup leaves built-in Tool untouched
unload removes owned Extension Tool
identity-safe old registration does not delete later replacement
```

Focused tests additionally cover ordinary validation/execution, mixed hook+Tool rollback, exact unload cleanup, late setup failure, setup-scoped `registerTool()`, and replacement safety.

The full repository Vitest suite is not claimed as run in the current execution environment.

---

## v0.5.4 — `before_tool` gate/replace Runtime integration ← next

### Goal

Integrate the already-implemented HookPipeline into the ordinary Agent tool execution path without teaching AgentLoop any concrete Extension policy.

### Required flow

```text
Assistant ToolCall
      ↓
ToolRegistry.get(original name)
      ↓
before_tool HookPipeline
      ├── continue
      ├── replace arguments only
      └── block with extension provenance
      ↓
if continue:
ToolRegistry.validate(final args)
      ↓
Tool.execute(final args)

if blocked:
explicit ToolResultMessage
isError = true
actual Tool.execute() is never called
```

### Must prove

- ToolCall `id` and `name` remain unchanged;
- replacement arguments are what validation and execution receive;
- block short-circuits execution;
- blocked calls become durable explicit observations rather than disappearing;
- built-in and Extension Tools pass through the same hook path;
- hook failure/cancellation semantics remain those defined in v0.5.1;
- AgentLoop knows only generic HookPipeline semantics, never Extension names.

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
- [x] extension Tool registration
- [x] Tool unload cleanup
- [x] typed Tool collision semantics
- [x] identity-safe removable Tool registration
- [ ] before_tool Agent/runtime integration
- [ ] budgeted before_model contributions
- [ ] remaining run/model/tool hooks
- [ ] failure/cancellation cleanup semantics
- [ ] extension lifecycle observability
- [ ] deterministic Agent integration tests
- [ ] educational example
- [ ] package/runtime/docs finalized as `0.5.0`

Only then freeze `v0.5`.
