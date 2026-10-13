# Changelog

## v0.4.2

- Added `SkillDescriptor`, `SkillDiscoveryContext`, and `SkillSource` discovery contracts.
- Added project-local `ProjectSkillSource` for `<cwd>/.mini-pi/skills/*/SKILL.md`.
- Discovery is one package-directory level deep, returns descriptor metadata only, ignores unrelated/nested resources, and treats a missing Skill root as an empty catalog.
- Added cancellation checks around project discovery and propagated invalid top-level manifests through the existing typed parser error.
- Added deterministic `SkillRegistry` with `trim + lowercase` name normalization, case-insensitive lookup, and stable normalized-name ordering.
- Added `DuplicateSkillError` with both conflicting manifest paths instead of silently choosing a winner.
- Registry construction, `list()`, and `get()` clone descriptors and metadata so external mutation cannot change internal catalog state.
- Added discovery tests for missing roots, deterministic one-level discovery, ignored nested resources, malformed manifests, and cancellation.
- Added registry tests for ordering, normalized lookup, duplicate rejection, clone semantics, and empty catalogs.
- Strict TypeScript source-subset checking and discovery/registry runtime smoke passed; the full repository Vitest suite is not claimed as run in the current execution environment.

## v0.4.1

- Added the first Skills data contracts: `SkillManifest` and `ParsedSkillDocument`.
- Added pure, dependency-free `parseSkillDocument()` for the educational `SKILL.md` frontmatter subset.
- Required opening/closing frontmatter delimiters, non-empty `name`, non-empty `description`, and a non-empty Markdown instructions body.
- Preserved unknown top-level scalar frontmatter as `manifest.metadata`.
- Added support for UTF-8 BOM, CRLF/CR normalization, comments, blank lines, and single/double-quoted scalar values.
- Rejected duplicate keys, malformed entries, nested/indented YAML, arrays/objects, and block scalars rather than silently approximating full YAML semantics.
- Added `SkillError` and `InvalidSkillManifestError`, including line provenance when available.
- Exported the Skills manifest API through `src/skills/index.ts` and the package root.
- Added deterministic parser tests covering valid manifests, metadata, quoting, malformed documents, duplicates, unsupported YAML shapes, and side-effect-free repeatability.
- Strict TypeScript source-subset checking and parser runtime smoke passed; the full repository Vitest suite is not claimed as run in the current execution environment.

## v0.3.7

- Added `ContextRuntime` as the summary-aware orchestration layer between context mechanisms and `AgentLoop`.
- Rendered stored summary checkpoints as explicit model-only system context instead of inserting fake durable conversation messages.
- Planned only the durable-history tail after the latest checkpoint coverage boundary.
- Added iterative re-planning: when the planner omits older unsummarized units, advance `ProgressiveSummaryPolicy`, then prepare again until stable or `maxSummaryPasses` is exceeded.
- Added `AgentOptions.context` for configuring planner, budget, SummaryStore, progressive summary policy, and runtime limits.
- Kept legacy `ContextTransform` behavior available when the v0.3 runtime is not configured; `context` and `contextTransform` are mutually exclusive.
- Integrated prepared context only at the LLM request boundary while preserving `state.messages` and SessionStore as full durable history.
- Added `context_prepare_start`, `context_summary_advanced`, and `context_prepared` lifecycle events.
- Added `tests/agent-context-integration.test.ts` proving summary + recent provider context can be smaller than durable history without deleting history.
- Added `examples/07-context-compaction.ts` and `npm run demo:context`.
- Finalized package/runtime version as `0.3.0` and updated README/version documentation.
- Strict TypeScript integration-subset checking and runtime smoke passed; the full repository Vitest suite is not claimed as run because dependency/network resolution was unavailable.

## v0.3.6

- Added `ContextSummarizer` and `ContextSummarizerInput/Result` contracts.
- Added deterministic offline `DeterministicContextSummarizer` for network-independent mechanism testing.
- Added `ProgressiveSummaryPolicy` that advances checkpoints from the previous coverage boundary using only newly covered durable history.
- Required checkpoint coverage boundaries to align with the end of complete `ContextUnit`s, preventing summaries from cutting through tool exchanges.
- Added explicit no-op behavior for same-boundary advancement.
- Added failure-atomic commit ordering so summarizer failure or cancellation before `SummaryStore.put()` leaves the previous checkpoint unchanged.
- Added `InvalidSummaryCoverageBoundaryError` and `SummaryGenerationError`.
- Added tests for first checkpoint creation, incremental advancement, no-op, coverage regression, tool-exchange boundaries, failure atomicity, durable-history immutability, Unicode-safe deterministic summarization, and cancellation before commit.

## v0.3.5

- Added explicit `ContextSummary` checkpoint artifacts with stable identity, content, prefix coverage, estimated tokens, and creation time.
- Defined `coversThroughMessageIndex=N` to mean the summary covers durable history prefix `[0..N]`.
- Added `SummaryStore` and deterministic `InMemorySummaryStore` reference implementation.
- Kept summary checkpoints separate from durable `AgentMessage[]` history and SessionStore semantics.
- Added clone-on-read/write behavior to avoid accidental shared-reference mutation.
- Added monotonic coverage enforcement with `SummaryCoverageRegressionError` while allowing same-boundary regeneration/retry.
- Added `InvalidContextSummaryError` and validation helpers.
- Added tests for checkpoint validation, prefix coverage, copy semantics, forward coverage, same-boundary replacement, clear, and regression rejection.

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

## v0.3.3

- Added `ToolResultReducer` and deterministic `HeadTailToolResultReducer`.
- Added explicit model-context reduction metadata: original, kept-head, kept-tail, visible, and omitted character counts.
- Added validated reduction options with `InvalidToolResultReductionOptionsError`.
- Preserved `toolCallId`, `toolName`, `isError`, and timestamp identity in model-visible copies.
- Counted and sliced content by Unicode code point to avoid breaking surrogate pairs.
- Kept durable `ToolResultMessage` content immutable; reduction only produces a model-visible projection.
- Added tests for small results, large results, error results, Unicode safety, determinism, and invalid options.

## v0.3.2

- Added `ContextUnit` modeling for user, assistant, and tool-exchange history.
- Added `buildContextUnits()` and `flattenContextUnits()`.
- Grouped assistant tool calls with their matching tool results as one causal context unit.
- Added explicit support for trailing in-progress tool exchanges with `complete=false` and `missingToolCallIds`.
- Added `InvalidContextHistoryError` for orphan, duplicate, mismatched, or interleaved tool history.
- Added tests for causal atomicity and invalid-history failure cases.

## v0.3.1

- Added explicit `ContextBudget` and resolved input-budget calculation.
- Added deterministic `ApproximateTokenEstimator` and prepared-input estimation.
- Added context budget validation and dedicated budget overflow errors.
- Added unit tests for budget and token-estimation invariants.

## v0.1.0

- Initial educational Pi-style Agent Runtime baseline.
- Provider-neutral message and tool contracts.
- Core Agent Loop with tool-result feedback.
- Event bus, cancellation, steering and follow-up queues.
- JSONL sessions and context-transform seam.
- Rooted file tools and opt-in shell tool.
