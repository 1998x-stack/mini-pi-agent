import { describe, expect, it } from "vitest";
import {
  InMemorySummaryStore,
  SummaryCoverageRegressionError,
  createContextSummary,
  type ContextSummary
} from "../src/index.js";

function summary(overrides: Partial<ContextSummary> = {}): ContextSummary {
  return createContextSummary({
    id: "summary-1",
    content: "checkpoint",
    coversThroughMessageIndex: 2,
    estimatedTokens: 8,
    createdAt: 100,
    ...overrides
  });
}

describe("InMemorySummaryStore", () => {
  it("starts empty and can be cleared", async () => {
    const store = new InMemorySummaryStore();
    expect(await store.getLatest()).toBeUndefined();

    await store.put(summary());
    expect(await store.getLatest()).toBeDefined();

    await store.clear();
    expect(await store.getLatest()).toBeUndefined();
  });

  it("stores and returns copies instead of shared object references", async () => {
    const store = new InMemorySummaryStore();
    const source = summary();

    await store.put(source);
    const first = await store.getLatest();
    const second = await store.getLatest();

    expect(first).toEqual(source);
    expect(first).not.toBe(source);
    expect(second).toEqual(source);
    expect(second).not.toBe(first);
  });

  it("allows checkpoint coverage to move forward", async () => {
    const store = new InMemorySummaryStore();
    await store.put(summary({ id: "s1", coversThroughMessageIndex: 2 }));
    await store.put(summary({ id: "s2", coversThroughMessageIndex: 8, createdAt: 200 }));

    expect(await store.getLatest()).toMatchObject({
      id: "s2",
      coversThroughMessageIndex: 8
    });
  });

  it("allows replacing a checkpoint at the same coverage boundary", async () => {
    const store = new InMemorySummaryStore();
    await store.put(summary({ id: "s1", coversThroughMessageIndex: 4 }));
    await store.put(
      summary({
        id: "s1-retry",
        content: "regenerated checkpoint",
        coversThroughMessageIndex: 4,
        createdAt: 200
      })
    );

    expect(await store.getLatest()).toMatchObject({
      id: "s1-retry",
      coversThroughMessageIndex: 4
    });
  });

  it("rejects coverage regression and preserves the latest checkpoint", async () => {
    const store = new InMemorySummaryStore();
    await store.put(summary({ id: "newer", coversThroughMessageIndex: 10 }));

    let captured: unknown;
    try {
      await store.put(summary({ id: "older", coversThroughMessageIndex: 7 }));
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(SummaryCoverageRegressionError);
    if (!(captured instanceof SummaryCoverageRegressionError)) {
      throw new Error("expected SummaryCoverageRegressionError");
    }
    expect(captured.previousCoverage).toBe(10);
    expect(captured.nextCoverage).toBe(7);
    expect(await store.getLatest()).toMatchObject({
      id: "newer",
      coversThroughMessageIndex: 10
    });
  });
});
