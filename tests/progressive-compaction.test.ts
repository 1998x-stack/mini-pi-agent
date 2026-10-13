import { describe, expect, it } from "vitest";
import {
  InMemorySummaryStore,
  InvalidSummaryCoverageBoundaryError,
  ProgressiveSummaryPolicy,
  SummaryCoverageRegressionError,
  SummaryGenerationError,
  createContextSummary,
  type AgentMessage,
  type ContextSummarizer,
  type ContextSummarizerInput,
  type ContextSummarizerResult,
  type TokenEstimator
} from "../src/index.js";

class ContentTokenEstimator implements TokenEstimator {
  estimateText(text: string): number {
    return Array.from(text).length;
  }

  estimateSystem(text: string): number {
    return this.estimateText(text);
  }

  estimateMessage(message: AgentMessage): number {
    return this.estimateText(message.content);
  }

  estimateMessages(messages: readonly AgentMessage[]): number {
    return messages.reduce((total, message) => total + this.estimateMessage(message), 0);
  }
}

class RecordingSummarizer implements ContextSummarizer {
  readonly calls: ContextSummarizerInput[] = [];

  async summarize(input: ContextSummarizerInput): Promise<ContextSummarizerResult> {
    this.calls.push({
      ...input,
      messages: [...input.messages]
    });
    return {
      content: `summary:${input.startMessageIndex}-${input.endMessageIndex}`
    };
  }
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

function makePolicy(input: {
  summarizer: ContextSummarizer;
  store?: InMemorySummaryStore;
  ids?: string[];
}) {
  const store = input.store ?? new InMemorySummaryStore();
  const ids = [...(input.ids ?? ["s1", "s2", "s3"])];
  let now = 100;
  const policy = new ProgressiveSummaryPolicy({
    summarizer: input.summarizer,
    store,
    estimator: new ContentTokenEstimator(),
    idFactory: () => ids.shift() ?? "fallback",
    now: () => now++
  });
  return { policy, store };
}

describe("ProgressiveSummaryPolicy", () => {
  it("creates the first checkpoint over a complete history prefix", async () => {
    const summarizer = new RecordingSummarizer();
    const { policy, store } = makePolicy({ summarizer });
    const history: AgentMessage[] = [
      { role: "user", content: "u0", timestamp: 1 },
      { role: "assistant", content: "a1", toolCalls: [], timestamp: 2 },
      { role: "user", content: "u2", timestamp: 3 }
    ];

    const result = await policy.advance({
      history,
      throughMessageIndex: 1,
      signal: signal()
    });

    expect(result.status).toBe("advanced");
    expect(result.previousCoverage).toBeNull();
    expect(result.nextCoverage).toBe(1);
    expect(result.newlyCoveredRange).toEqual({ startMessageIndex: 0, endMessageIndex: 1 });
    expect(result.summary).toMatchObject({
      id: "s1",
      content: "summary:0-1",
      coversThroughMessageIndex: 1,
      estimatedTokens: 11,
      createdAt: 100
    });
    expect(await store.getLatest()).toEqual(result.summary);
    expect(summarizer.calls[0]?.previousSummary).toBeUndefined();
    expect(summarizer.calls[0]?.messages.map((message) => message.content)).toEqual(["u0", "a1"]);
  });

  it("advances from the previous checkpoint using only newly covered history", async () => {
    const summarizer = new RecordingSummarizer();
    const { policy, store } = makePolicy({ summarizer, ids: ["s1", "s2"] });
    const history: AgentMessage[] = [
      { role: "user", content: "m0", timestamp: 1 },
      { role: "assistant", content: "m1", toolCalls: [], timestamp: 2 },
      { role: "user", content: "m2", timestamp: 3 },
      { role: "assistant", content: "m3", toolCalls: [], timestamp: 4 }
    ];

    await policy.advance({ history, throughMessageIndex: 1, signal: signal() });
    const second = await policy.advance({ history, throughMessageIndex: 3, signal: signal() });

    expect(second.status).toBe("advanced");
    expect(second.previousCoverage).toBe(1);
    expect(second.nextCoverage).toBe(3);
    expect(second.newlyCoveredRange).toEqual({ startMessageIndex: 2, endMessageIndex: 3 });
    expect(summarizer.calls).toHaveLength(2);
    expect(summarizer.calls[1]?.previousSummary).toMatchObject({ id: "s1", coversThroughMessageIndex: 1 });
    expect(summarizer.calls[1]?.messages.map((message) => message.content)).toEqual(["m2", "m3"]);
    expect(await store.getLatest()).toMatchObject({ id: "s2", coversThroughMessageIndex: 3 });
  });

  it("is a no-op when asked to advance to the current checkpoint boundary", async () => {
    const summarizer = new RecordingSummarizer();
    const store = new InMemorySummaryStore();
    await store.put(
      createContextSummary({
        id: "existing",
        content: "checkpoint",
        coversThroughMessageIndex: 1,
        estimatedTokens: 10,
        createdAt: 1
      })
    );
    const { policy } = makePolicy({ summarizer, store });
    const history: AgentMessage[] = [
      { role: "user", content: "m0", timestamp: 1 },
      { role: "assistant", content: "m1", toolCalls: [], timestamp: 2 }
    ];

    const result = await policy.advance({
      history,
      throughMessageIndex: 1,
      signal: signal()
    });

    expect(result.status).toBe("unchanged");
    expect(result.newlyCoveredRange).toBeNull();
    expect(summarizer.calls).toHaveLength(0);
  });

  it("rejects target coverage regression", async () => {
    const summarizer = new RecordingSummarizer();
    const store = new InMemorySummaryStore();
    await store.put(
      createContextSummary({
        id: "existing",
        content: "checkpoint",
        coversThroughMessageIndex: 2,
        estimatedTokens: 10,
        createdAt: 1
      })
    );
    const { policy } = makePolicy({ summarizer, store });
    const history: AgentMessage[] = [
      { role: "user", content: "m0", timestamp: 1 },
      { role: "assistant", content: "m1", toolCalls: [], timestamp: 2 },
      { role: "user", content: "m2", timestamp: 3 }
    ];

    await expect(
      policy.advance({ history, throughMessageIndex: 1, signal: signal() })
    ).rejects.toBeInstanceOf(SummaryCoverageRegressionError);
  });

  it("rejects a checkpoint boundary that splits a tool exchange", async () => {
    const summarizer = new RecordingSummarizer();
    const { policy } = makePolicy({ summarizer });
    const history: AgentMessage[] = [
      {
        role: "assistant",
        content: "working",
        toolCalls: [{ id: "c1", name: "read", arguments: { path: "a" } }],
        timestamp: 1
      },
      {
        role: "tool",
        toolCallId: "c1",
        toolName: "read",
        content: "done",
        isError: false,
        timestamp: 2
      },
      { role: "assistant", content: "finished", toolCalls: [], timestamp: 3 }
    ];

    await expect(
      policy.advance({ history, throughMessageIndex: 0, signal: signal() })
    ).rejects.toBeInstanceOf(InvalidSummaryCoverageBoundaryError);

    expect(summarizer.calls).toHaveLength(0);
  });

  it("rejects an incomplete tool exchange as a checkpoint boundary", async () => {
    const summarizer = new RecordingSummarizer();
    const { policy } = makePolicy({ summarizer });
    const history: AgentMessage[] = [
      {
        role: "assistant",
        content: "working",
        toolCalls: [{ id: "c1", name: "read", arguments: {} }],
        timestamp: 1
      }
    ];

    await expect(
      policy.advance({ history, throughMessageIndex: 0, signal: signal() })
    ).rejects.toBeInstanceOf(InvalidSummaryCoverageBoundaryError);
  });

  it("does not commit a checkpoint when summarization fails", async () => {
    const store = new InMemorySummaryStore();
    await store.put(
      createContextSummary({
        id: "stable",
        content: "stable checkpoint",
        coversThroughMessageIndex: 0,
        estimatedTokens: 4,
        createdAt: 1
      })
    );
    const summarizer: ContextSummarizer = {
      async summarize() {
        throw new Error("provider failed");
      }
    };
    const { policy } = makePolicy({ summarizer, store });
    const history: AgentMessage[] = [
      { role: "user", content: "m0", timestamp: 1 },
      { role: "assistant", content: "m1", toolCalls: [], timestamp: 2 }
    ];

    await expect(
      policy.advance({ history, throughMessageIndex: 1, signal: signal() })
    ).rejects.toBeInstanceOf(SummaryGenerationError);

    expect(await store.getLatest()).toMatchObject({ id: "stable", coversThroughMessageIndex: 0 });
  });

  it("keeps durable history unchanged", async () => {
    const summarizer = new RecordingSummarizer();
    const { policy } = makePolicy({ summarizer });
    const history: AgentMessage[] = [
      {
        role: "assistant",
        content: "call",
        toolCalls: [{ id: "c1", name: "read", arguments: { path: "a.txt" } }],
        timestamp: 1
      },
      {
        role: "tool",
        toolCallId: "c1",
        toolName: "read",
        content: "result",
        isError: false,
        timestamp: 2
      }
    ];
    const before = JSON.stringify(history);

    await policy.advance({ history, throughMessageIndex: 1, signal: signal() });

    expect(JSON.stringify(history)).toBe(before);
    expect(summarizer.calls[0]?.messages).not.toBe(history);
  });
});
