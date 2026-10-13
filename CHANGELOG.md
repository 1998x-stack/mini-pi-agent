# Changelog

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
- Strict TypeScript integration-subset checking and progressive-Skills runtime smoke passed; the full repository Vitest suite is not claimed as run in the current execution environment.

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

## v0.4.5

- Added run-scoped `ActiveSkillStore` and reference `InMemoryActiveSkillStore` with normalized-name identity, deterministic listing, clone-on-read/write semantics, and explicit `clear()`.
- Added shared `SkillActivationService` for model-driven and manual activation paths.
- Added ordinary `LoadSkillTool` with strict `{ name: string }` schema and compact acknowledgements that never contain full instructions.

## v0.4.4

- Added generic `ContextSupplement` model-only context material with deterministic validation/rendering.
- Added compact Skill catalog and active Skill supplement producers.
- Updated `ContextRuntime` to render supplements before ContextPlanner budgeting.
- Kept supplements and summary checkpoints out of durable AgentMessage history.

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
- Provider-neutral message and tool contracts.
- Core Agent Loop with tool-result feedback.
- Event bus, cancellation, steering and follow-up queues.
- JSONL sessions and context-transform seam.
- Rooted file tools and opt-in shell tool.
