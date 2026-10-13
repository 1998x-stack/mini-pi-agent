# v0.5 Test Plan

## 1. Testing philosophy

v0.5 must prove executable runtime customization without requiring a live model/network service.

Use deterministic fake Extensions, Tools, providers, and AbortSignals. The important assertions are ordering, ownership, transformation semantics, cleanup, and preservation of existing v0.3/v0.4 invariants.

## 2. HookPipeline tests

File:

```text
tests/extension-hooks.test.ts
```

Must cover:

```text
no handlers
one handler
multiple extensions
multiple handlers per extension
load-order execution
registration-order execution
source event immutability
AbortSignal propagation
handler throw → ExtensionHookError
```

`before_tool` specific cases:

```text
continue
replace arguments
replace then replace
replace then continue
block
block short-circuits later handlers
block reason preserved
handler sees previous handler's transformed arguments
```

## 3. ExtensionHost tests

File:

```text
tests/extension-host.test.ts
```

Cases:

- load one Extension;
- deterministic list/load order;
- normalized duplicate name rejected;
- setup receives scoped API only;
- setup failure leaves no partial registrations;
- unload exact Extension;
- unload unknown name behavior explicit;
- unload A does not remove B registrations;
- setup cancellation propagates.

## 4. Registration ownership tests

Every hook/tool registration must record owner identity.

Regression pattern:

```text
load A
load B
unload A
run hook/tool registry

→ only B registrations remain
```

Repeated load/unload must not accumulate stale handlers.

## 5. Extension Tool tests

File:

```text
tests/extension-tools.test.ts
```

Must prove:

- Extension-registered Tool is ordinary `Tool`;
- appears in provider tool catalog;
- executes through existing ToolRegistry path;
- duplicate tool name fails explicitly;
- no silent replacement of built-in Tool;
- unload removes owned tool;
- another Extension's tool remains.

## 6. `before_tool` Agent integration tests

File:

```text
tests/extension-before-tool.test.ts
```

Scenarios:

### Continue

```text
LLM ToolCall
→ hook continue
→ Tool executes original args
```

### Replace

```text
LLM ToolCall args A
→ hook replaces with B
→ validation runs on B
→ Tool executes B
→ durable assistant ToolCall identity remains original id/name
```

### Block

```text
LLM ToolCall
→ hook block
→ Tool executor NOT called
→ explicit error ToolResult appended
→ next model turn observes block result
```

## 7. Context contribution tests

Extension-added model text must use `ContextSupplement` before ContextPlanner budgeting.

Must prove:

```text
large extension supplement
→ counted by estimator
→ can produce ContextBudgetExceededError

extension supplement
→ absent from durable AgentMessage history

Skill supplements + Extension supplements + summary
→ deterministic coexistence
```

No post-planner prompt append is allowed.

## 8. `after_tool` tests

If constrained transform is implemented:

- original executor output captured;
- handler receives call + result copy;
- transformed result becomes model-visible according to documented semantics;
- handler cannot mutate earlier history;
- deterministic multiple-handler composition;
- errors get ExtensionHookError provenance.

## 9. Run/model lifecycle tests

Hooks:

```text
before_run
after_model
after_turn
after_run
```

Must prove invocation count/order across:

- single-turn completion;
- multi-turn tool run;
- provider failure;
- tool failure;
- cancellation;
- max-turn failure.

`after_run` receives an explicit status and cleanup is attempted when the run exits in a controlled way.

## 10. Cleanup-failure tests

Observational/cleanup handlers must not prevent later cleanup handlers from running.

Example:

```text
after_run A throws
after_run B records cleanup

→ B still runs
→ A error remains observable
```

Intercepting hook failure, by contrast, fails the active operation visibly.

## 11. Event vs Hook regression tests

- EventBus listener cannot alter hook result;
- HookPipeline does not use EventBus as a mutation channel;
- Extension lifecycle events expose metadata, not prompt/tool bodies by default;
- event listener failure does not rewrite extension execution semantics unless explicitly documented.

## 12. End-to-end acceptance

File:

```text
tests/agent-extensions-integration.test.ts
```

One deterministic run should demonstrate:

```text
Extension A registers Tool
Extension A registers before_tool rewrite
Extension B registers before_tool observer/gate
Extension contributes budgeted context
Agent starts
model emits ToolCall
hooks run in deterministic order
final args execute through ordinary Tool
result feeds next model turn
run/turn cleanup hooks fire
```

Assertions:

- AgentLoop contains no concrete Extension-name branches;
- durable history remains ordinary messages/tool results;
- context contributions are model-only and budgeted;
- registered tools follow ordinary Tool path;
- hook order is deterministic;
- extension errors identify owner + hook;
- cancellation reaches active hooks.

## 13. Verification policy

Each increment must have focused tests plus strict TypeScript checking:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
```

Do not claim full `npm run check` unless it was actually executed on the exact repository state.