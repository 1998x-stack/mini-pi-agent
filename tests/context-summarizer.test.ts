import { describe, expect, it } from "vitest";
import {
  DeterministicContextSummarizer,
  createContextSummary,
  type AgentMessage
} from "../src/index.js";

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe("DeterministicContextSummarizer", () => {
  it("renders a deterministic offline checkpoint input", async () => {
    const summarizer = new DeterministicContextSummarizer({
      maxMessageChars: 20,
      maxPreviousSummaryChars: 30
    });
    const messages: AgentMessage[] = [
      { role: "user", content: "inspect the repository", timestamp: 1 },
      {
        role: "assistant",
        content: "I will inspect it",
        toolCalls: [{ id: "call_1", name: "read", arguments: { path: "README.md" } }],
        timestamp: 2
      },
      {
        role: "tool",
        toolCallId: "call_1",
        toolName: "read",
        content: "README contents",
        isError: false,
        timestamp: 3
      }
    ];

    const input = {
      previousSummary: createContextSummary({
        id: "s1",
        content: "previous checkpoint state",
        coversThroughMessageIndex: 4,
        estimatedTokens: 6,
        createdAt: 10
      }),
      messages,
      startMessageIndex: 5,
      endMessageIndex: 7,
      signal: signal()
    };

    const first = await summarizer.summarize(input);
    const second = await summarizer.summarize(input);

    expect(first).toEqual(second);
    expect(first.content).toContain("previous_checkpoint_id=s1");
    expect(first.content).toContain("previous_coverage=0..4");
    expect(first.content).toContain("new_history_range=5..7");
    expect(first.content).toContain("[5] user");
    expect(first.content).toContain("tool_calls=read#call_1");
    expect(first.content).toContain("tool read#call_1 ok");
  });

  it("bounds long message previews by Unicode code point", async () => {
    const summarizer = new DeterministicContextSummarizer({ maxMessageChars: 4 });
    const result = await summarizer.summarize({
      messages: [{ role: "user", content: "😀😀😀😀😀😀", timestamp: 1 }],
      startMessageIndex: 0,
      endMessageIndex: 0,
      signal: signal()
    });

    expect(result.content).toContain("😀😀😀😀…");
    expect(result.content).not.toContain("�");
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    const reason = new Error("stop summary");
    controller.abort(reason);
    const summarizer = new DeterministicContextSummarizer();

    await expect(
      summarizer.summarize({
        messages: [{ role: "user", content: "hello", timestamp: 1 }],
        startMessageIndex: 0,
        endMessageIndex: 0,
        signal: controller.signal
      })
    ).rejects.toBe(reason);
  });

  it("rejects invalid deterministic summarizer options", () => {
    expect(() => new DeterministicContextSummarizer({ maxMessageChars: 0 })).toThrow();
    expect(() => new DeterministicContextSummarizer({ maxPreviousSummaryChars: -1 })).toThrow();
  });
});
