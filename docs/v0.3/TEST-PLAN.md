# v0.3 Test Plan

The purpose of v0.3 tests is to prove architectural behavior, not merely that some shortened prompt is produced.

---

# 1. Test principles

Core tests must be:

- deterministic;
- offline;
- provider-independent;
- explicit about invariants;
- small enough to explain by reading the fixture.

Live-model tests, if added, are examples or optional integration checks, not core correctness gates.

---

# 2. Test matrix

## Budget validation

File:

```text
tests/context-budget.test.ts
```

Cases:

```text
valid budget derives expected input budget
contextWindow <= 0 rejected
negative outputReserve rejected
negative safetyMargin rejected
reserve + margin >= context window rejected
large valid numbers remain stable
```

---

## Token estimation

File:

```text
tests/token-estimator.test.ts
```

Properties:

```text
same input => same estimate
empty text has defined estimate
larger simple text => non-decreasing estimate
message overhead is explicit
assistant tool calls add deterministic overhead
ToolResult contributes based on visible content
```

Do not test against a provider tokenizer unless that estimator is a separate adapter.

---

## Context units

File:

```text
tests/context-units.test.ts
```

Fixtures:

```text
[user]

[user, assistant text]

[user, assistant(tool A), result A]

[user, assistant(tool A, tool B), result A, result B]
```

Failure fixtures:

```text
orphan ToolResult
unknown toolCallId result
duplicate toolCallId
duplicate ToolResult for same id
assistant tool call with missing result when history is expected complete
invalid interleaving
```

Primary assertion:

> unit boundaries preserve the causal model-action-observation relationship.

---

## Tool-result reduction

File:

```text
tests/tool-result-reducer.test.ts
```

Cases:

```text
small result unchanged
large result reduced
head preserved exactly
tail preserved exactly
omission marker visible
marker reports original size
reduced content smaller than source
input object unchanged
isError flag preserved
empty output handled
unicode content handled deterministically
```

---

## Keep-recent planner

File:

```text
tests/context-planner.test.ts
```

Cases:

```text
full history fits -> no compaction
full history too large -> recent units selected
tool-result reduction allows otherwise-too-large unit to fit
oldest eligible units omitted first
newest user request preserved
assistant tool exchange preserved atomically
original history deep-equals pre-plan snapshot
final estimate <= budget
provenance counts match result
```

Error cases:

```text
system prompt alone too large
single mandatory unit too large even after reduction
invalid context history
invalid budget
```

---

## Summary artifacts

File:

```text
tests/context-summary.test.ts
```

Cases:

```text
summary has stable id/coverage
summary coverage references intended source region
estimated token count stored or recomputable
structured summary sections remain bounded
```

---

## Summary store

File:

```text
tests/summary-store.test.ts
```

Cases:

```text
empty store -> undefined latest
save -> latest
multiple summaries -> newest/most advanced according to contract
clear/reset if API supports it
serialization round trip if file-backed store is introduced
```

---

## Progressive compaction

File:

```text
tests/progressive-compaction.test.ts
```

Scenario:

```text
history 0..100
   ↓ compact
summary S1 covers old prefix
recent units remain raw

append history 101..160
   ↓ compact again
S1 + newly-old units
   ↓
summary S2
```

Assertions:

```text
S2 advances coverage
S2 does not regress coverage
recent raw units remain unchanged
previous durable history remains untouched
second compaction can consume S1 rather than rebuilding from all raw history
final prepared context fits budget
```

---

## Cancellation

File:

```text
tests/context-cancellation.test.ts
```

Use a blocking fake summarizer.

Flow:

```text
planner starts summarize
AbortController.abort()
summary promise rejects/aborts according to contract
planner stops
provider is never called
```

Assert no partial summary is committed unless the store contract explicitly supports transactional writes.

---

## Agent integration

File:

```text
tests/agent-context-integration.test.ts
```

Use:

- fake/capturing provider;
- in-memory session store;
- deterministic planner/summarizer;
- synthetic long messages.

Prove simultaneously:

```text
state.messages.length == full history length
session history == full history
provider request messages == compacted context
provider request messages.length < full history length
```

This is the most important end-to-end invariant test in v0.3.

---

# 3. Property-style invariants

Even without a property-testing library, loop through generated deterministic fixtures.

Useful properties:

```text
planning is non-mutating

for fixed input + fixed policy:
PreparedContext is deterministic

final estimate <= input budget
or a typed budget error is returned

visible ToolResult IDs are explainable by a visible tool exchange

advancing summary coverage never moves backward
```

---

# 4. Regression tests for v0.1/v0.2 behavior

Context work must not break existing runtime semantics.

Retain/extend tests proving:

```text
normal short conversation behaves as before
ToolResult still reaches the next model turn
steering/follow-up ordering unchanged
abort still stops the run
session append still records true runtime messages
file-tool safety unchanged
scheduler ordering unchanged when v0.2 is integrated
```

---

# 5. Example validation

Examples should be deterministic where possible.

## `07-context-budget.ts`

Print:

```text
full estimated tokens
input budget
selected estimated tokens
units omitted
compacted yes/no
```

## `08-tool-result-reduction.ts`

Generate a synthetic large log and show:

```text
full durable length
reduced model-visible length
head/tail marker
```

## `09-progressive-compaction.ts`

Run multiple synthetic turns and print:

```text
summary id
covered range
recent raw units
before/after estimates
```

---

# 6. Definition of test completion

Testing is complete only when:

- every new public context contract has direct tests;
- mechanism invariants have dedicated tests;
- important invalid histories fail clearly;
- compaction is proven non-destructive;
- cancellation is proven;
- Agent integration proves provider context differs from durable history;
- all existing relevant tests continue to pass;
- `npm run check` succeeds on the exact final branch state.
