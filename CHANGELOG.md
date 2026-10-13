# Changelog

## v0.4.5

- Added run-scoped `ActiveSkillStore` and reference `InMemoryActiveSkillStore` with normalized-name identity, deterministic listing, clone-on-read/write semantics, and explicit `clear()`.
- Added shared `SkillActivationService` for both model-driven and future manual activation paths.
- Activation checks already-active state before loading, so sequential repeated activation does not reload or duplicate active state.
- Added a post-load active-state re-check so near-concurrent completion reports `already-active` if another activation committed while loading.
- Added typed `UnknownSkillError` and `InvalidSkillActivationError`.
- Added ordinary `LoadSkillTool` with strict `{ name: string }` schema and `additionalProperties: false`.
- Kept `load_skill` ToolResults compact: activation acknowledgements contain no full Skill instructions.
- Preserved the progressive-disclosure path: full bodies stay in ActiveSkillStore and become model-visible only through `createLoadedSkillSupplement()` on the next context preparation.
- Added activation tests for normalized idempotency, loader call count, unknown names, cancellation, clone semantics, deterministic ordering, clear, and active-supplement conversion.
- Added `load_skill` tests for schema, compact acknowledgements, no full-body leakage, repeated activation, invalid direct arguments, unknown names, and cancellation.
- Strict TypeScript source-subset compilation and activation runtime smoke passed; the full repository Vitest suite is not claimed as run in the current execution environment.

## v0.4.4

- Added generic `ContextSupplement` model-only context material with deterministic validation/rendering.
- Added `InvalidContextSupplementError` for duplicate ids, invalid ids, unsupported kinds, and empty supplement content.
- Added compact Skill catalog rendering that exposes only descriptor `name` + `description`, never paths, metadata, or full instructions.
- Added `createSkillCatalogSupplement()` and `createLoadedSkillSupplement()` to convert Level-0 catalog data and one selected Level-1 Skill body into context supplements.
- Added deterministic supplement ids through `skillSupplementId()`, keeping safe names readable and using collision-safe UTF-8 hex for other names.
- Updated `ContextRuntimePrepareInput` with optional `supplements` and rendered supplements into system material before `ContextPlanner.prepare()`.
- Kept summary checkpoints and Skill supplements as model-only derived context rather than durable `AgentMessage`s.
- The v0.4.4 reference runtime does not silently drop supplied supplements; supplement-driven budget overflow raises `ContextBudgetExceededError`.
- Added catalog tests for deterministic order, descriptor-only rendering, escaping, empty catalogs, active body supplements, and safe ids.
- Added context-supplement tests for ordering, validation, summary coexistence, durable-history immutability, budget accounting, and explicit overflow.
- Strict TypeScript source-subset checking and context runtime smoke passed; the full repository Vitest suite is not claimed as run in the current execution environment.

## v0.4.3

- Added `LoadedSkill` and `SkillLoader` contracts plus the reference `FilesystemSkillLoader`.
- Added pure descriptor path validation requiring absolute paths, lexical containment, and exact `<root>/SKILL.md` identity.
- Added canonical filesystem validation using `lstat` and `realpath` before reading the selected Skill body.
- Explicitly rejected symlink package roots and symlink manifests with `SkillPathError`.
- Added normalized descriptor/manifest identity validation with `SkillIdentityMismatchError` to catch stale or changed Skills between discovery and load.
- Kept Level-1 loading narrow: only the selected `SKILL.md` is read; `references/`, `scripts/`, and `assets/` are not traversed or executed.
- Cloned the returned descriptor/metadata so loading cannot expose shared mutable descriptor state.
- Added cancellation checks around filesystem phases and preserved the original abort reason.
- Added path and loader tests for lexical escape, nested-manifest rejection, normal loading, identity drift, symlink root/manifest, descriptor immutability, and cancellation.
- Strict TypeScript source-subset compilation and filesystem runtime smoke passed; the full repository Vitest suite is not claimed as run in the current execution environment.

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

- Added `ContextSummarizer` and deterministic offline summarization contracts.
- Added `ProgressiveSummaryPolicy`, atomic checkpoint advancement, boundary validation, and cancellation/failure safety.

## v0.3.5

- Added explicit `ContextSummary` checkpoint artifacts and `SummaryStore` with monotonic coverage semantics.

## v0.3.4

- Added `ContextPlanner`, `PreparedContext`, provenance, budgeted KeepRecent selection, and ToolResult projection integration.

## v0.3.3

- Added `ToolResultReducer` and deterministic Unicode-safe model-only observation reduction.

## v0.3.2

- Added `ContextUnit` modeling and ToolExchange atomicity.

## v0.3.1

- Added explicit `ContextBudget`, deterministic token estimation, and budget overflow errors.

## v0.1.0

- Initial educational Pi-style Agent Runtime baseline.
- Provider-neutral message and tool contracts.
- Core Agent Loop with tool-result feedback.
- Event bus, cancellation, steering and follow-up queues.
- JSONL sessions and context-transform seam.
- Rooted file tools and opt-in shell tool.
