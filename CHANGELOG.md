# Changelog

## v0.3.4

- Added `ContextPlanner`, `ContextPlannerInput`, `PreparedContext`, and structured `ContextProvenance`.
- Added `KeepRecentContextPlanner` as the first budgeted model-context construction policy.
- Composed context units, tool-result reduction, token estimation, and resolved budgets into one deterministic pipeline.
- Selected a chronological contiguous suffix of the newest complete context units; the planner never skips a middle unit merely to pack more history.
- Rejected incomplete trailing tool exchanges before provider-context preparation.
- Failed explicitly when the system prompt or newest atomic unit cannot fit the resolved input budget.
- Added reduction provenance for model-visible ToolResult projections while preserving durable history unchanged.
- Added cancellation checks around context preparation.
- Added tests for full-fit history, suffix selection, tool-exchange atomicity, reducer integration, overflow, incomplete exchange, and cancellation.
- Kept AgentLoop unchanged; planner integration remains for v0.3.7.

## v0.3.3

- Added `ToolResultReducer` and deterministic `HeadTailToolResultReducer`.
- Added explicit model-context reduction metadata: original, kept-head, kept-tail, visible, and omitted character counts.
- Added validated reduction options with `InvalidToolResultReductionOptionsError`.
- Preserved `toolCallId`, `toolName`, `isError`, and timestamp identity in model-visible copies.
- Counted and sliced content by Unicode code point to avoid breaking surrogate pairs.
- Kept durable `ToolResultMessage` content immutable; reduction only produces a model-visible projection.
- Added tests for small results, large results, error results, Unicode safety, determinism, and invalid options.
- Kept AgentLoop unchanged; planner integration remains for v0.3.4+.

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
