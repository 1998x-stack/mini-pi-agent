import type { AgentMessage } from "../core/types.js";
import type { ContextBudget } from "./budget.js";
import { SummaryGenerationError } from "./errors.js";
import type { ContextPlanner } from "./planner.js";
import type {
  ProgressiveSummaryPolicy,
  ProgressiveSummaryResult
} from "./policies/progressive-summary.js";
import type { SummaryStore } from "./summary-store.js";
import { cloneContextSummary, type ContextSummary } from "./summary.js";
import {
  normalizeContextSupplements,
  renderContextSupplements,
  type ContextSupplement
} from "./supplements.js";
import type { PreparedContext } from "./types.js";

export interface ContextRuntimeOptions {
  planner: ContextPlanner;
  budget: ContextBudget;
  summaryStore?: SummaryStore;
  summaryPolicy?: ProgressiveSummaryPolicy;
  maxSummaryPasses?: number;
}

export interface ContextRuntimePrepareInput {
  systemPrompt: string;
  history: readonly AgentMessage[];
  supplements?: readonly ContextSupplement[];
  signal: AbortSignal;
}

export interface SummaryAdvanceProvenance {
  summaryId: string;
  previousCoverage: number | null;
  nextCoverage: number;
  newlyCoveredRange: {
    startMessageIndex: number;
    endMessageIndex: number;
  };
}

export interface ContextRuntimeResult {
  prepared: PreparedContext;
  durableTailStartMessageIndex: number;
  summaryAdvances: SummaryAdvanceProvenance[];
  supplementIds: string[];
  summary?: ContextSummary;
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error("context runtime preparation aborted");
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${value}`);
  }
}

export function renderSummarySystemPrompt(
  baseSystemPrompt: string,
  summary: ContextSummary | undefined
): string {
  if (!summary) return baseSystemPrompt;

  return [
    baseSystemPrompt,
    "",
    "[mini-pi-agent context checkpoint]",
    `summary_id=${summary.id}`,
    `coverage=0..${summary.coversThroughMessageIndex}`,
    `estimated_tokens=${summary.estimatedTokens}`,
    "",
    summary.content,
    "[/mini-pi-agent context checkpoint]"
  ].join("\n");
}

function toAdvanceProvenance(result: ProgressiveSummaryResult): SummaryAdvanceProvenance | undefined {
  if (result.status !== "advanced") return undefined;
  return {
    summaryId: result.summary.id,
    previousCoverage: result.previousCoverage,
    nextCoverage: result.nextCoverage,
    newlyCoveredRange: { ...result.newlyCoveredRange }
  };
}

function withSummaryCompaction(
  prepared: PreparedContext,
  summary: ContextSummary | undefined
): PreparedContext {
  if (!summary || prepared.compacted) return prepared;
  return { ...prepared, compacted: true };
}

/**
 * Orchestrates model-context preparation without owning durable history.
 *
 * Summary checkpoints and generic context supplements are rendered into system
 * material before planner budgeting. The runtime never appends either artifact
 * to durable AgentMessage history.
 */
export class ContextRuntime {
  private readonly planner: ContextPlanner;
  private readonly budget: ContextBudget;
  private readonly summaryStore: SummaryStore | undefined;
  private readonly summaryPolicy: ProgressiveSummaryPolicy | undefined;
  private readonly maxSummaryPasses: number;

  constructor(options: ContextRuntimeOptions) {
    this.planner = options.planner;
    this.budget = { ...options.budget };
    this.summaryStore = options.summaryStore;
    this.summaryPolicy = options.summaryPolicy;
    this.maxSummaryPasses = options.maxSummaryPasses ?? 8;
    assertPositiveInteger("maxSummaryPasses", this.maxSummaryPasses);

    if (this.summaryPolicy && !this.summaryStore) {
      throw new Error("summaryPolicy requires summaryStore so checkpoint coverage can be read");
    }
  }

  async prepare(input: ContextRuntimePrepareInput): Promise<ContextRuntimeResult> {
    throwIfAborted(input.signal);

    const supplements = normalizeContextSupplements(input.supplements ?? []);
    const supplementIds = supplements.map((supplement) => supplement.id);
    let summary = this.summaryStore ? await this.summaryStore.getLatest() : undefined;
    const summaryAdvances: SummaryAdvanceProvenance[] = [];

    for (let pass = 0; pass < this.maxSummaryPasses; pass += 1) {
      throwIfAborted(input.signal);

      const tailStart = (summary?.coversThroughMessageIndex ?? -1) + 1;
      if (tailStart > input.history.length) {
        throw new SummaryGenerationError(
          `summary coverage ends at ${tailStart - 1} but durable history ends at ${input.history.length - 1}`
        );
      }

      const durableTail = input.history.slice(tailStart);
      const summarySystemPrompt = renderSummarySystemPrompt(input.systemPrompt, summary);
      const systemPrompt = renderContextSupplements(summarySystemPrompt, supplements);
      const prepared = await this.planner.prepare({
        systemPrompt,
        history: durableTail,
        budget: this.budget,
        signal: input.signal
      });

      throwIfAborted(input.signal);

      if (!this.summaryPolicy || prepared.provenance.omittedUnitCount === 0) {
        return {
          prepared: withSummaryCompaction(prepared, summary),
          durableTailStartMessageIndex: tailStart,
          summaryAdvances,
          supplementIds,
          ...(summary ? { summary: cloneContextSummary(summary) } : {})
        };
      }

      const selectedStart = prepared.provenance.selectedStartMessageIndex;
      if (selectedStart === null || selectedStart <= 0) {
        throw new SummaryGenerationError(
          "planner omitted context units without exposing a positive selectedStartMessageIndex"
        );
      }

      const targetCoverage = tailStart + selectedStart - 1;
      const advancement = await this.summaryPolicy.advance({
        history: input.history,
        throughMessageIndex: targetCoverage,
        signal: input.signal
      });

      throwIfAborted(input.signal);

      const provenance = toAdvanceProvenance(advancement);
      if (!provenance) {
        throw new SummaryGenerationError(
          `summary policy made no progress toward target coverage=${targetCoverage}`
        );
      }

      summaryAdvances.push(provenance);
      summary = cloneContextSummary(advancement.summary);
    }

    throw new SummaryGenerationError(
      `context runtime exceeded maxSummaryPasses=${this.maxSummaryPasses} while compacting history`
    );
  }
}
