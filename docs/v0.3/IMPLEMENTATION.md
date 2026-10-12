# v0.3 Implementation Plan

This file turns the architecture into an incremental implementation sequence. Each stage must remain independently understandable and testable.

---

# 1. Implementation philosophy

The branch must progress in this order:

```text
contract
  ↓
small mechanism
  ↓
unit tests
  ↓
error paths
  ↓
integration
  ↓
documentation
```

Do not implement summarization first. The reader should understand budgeting and semantic grouping before introducing model-assisted compaction.

---

# 2. Target source tree

```text
src/context/
├── types.ts
├── budget.ts
├── estimator.ts
├── units.ts
├── errors.ts
├── planner.ts
├── tool-result-reducer.ts
├── summary.ts
├── summary-store.ts
├── summarizer.ts
└── policies/
    ├── full-context.ts
    ├── keep-recent.ts
    └── progressive-summary.ts
```

Potential compatibility glue:

```text
src/core/context.ts
```

should become either:

- a re-export/adapter layer; or
- a deprecated compatibility file removed after callers migrate.

It must not absorb the new subsystem.

---

# 3. Stage v0.3.1 — Budget + deterministic estimator

## Goal

Make model context a measurable finite resource.

## Add

```text
src/context/types.ts
src/context/budget.ts
src/context/estimator.ts
src/context/errors.ts
```

## Contracts

```ts
ContextBudget
TokenEstimator
ApproximateTokenEstimator
InvalidContextBudgetError
```

## Reference behavior

`ApproximateTokenEstimator` should be deterministic and simple enough to explain. A reasonable educational baseline is:

```text
text token estimate ~= ceil(text.length / 4)
+
fixed structural overhead per message/tool call
```

Exact constants must be documented and tested.

## Tests

```text
tests/context-budget.test.ts
tests/token-estimator.test.ts
```

Must cover:

- valid budget arithmetic;
- zero/negative invalid fields;
- reserve + margin >= window;
- deterministic repeated estimates;
- larger content never estimates fewer tokens than a strict prefix under the same estimator.

## Do not add yet

- message grouping;
- tool-result reduction;
- summaries;
- Agent integration.

---

# 4. Stage v0.3.2 — Semantic ContextUnitBuilder

## Goal

Make compaction operate on meaningful conversation units.

## Add

```text
src/context/units.ts
```

## Concepts

```ts
ContextUnit
UserUnit
AssistantTextUnit
ToolExchangeUnit
ContextUnitBuilder
```

## Rules

A tool exchange groups:

```text
assistant message containing tool calls
+
all matching tool results
```

Required validations:

- duplicate tool call IDs rejected;
- orphan tool results detected;
- unexpected result IDs detected;
- deterministic result ordering;
- incomplete current exchange represented deliberately if supported.

## Tests

```text
tests/context-units.test.ts
```

Include at least:

```text
user -> assistant text
user -> assistant tool call -> result
assistant with two calls -> two results
orphan result
missing result
duplicate result id
interleaved invalid sequence
```

## Architectural checkpoint

At the end of v0.3.2, it should be possible to explain why:

```text
message array position != semantic context boundary
```

---

# 5. Stage v0.3.3 — ToolResultReducer

## Goal

Separate durable observation from model-visible observation.

## Add

```text
src/context/tool-result-reducer.ts
```

## Reference API

```ts
interface ToolResultReducer {
  reduce(
    message: ToolResultMessage,
    options: ToolResultReductionOptions
  ): ToolResultMessage;
}
```

Prefer synchronous deterministic reduction for the reference implementation.

## Reference policy

```text
if estimate <= threshold:
  return clone/unchanged semantic content
else:
  preserve explicit metadata
  preserve head
  insert omission marker
  preserve tail
```

## Important invariant

```text
input message object/content remains unchanged
```

## Tests

```text
tests/tool-result-reducer.test.ts
```

Cover:

- small output unchanged;
- large output reduced;
- marker contains original size;
- head preserved;
- tail preserved;
- no in-place mutation;
- error tool result remains error after reduction.

---

# 6. Stage v0.3.4 — PreparedContext + deterministic planner

## Goal

Introduce the first real `ContextPlanner` without summaries.

## Add

```text
src/context/planner.ts
src/context/policies/full-context.ts
src/context/policies/keep-recent.ts
```

## First planner behavior

```text
build units
estimate full context
if fits -> use all
else reduce large tool observations
if fits -> use reduced context
else select newest units that fit
if minimum valid context cannot fit -> typed error
```

## Output

```ts
PreparedContext
ContextProvenance
```

## Tests

```text
tests/context-planner.test.ts
```

Must prove:

