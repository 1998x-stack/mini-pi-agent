import { describe, expect, it } from "vitest";
import {
  ApproximateTokenEstimator,
  estimatePreparedInput,
  type AgentMessage
} from "../src/index.js";

describe("ApproximateTokenEstimator", () => {
  it("is deterministic and monotonic for text", () => {
    const estimator = new ApproximateTokenEstimator({ charsPerToken: 4 });

    expect(estimator.estimateText("")).toBe(0);
    expect(estimator.estimateText("abcd")).toBe(1);
    expect(estimator.estimateText("abcdefgh")).toBe(2);
    expect(estimator.estimateText("😀😀😀😀")).toBe(1);
  });

  it("accounts for message framing and tool-call metadata", () => {
    const estimator = new ApproximateTokenEstimator();
    const plain: AgentMessage = {
      role: "assistant",
      content: "I will read the file.",
      toolCalls: [],
      timestamp: 1
    };
    const withTool: AgentMessage = {
      role: "assistant",
      content: plain.content,
      toolCalls: [
        {
          id: "call_1",
          name: "read",
          arguments: { path: "README.md" }
        }
      ],
      timestamp: 1
    };

    expect(estimator.estimateMessage(withTool)).toBeGreaterThan(estimator.estimateMessage(plain));
  });

  it("estimates a full provider input as system plus messages", () => {
    const estimator = new ApproximateTokenEstimator({
      charsPerToken: 4,
      systemOverhead: 4,
      messageOverhead: 4,
      toolCallOverhead: 6
    });
    const messages: AgentMessage[] = [
      { role: "user", content: "abcdefgh", timestamp: 1 },
      {
        role: "tool",
        toolCallId: "call_1",
        toolName: "read",
        content: "content",
        isError: false,
        timestamp: 2
      }
    ];

    expect(estimatePreparedInput(estimator, "system", messages)).toBe(
      estimator.estimateSystem("system") + estimator.estimateMessages(messages)
    );
  });

  it("rejects nonsensical estimator configuration", () => {
    expect(() => new ApproximateTokenEstimator({ charsPerToken: 0 })).toThrow();
    expect(() => new ApproximateTokenEstimator({ messageOverhead: -1 })).toThrow();
  });
});
