import type { AgentMessage } from "../../core/types.js";
import { assertWithinContextBudget, resolveContextBudget } from "../budget.js";
import { ContextBudgetExceededError } from "../errors.js";
import type { TokenEstimator } from "../estimator.js";
import type { ContextPlanner } from "../planner.js";
import {
  HeadTailToolResultReducer,
  type ToolResultReducer,
  type ToolResultReduction
} from "../tool-result-reducer.js";
import type {
  ContextPlannerInput,
  PreparedContext,
  ToolResultReductionProvenance
} from "../types.js";
import { buildContextUnits, type ContextUnit } from "../units.js";

export interface KeepRecentContextPlannerOptions {
  estimator: TokenEstimator;
  toolResultReducer?: ToolResultReducer;
}

interface ProjectedUnit {
  unit: ContextUnit;
  messages: AgentMessage[];
  estimatedTokens: number;
  reductions: ToolResultReductionProvenance[];
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

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error("context preparation aborted");
}

function toReductionProvenance(reduction: ToolResultReduction): ToolResultReductionProvenance {
  return {
    toolCallId: reduction.message.toolCallId,
    toolName: reduction.message.toolName,
    originalChars: reduction.originalChars,
    visibleChars: reduction.visibleChars,
    omittedChars: reduction.omittedChars
  };
}

export class KeepRecentContextPlanner implements ContextPlanner {
  private readonly estimator: TokenEstimator;
  private readonly toolResultReducer: ToolResultReducer;

  constructor(options: KeepRecentContextPlannerOptions) {
    this.estimator = options.estimator;
    this.toolResultReducer = options.toolResultReducer ?? new HeadTailToolResultReducer();
  }

  async prepare(input: ContextPlannerInput): Promise<PreparedContext> {
    throwIfAborted(input.signal);

    const budget = resolveContextBudget(input.budget);
    const systemTokens = this.estimator.estimateSystem(input.systemPrompt);
    if (systemTokens > budget.inputBudget) {
      throw new ContextBudgetExceededError(systemTokens, budget.inputBudget, "system prompt");
    }

    const units = buildContextUnits(input.history, {
      allowIncompleteFinalToolExchange: false
    });
    const selectedNewestFirst: ProjectedUnit[] = [];
    let estimatedInputTokens = systemTokens;

    for (let index = units.length - 1; index >= 0; index -= 1) {
      throwIfAborted(input.signal);
      const unit = units[index];
      if (!unit) continue;

      const projected = this.projectUnit(unit);
      const nextEstimate = estimatedInputTokens + projected.estimatedTokens;

      if (nextEstimate > budget.inputBudget) {
        if (selectedNewestFirst.length === 0) {
          throw new ContextBudgetExceededError(
            nextEstimate,
            budget.inputBudget,
            "system prompt + newest context unit"
          );
        }
        break;
      }

      selectedNewestFirst.push(projected);
      estimatedInputTokens = nextEstimate;
    }

    const selected = selectedNewestFirst.reverse();
    const messages = selected.flatMap((projection) => projection.messages);
    const reductions = selected.flatMap((projection) => projection.reductions);
    const selectedUnitCount = selected.length;
    const selectedMessageCount = messages.length;
    const omittedUnitCount = units.length - selectedUnitCount;
    const omittedMessageCount = input.history.length - selectedMessageCount;
    const selectedStartMessageIndex = selected[0]?.unit.startIndex ?? null;
    const compacted = omittedUnitCount > 0 || reductions.length > 0;

    assertWithinContextBudget(estimatedInputTokens, budget, "prepared context");
    throwIfAborted(input.signal);

    return {
      systemPrompt: input.systemPrompt,
      messages,
      estimatedInputTokens,
      compacted,
      budget,
      provenance: {
        sourceMessageCount: input.history.length,
        sourceUnitCount: units.length,
        selectedMessageCount,
        selectedUnitCount,
        omittedMessageCount,
        omittedUnitCount,
        selectedStartMessageIndex,
        reducedToolResults: reductions
      }
    };
  }

  private projectUnit(unit: ContextUnit): ProjectedUnit {
    const reductions: ToolResultReductionProvenance[] = [];
    const messages = unit.messages.map((message) => {
      if (message.role !== "tool") return cloneMessage(message);
      const reduction = this.toolResultReducer.reduce(message);
      if (reduction.reduced) reductions.push(toReductionProvenance(reduction));
      return reduction.message;
    });

    return {
      unit,
      messages,
      estimatedTokens: this.estimator.estimateMessages(messages),
      reductions
    };
  }
}
