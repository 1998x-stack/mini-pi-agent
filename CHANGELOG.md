# Changelog

## v0.4.6

- Added metadata-only Skill lifecycle events: `skill_activation_start`, `skill_activated`, `skill_activation_reused`, and `skill_activation_failed`.
- Added explicit activation origins: `api`, `manual`, and `tool`.
- Added `SkillEventBus` with listener-failure isolation so telemetry cannot change activation success/failure semantics.
- Extended `SkillActivationService` with optional lifecycle event emission while preserving normalized idempotency and original activation errors.
- Updated `LoadSkillTool` to mark activation origin as `tool`.
- Added `ManualSkillActivator`, a thin facade that reuses the exact same `SkillActivationService` and ActiveSkillStore as model-driven activation.
- Kept event payloads metadata-only; full Skill instructions are never emitted.
- Added tests proving manual and tool activation converge on one store, reused activation does not reload, failure events preserve compact error metadata, and failing listeners do not break activation.
- Added a real resource-boundary test proving activation reads only `SKILL.md`: reference contents are not exposed and scripts are not auto-executed.
- Added `examples/08-skill-manual-activation.ts`.
- Strict TypeScript source-subset checking and lifecycle runtime smoke passed; the full repository Vitest suite is not claimed as run in the current execution environment.

## v0.4.5

- Added run-scoped `ActiveSkillStore` and reference `InMemoryActiveSkillStore` with normalized-name identity, deterministic listing, clone-on-read/write semantics, and explicit `clear()`.
- Added shared `SkillActivationService` for model-driven and manual activation paths.
- Activation checks active state before loading and again after async loading.
- Added typed `UnknownSkillError` and `InvalidSkillActivationError`.
- Added ordinary `LoadSkillTool` with strict `{ name: string }` schema.
- Kept `load_skill` ToolResults compact; full Skill instructions remain in ActiveSkillStore and become model-visible only through context supplements.
- Added activation and `load_skill` tests plus strict source-subset verification.

## v0.4.4

- Added generic `ContextSupplement` model-only context material with deterministic validation/rendering.
- Added compact Skill catalog and active Skill supplement producers.
- Updated `ContextRuntime` to render supplements before ContextPlanner budgeting.
- Kept supplements and summary checkpoints out of durable AgentMessage history.
- Added context-supplement budget/overflow tests.

## v0.4.3

- Added `LoadedSkill`, `SkillLoader`, `FilesystemSkillLoader`, lexical/canonical path validation, symlink rejection, and identity-drift detection.
- Kept Level-1 loading narrow to the selected `SKILL.md` only.

## v0.4.2

- Added descriptor-only project discovery and deterministic `SkillRegistry` semantics.

## v0.4.1

- Added Skills manifest/core types and deterministic `SKILL.md` parser.

## v0.3.7

- Added `ContextRuntime`, summary-aware AgentLoop integration, context lifecycle events, and finalized package/runtime version `0.3.0`.

## v0.3.6

- Added `ContextSummarizer`, deterministic offline summarization, and `ProgressiveSummaryPolicy`.

## v0.3.5

- Added explicit `ContextSummary` checkpoint artifacts and `SummaryStore`.

## v0.3.4

- Added `ContextPlanner`, `PreparedContext`, provenance, and budgeted KeepRecent selection.

## v0.3.3

- Added deterministic model-only ToolResult reduction.

## v0.3.2

- Added ContextUnit modeling and ToolExchange atomicity.

## v0.3.1

- Added ContextBudget and deterministic token estimation.

## v0.1.0

- Initial educational Pi-style Agent Runtime baseline.
