import type { ToolResultMessage } from "../core/types.js";
import { InvalidToolResultReductionOptionsError } from "./errors.js";

export interface ToolResultReductionOptions {
  thresholdChars?: number;
  headChars?: number;
  tailChars?: number;
}

export interface ResolvedToolResultReductionOptions {
  thresholdChars: number;
  headChars: number;
  tailChars: number;
}

export interface ToolResultReduction {
  message: ToolResultMessage;
  reduced: boolean;
  originalChars: number;
  visibleChars: number;
  keptHeadChars: number;
  keptTailChars: number;
  omittedChars: number;
}

export interface ToolResultReducer {
  reduce(message: ToolResultMessage): ToolResultReduction;
}

const DEFAULT_OPTIONS: ResolvedToolResultReductionOptions = {
  thresholdChars: 20_000,
  headChars: 8_000,
  tailChars: 8_000
};

function assertInteger(name: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new InvalidToolResultReductionOptionsError(
      `${name} must be an integer >= ${minimum}, got ${value}`
    );
  }
}

export function resolveToolResultReductionOptions(
  options: ToolResultReductionOptions = {}
): ResolvedToolResultReductionOptions {
  const resolved: ResolvedToolResultReductionOptions = {
    thresholdChars: options.thresholdChars ?? DEFAULT_OPTIONS.thresholdChars,
    headChars: options.headChars ?? DEFAULT_OPTIONS.headChars,
    tailChars: options.tailChars ?? DEFAULT_OPTIONS.tailChars
  };

  assertInteger("thresholdChars", resolved.thresholdChars, 1);
  assertInteger("headChars", resolved.headChars, 0);
  assertInteger("tailChars", resolved.tailChars, 0);

  if (resolved.headChars + resolved.tailChars >= resolved.thresholdChars) {
    throw new InvalidToolResultReductionOptionsError(
      "headChars + tailChars must be smaller than thresholdChars"
    );
  }

  return resolved;
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function unchangedReduction(
  message: ToolResultMessage,
  originalChars: number
): ToolResultReduction {
  return {
    message: { ...message },
    reduced: false,
    originalChars,
    visibleChars: originalChars,
    keptHeadChars: originalChars,
    keptTailChars: 0,
    omittedChars: 0
  };
}

function renderReducedContent(input: {
  message: ToolResultMessage;
  originalChars: number;
  head: string;
  tail: string;
  keptHeadChars: number;
  keptTailChars: number;
  omittedChars: number;
}): string {
  const { message, originalChars, head, tail, keptHeadChars, keptTailChars, omittedChars } = input;
  return [
    "[mini-pi-agent tool result reduced for model context]",
    `tool_call_id=${message.toolCallId}`,
    `tool_name=${message.toolName}`,
    `original_chars=${originalChars}`,
    `kept_head_chars=${keptHeadChars}`,
    `kept_tail_chars=${keptTailChars}`,
    `omitted_chars=${omittedChars}`,
    "",
    "--- head ---",
    head,
    `--- omitted ${omittedChars} chars ---`,
    "--- tail ---",
    tail
  ].join("\n");
}

export class HeadTailToolResultReducer implements ToolResultReducer {
  readonly options: ResolvedToolResultReductionOptions;

  constructor(options: ToolResultReductionOptions = {}) {
    this.options = resolveToolResultReductionOptions(options);
  }

  reduce(message: ToolResultMessage): ToolResultReduction {
    const points = codePoints(message.content);
    const originalChars = points.length;

    if (originalChars <= this.options.thresholdChars) {
      return unchangedReduction(message, originalChars);
    }

    const keptHeadChars = Math.min(this.options.headChars, originalChars);
    const keptTailChars = Math.min(
      this.options.tailChars,
      Math.max(0, originalChars - keptHeadChars)
    );
    const omittedChars = originalChars - keptHeadChars - keptTailChars;
    const head = points.slice(0, keptHeadChars).join("");
    const tail = keptTailChars === 0 ? "" : points.slice(originalChars - keptTailChars).join("");
    const content = renderReducedContent({
      message,
      originalChars,
      head,
      tail,
      keptHeadChars,
      keptTailChars,
      omittedChars
    });
    const visibleChars = codePoints(content).length;

    // A reducer must actually reduce. For unusually small custom thresholds,
    // explicit provenance metadata can be larger than the source content.
    if (visibleChars >= originalChars) {
      return unchangedReduction(message, originalChars);
    }

    return {
      message: { ...message, content },
      reduced: true,
      originalChars,
      visibleChars,
      keptHeadChars,
      keptTailChars,
      omittedChars
    };
  }
}