- full context returned when under budget;
- newest units retained when over budget;
- tool exchange remains atomic;
- original history remains unchanged;
- provenance reports omitted/reduced content;
- impossible budget throws typed error;
- planner output estimate <= input budget.

## Example

Add:

```text
examples/07-context-budget.ts
```

The example should build synthetic long history and print before/after estimates.

---

# 7. Stage v0.3.5 — Summary artifact + store

## Goal

Represent compaction checkpoints explicitly before using them in planning.

## Add

```text
src/context/summary.ts
src/context/summary-store.ts
```

## Contracts

```ts
ContextSummary
SummaryCursor
SummaryStore
InMemorySummaryStore
```

Optional educational JSONL/file store may be added only after in-memory semantics are clear.

## Tests

```text
tests/summary-store.test.ts
```

Cover:

- save/latest;
- replacement rules if any;
- summary identity;
- coverage cursor;
- serialization round trip if a file implementation is introduced.

---

# 8. Stage v0.3.6 — ContextSummarizer + progressive policy

## Goal

Add incremental checkpoint compaction.

## Add

```text
src/context/summarizer.ts
src/context/policies/progressive-summary.ts
```

## First summarizer

Must be deterministic for tests.

Possible implementation:

```text
DeterministicSummaryBuilder
```

that extracts/joins bounded structured fields from synthetic messages rather than calling a real LLM.

Then optionally add:

```text
ProviderBackedSummarizer
```

as an adapter/example.

## Progressive policy

```text
latest summary + newly old units
        ↓
new summary
        ↓
summary + recent units
```

## Tests

```text
tests/progressive-compaction.test.ts
```

Must prove:

- first summary covers the expected prefix;
- next compaction reuses previous summary;
- coverage moves forward monotonically;
- recent units remain verbatim;
- durable history remains unchanged;
- cancellation interrupts summarizer work;
- summary output still obeys final budget validation.

---

# 9. Stage v0.3.7 — Runtime integration

## Goal

Make the Agent use `PreparedContext` while preserving durable session history.

## Modify

Likely files:

```text
src/core/agent-loop.ts
src/core/agent.ts
src/core/events.ts
src/index.ts
```

Potentially migrate/remove:

```text
src/core/context.ts
```

## Loop integration

Conceptually:

```ts
const prepared = await deps.contextPlanner.prepare(...);
const assistant = await deps.provider.complete({
  systemPrompt: prepared.systemPrompt,
  messages: prepared.messages,
  tools,
  signal
});
```

Session append behavior remains based on true runtime messages, not prepared copies.

## Events

Add context observability without leaking full context by default.

## Integration tests

```text
tests/agent-context-integration.test.ts
```

Use a capturing fake provider to assert:

```text
provider receives compacted messages
state.messages keeps complete history
session store persists complete history
```

## Example

Add:

```text
examples/08-tool-result-reduction.ts
examples/09-progressive-compaction.ts
```

---

# 10. Public API migration

Before replacing `ContextTransform`, search all usages.

Migration options:

## Option A — compatibility adapter

```ts
class ContextTransformPlannerAdapter implements ContextPlanner
```

Pros:

- less breakage;
- examples continue working.

Cons:

- two concepts coexist temporarily.

## Option B — atomic migration

Replace `ContextTransform` with `ContextPlanner` everywhere.

Pros:

- cleaner architecture.

Cons:

- larger single migration.

Decision criterion:

> choose whichever makes the educational distinction clearer while keeping the implementation reviewable.

Document the choice in `CHANGELOG.md`.

---

# 11. Commit strategy

Recommended commits:

```text
docs(v0.3): define branch architecture and acceptance criteria
feat(context): add context budget and deterministic estimator
test(context): cover budget and estimator invariants
feat(context): build semantic context units
test(context): validate tool exchange atomicity
feat(context): reduce oversized tool observations
feat(context): add deterministic context planner
feat(context): add summary artifacts and store
feat(context): add progressive compaction policy
feat(runtime): prepare model context through ContextPlanner
test(runtime): preserve durable history during compaction
docs(v0.3): finalize examples and learning notes
```

Avoid one giant commit containing the entire subsystem.

---

# 12. Validation gates

After each stage:

```bash
npm run typecheck
npm test
```

Before declaring v0.3 complete:

```bash
npm run check
```

Also run the relevant examples directly.

Do not claim success for commands not actually run.

---

# 13. Freeze criteria

Only freeze `v0.3` when root `version.md` Definition of Done is fully checked and the exact validated implementation is represented in `main` according to repository policy.

At freeze time:

```text
v0.3 = historical learning snapshot
main = same or newer validated integrated state
future work = v0.4
```
