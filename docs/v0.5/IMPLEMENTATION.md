# v0.5 Implementation Plan

Primary invariant:

> Extensions may change runtime behavior only through explicit registrations and named lifecycle hooks.

Secondary invariant:

> AgentLoop must remain extension-name agnostic.

## v0.5.1 — Hook contracts + deterministic HookPipeline ← next

### Goal

Define hook names, typed events/results, handler ownership metadata, deterministic ordering, cancellation, and typed hook failures without integrating Agent yet.

### Add

```text
src/extensions/hooks.ts
src/extensions/errors.ts
src/extensions/pipeline.ts
src/extensions/index.ts

tests/extension-hooks.test.ts
```

### Initial contracts

```ts
type HookName =
  | "before_run"
  | "before_model"
  | "after_model"
  | "before_tool"
  | "after_tool"
  | "after_turn"
  | "after_run";

interface HookContext {
  signal: AbortSignal;
}
```

`before_tool` gets the first real transform/gate result model:

```ts
type BeforeToolDecision =
  | { action: "continue" }
  | { action: "replace"; arguments: Record<string, JsonValue> }
  | { action: "block"; reason: string };
```

### Required semantics

- load/registration order is deterministic;
- handlers execute sequentially;
- transformed tool args flow into the next handler;
- block short-circuits later handlers;
- source HookEvent objects are not mutated;
- abort reason propagates;
- handler errors become `ExtensionHookError` with owner + hook provenance;
- no Agent integration yet.

---

## v0.5.2 — ExtensionDefinition + ExtensionHost + ownership

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
  on(...): Disposable;
}
```

Must prove duplicate normalized extension names fail, setup order is stable, owned registrations are tracked, failed setup is atomic, and unload removes only the target extension's handlers.

---

## v0.5.3 — Extension-owned Tool registration + unload cleanup

### Goal

Allow Extensions to register ordinary Tools while preserving ToolRegistry semantics and registration ownership.

Add `registerTool()` to ExtensionAPI and an owned tool registration adapter.

Must prove:

- extension tools appear as normal LLM tools;
- built-in and extension tools share one ToolRegistry path;
- name collision fails explicitly;
- unload removes only owned tools;
- hook registrations and tool registrations clean up together;
- no tool replacement shortcut.

---

## v0.5.4 — `before_tool` gate/replace integration

### Goal

Integrate the strongest interception hook into the ordinary tool path.

Pipeline:

```text
Assistant ToolCall
      ↓
before_tool
  ├── continue
  ├── replace arguments
  └── block
      ↓
ToolRegistry.validate(final args)
      ↓
Tool.execute
```

Blocked calls become explicit `ToolResultMessage { isError: true }` with extension provenance in the content/trace rather than disappearing.

Must preserve durable ToolCall identity (`id`, `name`) while only allowing argument replacement.

---

## v0.5.5 — Model/run hooks + budgeted context contributions

### Goal

Add remaining stable lifecycle seams while preserving context-budget semantics.

Implement:

```text
before_run
after_model
after_turn
after_run
before_model context contribution
after_tool constrained result transform
```

`before_model` Extension content must become `ContextSupplement[]` before ContextRuntime budgeting.

`after_model` is observational in v0.5; it cannot replace AssistantMessage.

`after_tool` may return a constrained ToolResult replacement for model visibility, with source/durable semantics defined explicitly in tests/docs.

---

## v0.5.6 — Failure + cancellation + cleanup + observability

### Goal

Make extension behavior diagnosable and deterministic under failure.

Add extension lifecycle events/trace metadata such as:

```text
extension_load_start
extension_loaded
extension_unloaded
extension_hook_start
extension_hook_end
extension_hook_error
```

Payloads contain metadata only, not arbitrary tool outputs or prompt bodies by default.

Define strict vs cleanup hook failure policy and ensure `after_run` cleanup attempts continue even when one cleanup handler fails.

---

## v0.5.7 — Agent integration + examples + `0.5.0` freeze

### Goal

Expose `AgentOptions.extensions`, load Extensions as part of Agent composition, prove the full lifecycle end to end, update package/runtime version to `0.5.0`, and freeze the branch.

Add:

```text
tests/agent-extensions-integration.test.ts
examples/10-extension-hooks.ts
README.md updates
package.json / src/version.ts finalization
version.md / CHANGELOG.md finalization
```

Acceptance flow:

```text
Agent.create({ extensions })
      ↓
ExtensionHost setup
      ↓
owned tools + hooks
      ↓
Agent.prompt()
      ↓
hook lifecycle around ordinary runtime
      ↓
extension unload/cleanup where exposed
```

## Final Definition of Done

- [ ] typed hook contracts
- [ ] deterministic HookPipeline
- [ ] ExtensionHookError provenance
- [ ] ExtensionDefinition + scoped ExtensionAPI
- [ ] ExtensionHost + registration ownership
- [ ] unload cleanup
- [ ] extension Tool registration
- [ ] before_tool gate/replace integration
- [ ] budgeted before_model contributions
- [ ] remaining run/model/tool hooks
- [ ] failure/cancellation cleanup semantics
- [ ] extension lifecycle observability
- [ ] deterministic Agent integration tests
- [ ] educational example
- [ ] package/runtime/docs finalized as `0.5.0`

Only then freeze `v0.5`.