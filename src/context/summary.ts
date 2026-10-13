import { InvalidContextSummaryError } from "./errors.js";

export interface ContextSummary {
  /** Stable identity for this checkpoint artifact. */
  id: string;
  /** Model-facing summary content. This is not inserted into durable history. */
  content: string;
  /** Inclusive durable-history prefix boundary: this summary covers messages [0..N]. */
  coversThroughMessageIndex: number;
  /** Estimated model tokens for `content`, recorded when the checkpoint is created. */
  estimatedTokens: number;
  /** Unix epoch milliseconds supplied by the caller/runtime. */
  createdAt: number;
}

export type ContextSummaryInput = ContextSummary;

function assertNonEmptyString(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new InvalidContextSummaryError(`${name} must be a non-empty string`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidContextSummaryError(
      `${name} must be a non-negative integer, got ${value}`
    );
  }
}

export function assertValidContextSummary(summary: ContextSummary): void {
  assertNonEmptyString("id", summary.id);
  assertNonEmptyString("content", summary.content);
  assertNonNegativeInteger("coversThroughMessageIndex", summary.coversThroughMessageIndex);
  assertNonNegativeInteger("estimatedTokens", summary.estimatedTokens);
  assertNonNegativeInteger("createdAt", summary.createdAt);
}

export function createContextSummary(input: ContextSummaryInput): ContextSummary {
  assertValidContextSummary(input);
  return { ...input };
}

export function cloneContextSummary(summary: ContextSummary): ContextSummary {
  assertValidContextSummary(summary);
  return { ...summary };
}

export function summaryCoveredMessageCount(summary: ContextSummary): number {
  assertValidContextSummary(summary);
  return summary.coversThroughMessageIndex + 1;
}

export function summaryCoversMessageIndex(
  summary: ContextSummary,
  messageIndex: number
): boolean {
  assertValidContextSummary(summary);
  assertNonNegativeInteger("messageIndex", messageIndex);
  return messageIndex <= summary.coversThroughMessageIndex;
}
