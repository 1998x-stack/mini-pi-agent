import { describe, expect, it } from "vitest";
import {
  InvalidContextSummaryError,
  cloneContextSummary,
  createContextSummary,
  summaryCoveredMessageCount,
  summaryCoversMessageIndex,
  type ContextSummary
} from "../src/index.js";

function summary(overrides: Partial<ContextSummary> = {}): ContextSummary {
  return {
    id: "summary-1",
    content: "Goal: finish the context subsystem.",
    coversThroughMessageIndex: 4,
    estimatedTokens: 12,
    createdAt: 1_700_000_000_000,
    ...overrides
  };
}

describe("ContextSummary", () => {
  it("creates an explicit checkpoint artifact with prefix coverage", () => {
    const checkpoint = createContextSummary(summary());

    expect(checkpoint).toEqual(summary());
    expect(summaryCoveredMessageCount(checkpoint)).toBe(5);
    expect(summaryCoversMessageIndex(checkpoint, 0)).toBe(true);
    expect(summaryCoversMessageIndex(checkpoint, 4)).toBe(true);
    expect(summaryCoversMessageIndex(checkpoint, 5)).toBe(false);
  });

  it("clones checkpoint artifacts instead of sharing object identity", () => {
    const checkpoint = createContextSummary(summary());
    const copy = cloneContextSummary(checkpoint);

    expect(copy).toEqual(checkpoint);
    expect(copy).not.toBe(checkpoint);
  });

  it("rejects empty identity or content", () => {
    expect(() => createContextSummary(summary({ id: "   " }))).toThrow(
      InvalidContextSummaryError
    );
    expect(() => createContextSummary(summary({ content: "" }))).toThrow(
      InvalidContextSummaryError
    );
  });

  it("rejects invalid coverage and accounting fields", () => {
    expect(() =>
      createContextSummary(summary({ coversThroughMessageIndex: -1 }))
    ).toThrow(InvalidContextSummaryError);
    expect(() => createContextSummary(summary({ estimatedTokens: -1 }))).toThrow(
      InvalidContextSummaryError
    );
    expect(() => createContextSummary(summary({ createdAt: 1.5 }))).toThrow(
      InvalidContextSummaryError
    );
  });

  it("rejects invalid message-index queries", () => {
    const checkpoint = createContextSummary(summary());
    expect(() => summaryCoversMessageIndex(checkpoint, -1)).toThrow(
      InvalidContextSummaryError
    );
  });
});
