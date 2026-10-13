# Changelog

## v0.3.2

- Added `ContextUnit` modeling for user, assistant, and tool-exchange history.
- Added `buildContextUnits()` and `flattenContextUnits()`.
- Grouped assistant tool calls with their matching tool results as one causal context unit.
- Added explicit support for trailing in-progress tool exchanges with `complete=false` and `missingToolCallIds`.
- Added `InvalidContextHistoryError` for orphan, duplicate, mismatched, or interleaved tool history.
- Added tests for causal atomicity and invalid-history failure cases.
- Kept AgentLoop unchanged; planner integration remains for later v0.3 stages.

## v0.3.1

- Added explicit `ContextBudget` and resolved input-budget calculation.
- Added deterministic `ApproximateTokenEstimator` and prepared-input estimation.
- Added context budget validation and dedicated budget overflow errors.
- Added unit tests for budget and token-estimation invariants.
- Kept AgentLoop unchanged; context planning integration remains for later v0.3 stages.

## v0.1.0

- Initial educational Pi-style Agent Runtime baseline.
- Provider-neutral message and tool contracts.
- Core Agent Loop with tool-result feedback.
- Event bus, cancellation, steering and follow-up queues.
- JSONL sessions and context-transform seam.
- Rooted file tools and opt-in shell tool.
