# Changelog

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
