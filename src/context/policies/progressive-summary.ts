import type { AgentMessage } from "../../core/types.js";
import { randomId } from "../../utils/ids.js";
import {
  InvalidSummaryCoverageBoundaryError,
  SummaryCoverageRegressionError,
  SummaryGenerationError
} from "../errors.js";
import type { TokenEstimator } from "../estimator.js";
import type { SummaryStore } from "../summary-store.js";
import {
  cloneContextSummary,
  createContextSummary,
  type ContextSummary
} from "../summary.js";
import type { ContextSummarizer } from "../summarizer.js";
import { buildContextUnits, type ContextUnit } from "../units.js";

export interface ProgressiveSummaryPolicyOptions {
  summarizer: ContextSummarizer;
  store: SummaryStore;
  estimator: TokenEstimator;
  idFactory?: () => string;
  now?: () => number;
}

export interface AdvanceSummaryInput {
  history: readonly AgentMessage[];
  throughMessageIndex: number;
  signal: AbortSignal;
}

export type ProgressiveSummaryResult =
  | {
      status: "unchanged";
      summary: ContextSummary;
      previousCoverage: number;
      nextCoverage: number;
      newlyCoveredRange: null;
    }
  | {
      status: "advanced";
      summary: ContextSummary;
      previousCoverage: number | null;
      nextCoverage: number;
      newlyCoveredRange: {
        startMessageIndex: number;
        endMessageIndex: number;
      };
    };

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error("progressive summary aborted");
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidSummaryCoverageBoundaryError(
      `${name} must be a non-negative integer, got ${value}`
    );
  }
}

function findContainingUnit(units: readonly ContextUnit[], messageIndex: number): ContextUnit | undefined {
  return units.find(
    (unit) => unit.startIndex <= messageIndex && messageIndex <= unit.endIndex
  );
}

function assertCompleteUnitBoundary(
  units: readonly ContextUnit[],
  messageIndex: number,
  label: string
): void {
  const unit = findContainingUnit(units, messageIndex);
  if (!unit) {
    throw new InvalidSummaryCoverageBoundaryError(
      `${label}=${messageIndex} does not map to durable context history`
    );
  }

  if (unit.endIndex !== messageIndex) {
    throw new InvalidSummaryCoverageBoundaryError(
      `${label}=${messageIndex} splits context unit ${unit.startIndex}..${unit.endIndex}`
    );
  }

  if (unit.kind === "tool_exchange" && !unit.complete) {
    throw new InvalidSummaryCoverageBoundaryError(
      `${label}=${messageIndex} points to an incomplete tool exchange`
    );
  }
}

function cloneMessage(message: AgentMessage): AgentMessage {
  if (message.role === "user") return { ...message };
  if (message.role === "tool") return { ...message };
  return {
    ...message,
    toolCalls: message.toolCalls.map((call) => ({
      ...call,
      arguments: structuredClone(call.arguments)
    }))
  };
}

/**
 * Advances one summary checkpoint over a complete durable-history prefix.
 *
 * The policy owns coverage and commit semantics. The summarizer owns only the
 * transformation from previous checkpoint + newly covered messages to content.
 */
export class ProgressiveSummaryPolicy {
  private readonly summarizer: ContextSummarizer;
  private readonly store: SummaryStore;
  private readonly estimator: TokenEstimator;
  private readonly idFactory: () => string;
  private readonly now: () => number;

  constructor(options: ProgressiveSummaryPolicyOptions) {
    this.summarizer = options.summarizer;
    this.store = options.store;
    this.estimator = options.estimator;
    this.idFactory = options.idFactory ?? (() => randomId("summary"));
    this.now = options.now ?? Date.now;
  }

  async advance(input: AdvanceSummaryInput): Promise<ProgressiveSummaryResult> {
    throwIfAborted(input.signal);
    assertNonNegativeInteger("throughMessageIndex", input.throughMessageIndex);

    if (input.history.length === 0) {
      throw new InvalidSummaryCoverageBoundaryError(
        "cannot create a summary checkpoint for empty history"
      );
    }

    if (input.throughMessageIndex >= input.history.length) {
      throw new InvalidSummaryCoverageBoundaryError(
        `throughMessageIndex=${input.throughMessageIndex} exceeds history end=${input.history.length - 1}`
      );
    }

    const units = buildContextUnits(input.history, {
      allowIncompleteFinalToolExchange: true
    });
    assertCompleteUnitBoundary(units, input.throughMessageIndex, "throughMessageIndex");

    const previous = await this.store.getLatest();
    throwIfAborted(input.signal);

    if (previous) {
      if (previous.coversThroughMessageIndex >= input.history.length) {
        throw new InvalidSummaryCoverageBoundaryError(
          `stored summary coverage=${previous.coversThroughMessageIndex} exceeds history end=${input.history.length - 1}`
        );
      }
      assertCompleteUnitBoundary(
        units,
        previous.coversThroughMessageIndex,
        "stored summary coverage"
      );

      if (input.throughMessageIndex < previous.coversThroughMessageIndex) {
        throw new SummaryCoverageRegressionError(
          previous.coversThroughMessageIndex,
          input.throughMessageIndex
        );
      }

      if (input.throughMessageIndex === previous.coversThroughMessageIndex) {
        return {
          status: "unchanged",
          summary: cloneContextSummary(previous),
          previousCoverage: previous.coversThroughMessageIndex,
          nextCoverage: previous.coversThroughMessageIndex,
          newlyCoveredRange: null
        };
      }
    }

    const startMessageIndex = (previous?.coversThroughMessageIndex ?? -1) + 1;
    const endMessageIndex = input.throughMessageIndex;
    const messages = input.history
      .slice(startMessageIndex, endMessageIndex + 1)
      .map(cloneMessage);

    let generatedContent: string;
    try {
      const result = await this.summarizer.summarize({
        ...(previous ? { previousSummary: cloneContextSummary(previous) } : {}),
        messages,
        startMessageIndex,
        endMessageIndex,
        signal: input.signal
      });
      generatedContent = result.content;
    } catch (error) {
      throwIfAborted(input.signal);
      throw new SummaryGenerationError("context summarizer failed", error);
    }

    throwIfAborted(input.signal);

    if (generatedContent.trim().length === 0) {
      throw new SummaryGenerationError("context summarizer returned empty content");
    }

    const summary = createContextSummary({
      id: this.idFactory(),
      content: generatedContent,
      coversThroughMessageIndex: endMessageIndex,
      estimatedTokens: this.estimator.estimateText(generatedContent),
      createdAt: this.now()
    });

    throwIfAborted(input.signal);
    await this.store.put(summary);

    return {
      status: "advanced",
      summary: cloneContextSummary(summary),
      previousCoverage: previous?.coversThroughMessageIndex ?? null,
      nextCoverage: endMessageIndex,
      newlyCoveredRange: {
        startMessageIndex,
        endMessageIndex
      }
    };
  }
}
