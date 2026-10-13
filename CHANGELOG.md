# Changelog

## v0.5.2

- Added `ExtensionDefinition`, `LoadedExtension`, normalized extension identity, and clone-safe host descriptors.
- Added setup-scoped `ExtensionAPI` with `on(hook, handler)` only; the capability closes immediately after setup resolves or rejects.
- Added `ExtensionHost` with serialized `load()` / `unload()` operations so async setup completion timing cannot reorder Extensions or hooks.
- Added per-Extension owned registration tracking with reverse-order disposal for setup rollback and unload.
- Added atomic setup semantics: any setup failure removes all registrations created by that setup and does not commit a loaded Extension record.
- Added typed `DuplicateExtensionError`, `UnknownExtensionError`, `InvalidExtensionDefinitionError`, `ExtensionApiClosedError`, and `ExtensionSetupError` with original cause provenance.
- Kept Host implementation details (`ScopedExtensionAPI` and the registration set) out of the package public API.
- Added `tests/extension-host.test.ts` covering deterministic setup order, concurrent load serialization, normalized duplicate rejection, atomic rollback, exact unload cleanup, setup API closure, clone semantics, invalid definitions, and unknown unload.
- Strict TypeScript source-subset checking passed under `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Runtime Host smoke verified failed-setup rollback, closed retained setup API, and exact owned-hook cleanup after unload.
- Full repository Vitest is not claimed as run in the current execution environment.

## v0.5.1

- Added typed Extension hook contracts for `before_run`, `before_model`, `after_model`, `before_tool`, `after_tool`, `after_turn`, and `after_run`.
- Added deterministic sequential `HookPipeline` with registration-order execution and no numeric priority system.
- Added explicit `before_tool` continue/replace/block composition while preserving ToolCall identity and chaining transformed arguments into later handlers.
- Added constrained `after_tool` result transformation and ordered context contributions for `before_run` / `before_model`.
- Isolated handler event mutation by cloning inputs; only explicit return values change pipeline behavior.
- Added idempotent `Disposable` hook registrations.
- Added `ExtensionHookError` with extension/hook/cause provenance and original AbortSignal-reason propagation.
- Added focused hook tests plus strict TypeScript checking and runtime pipeline smoke.

## v0.4.7 / 0.4.0

- Added `SkillRuntime` as the Agent-lifetime Skills composition root for discovery, registry, activation, events, `load_skill`, and active context supplements.
- Added `AgentOptions.skills`; Skills require `AgentOptions.context` so catalog and active bodies are always budget-accounted before provider requests.
- Added a generic `contextSupplements()` seam to `AgentLoop` rather than adding concrete Skill logic to the loop.
- Integrated project Skill discovery at `Agent.create()` and automatic registration of the ordinary `load_skill` Tool.
- Added strict run-scoped activation lifecycle: `ActiveSkillStore` clears before and after every `Agent.prompt()` run.
- Bridged metadata-only Skill lifecycle events into the normal Agent event stream with `runId` and `turn` while keeping `core/events.ts` independent from Skills implementation types.
- Added `tests/agent-skills-integration.test.ts` proving catalog-only first turn, selected Skill activation, next-turn active body visibility, unrelated Skill body non-exposure, compact durable ToolResult, metadata-only events, and cross-prompt active-state clearing.
- Added `examples/09-progressive-skills.ts` and `npm run demo:skills`.
- Finalized `package.json` and `MINI_PI_VERSION` as `0.4.0`.
- Rewrote README and v0.4 architecture/version/implementation docs to describe the implemented frozen snapshot rather than target design.

## v0.4.6

- Added metadata-only Skill lifecycle events and manual activation over the shared activation service.

## v0.4.5

- Added run-scoped ActiveSkillStore, shared activation service, and compact `load_skill` acknowledgements.

## v0.4.4

- Added generic ContextSupplement model-only context material, Skill catalog/body supplements, and budget integration.

## v0.4.3

- Added safe on-demand Skill loading and path/root validation.

## v0.4.2

- Added descriptor-only project discovery and deterministic SkillRegistry semantics.

## v0.4.1

- Added Skills manifest/core types and deterministic `SKILL.md` parser.

## v0.3.7

- Added ContextRuntime, summary-aware AgentLoop integration, and context lifecycle events.

## v0.3.6

- Added ContextSummarizer and ProgressiveSummaryPolicy.

## v0.3.5

- Added ContextSummary checkpoints and SummaryStore.

## v0.3.4

- Added ContextPlanner, PreparedContext, provenance, and KeepRecent selection.

## v0.3.3

- Added deterministic model-only ToolResult reduction.

## v0.3.2

- Added ContextUnit modeling and ToolExchange atomicity.

## v0.3.1

- Added ContextBudget and deterministic token estimation.

## v0.1.0

- Initial educational Pi-style Agent Runtime baseline.
