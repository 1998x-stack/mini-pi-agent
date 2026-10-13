import { describe, expect, it } from "vitest";
import {
  InMemorySummaryStore,
  ProgressiveSummaryPolicy,
  createContextSummary,
  type AgentMessage,
  type ContextSummarizer,
  type TokenEstimator
} from "../src/index.js";

class TinyEstimator implements TokenEstimator {
  estimateText(text: string): number {
    return text.length;
  }
  estimateSystem(text: string): number {
    return text.length;
  }
  estimateMessage(message: AgentMessage): number {
    return message.content.length;
  }
  estimateMessages(messages: readonly AgentMessage[]): number {
    return messages.reduce((sum, message) => sum + message.content.length, 0);
  }
}

function history(): AgentMessage[] {
  return [
    { role: "user", content: "m0", timestamp: 1 },
    { role: "assistant", content: "m1", toolCalls: [], timestamp: 2 }
  ];
}

describe("progressive summary cancellation", () => {
  it("propagates cancellation before summarization and preserves the store", async () => {
    const store = new InMemorySummaryStore();
    await store.put(
      createContextSummary({
        id: "stable",
        content: "stable",
        coversThroughMessageIndex: 0,
        estimatedTokens: 6,
        createdAt: 1
      })
    );
    const summarizer: ContextSummarizer = {
      async summarize() {
        throw new Error("should not run");
      }
    };
    const policy = new ProgressiveSummaryPolicy({
      summarizer,
      store,
      estimator: new TinyEstimator()
    });
    const controller = new AbortController();
    const reason = new Error("cancel before summary");
    controller.abort(reason);

    await expect(
      policy.advance({
        history: history(),
        throughMessageIndex: 1,
        signal: controller.signal
      })
    ).rejects.toBe(reason);

    expect(await store.getLatest()).toMatchObject({ id: "stable", coversThroughMessageIndex: 0 });
  });

  it("does not commit when cancellation happens after summarizer work but before store.put", async () => {
    const store = new InMemorySummaryStore();
    await store.put(
      createContextSummary({
        id: "stable",
        content: "stable",
        coversThroughMessageIndex: 0,
        estimatedTokens: 6,
        createdAt: 1
      })
    );
    const controller = new AbortController();
    const reason = new Error("cancel after generation");
    const summarizer: ContextSummarizer = {
      async summarize() {
        controller.abort(reason);
        return { content: "candidate checkpoint" };
      }
    };
    const policy = new ProgressiveSummaryPolicy({
      summarizer,
      store,
      estimator: new TinyEstimator(),
      idFactory: () => "candidate",
      now: () => 2
    });

    await expect(
      policy.advance({
        history: history(),
        throughMessageIndex: 1,
        signal: controller.signal
      })
    ).rejects.toBe(reason);

    expect(await store.getLatest()).toMatchObject({ id: "stable", coversThroughMessageIndex: 0 });
  });
});
