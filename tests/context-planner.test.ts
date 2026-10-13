import { describe, expect, it } from "vitest";
import {
  ContextBudgetExceededError,
  HeadTailToolResultReducer,
  InvalidContextHistoryError,
  KeepRecentContextPlanner,
  type AgentMessage,
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

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe("KeepRecentContextPlanner", () => {
  it("returns all history when it fits without marking compaction", async () => {
    const history: AgentMessage[] = [
      { role: "user", content: "hello", timestamp: 1 },
      { role: "assistant", content: "world", toolCalls: [], timestamp: 2 }
    ];
    const planner = new KeepRecentContextPlanner({ estimator: new ContentTokenEstimator() });

    const prepared = await planner.prepare({
      systemPrompt: "sys",
      history,
      budget: { contextWindow: 20, outputReserve: 0, safetyMargin: 0 },
      signal: signal()
    });

    expect(prepared.messages).toEqual(history);
    expect(prepared.messages[0]).not.toBe(history[0]);
    expect(prepared.estimatedInputTokens).toBe(13);
    expect(prepared.compacted).toBe(false);
    expect(prepared.provenance).toMatchObject({
      sourceMessageCount: 2,
      sourceUnitCount: 2,
      selectedMessageCount: 2,
      selectedUnitCount: 2,
      omittedMessageCount: 0,
      omittedUnitCount: 0,
      selectedStartMessageIndex: 0
    });
  });

  it("selects one contiguous recent suffix instead of skipping an oversized older unit", async () => {
    const history: AgentMessage[] = [
      { role: "user", content: "oldold", timestamp: 1 },
      { role: "user", content: "mid", timestamp: 2 },
      { role: "assistant", content: "new", toolCalls: [], timestamp: 3 }
    ];
    const planner = new KeepRecentContextPlanner({ estimator: new ContentTokenEstimator() });

    const prepared = await planner.prepare({
      systemPrompt: "",
      history,
      budget: { contextWindow: 6, outputReserve: 0, safetyMargin: 0 },
      signal: signal()
    });

    expect(prepared.messages.map((message) => message.content)).toEqual(["mid", "new"]);
    expect(prepared.provenance.selectedStartMessageIndex).toBe(1);
    expect(prepared.provenance.omittedUnitCount).toBe(1);
    expect(prepared.compacted).toBe(true);
  });

  it("keeps a tool exchange atomic when it is the newest selected unit", async () => {
    const history: AgentMessage[] = [
      { role: "user", content: "older", timestamp: 1 },
      {
        role: "assistant",
        content: "a",
        toolCalls: [{ id: "call_1", name: "read", arguments: { path: "a.txt" } }],
        timestamp: 2
      },
      {
        role: "tool",
        toolCallId: "call_1",
        toolName: "read",
        content: "r",
        isError: false,
        timestamp: 3
      }
    ];
    const planner = new KeepRecentContextPlanner({ estimator: new ContentTokenEstimator() });

    const prepared = await planner.prepare({
      systemPrompt: "",
      history,
      budget: { contextWindow: 2, outputReserve: 0, safetyMargin: 0 },
      signal: signal()
    });

    expect(prepared.messages.map((message) => message.role)).toEqual(["assistant", "tool"]);
    expect(prepared.provenance.selectedUnitCount).toBe(1);
    expect(prepared.provenance.selectedMessageCount).toBe(2);
  });

  it("uses the tool-result reducer before budget selection and records provenance", async () => {
    const originalContent = "A".repeat(1_000);
    const history: AgentMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "read", arguments: {} }],
        timestamp: 1
      },
      {
        role: "tool",
        toolCallId: "call_1",
        toolName: "read",
        content: originalContent,
        isError: false,
        timestamp: 2
      }
    ];
    const planner = new KeepRecentContextPlanner({
      estimator: new ContentTokenEstimator(),
      toolResultReducer: new HeadTailToolResultReducer({
        thresholdChars: 200,
        headChars: 20,
        tailChars: 20
      })
    });

    const prepared = await planner.prepare({
      systemPrompt: "",
      history,
      budget: { contextWindow: 400, outputReserve: 0, safetyMargin: 0 },
      signal: signal()
    });

    expect(prepared.messages).toHaveLength(2);
    expect(prepared.messages[1]?.role).toBe("tool");
    expect(prepared.messages[1]?.content).not.toBe(originalContent);
    expect(history[1]?.content).toBe(originalContent);
    expect(prepared.provenance.reducedToolResults).toHaveLength(1);
    expect(prepared.provenance.reducedToolResults[0]).toMatchObject({
      toolCallId: "call_1",
      toolName: "read",
      originalChars: 1_000,
      omittedChars: 960
    });
    expect(prepared.compacted).toBe(true);
  });

  it("fails explicitly when the system prompt alone exceeds the input budget", async () => {
    const planner = new KeepRecentContextPlanner({ estimator: new ContentTokenEstimator() });

    await expect(
      planner.prepare({
        systemPrompt: "1234",
        history: [],
        budget: { contextWindow: 3, outputReserve: 0, safetyMargin: 0 },
        signal: signal()
      })
    ).rejects.toBeInstanceOf(ContextBudgetExceededError);
  });

  it("fails when the newest atomic context unit cannot fit", async () => {
    const planner = new KeepRecentContextPlanner({ estimator: new ContentTokenEstimator() });

    await expect(
      planner.prepare({
        systemPrompt: "",
        history: [{ role: "user", content: "1234", timestamp: 1 }],
        budget: { contextWindow: 3, outputReserve: 0, safetyMargin: 0 },
        signal: signal()
      })
    ).rejects.toBeInstanceOf(ContextBudgetExceededError);
  });

  it("rejects an incomplete trailing tool exchange before model preparation", async () => {
    const planner = new KeepRecentContextPlanner({ estimator: new ContentTokenEstimator() });
    const history: AgentMessage[] = [
      {
        role: "assistant",
        content: "working",
        toolCalls: [{ id: "call_1", name: "read", arguments: {} }],
        timestamp: 1
      }
    ];

    await expect(
      planner.prepare({
        systemPrompt: "",
        history,
        budget: { contextWindow: 100, outputReserve: 0, safetyMargin: 0 },
        signal: signal()
      })
    ).rejects.toBeInstanceOf(InvalidContextHistoryError);
  });

  it("propagates cancellation before doing context work", async () => {
    const controller = new AbortController();
    const reason = new Error("stop context preparation");
    controller.abort(reason);
    const planner = new KeepRecentContextPlanner({ estimator: new ContentTokenEstimator() });

    await expect(
      planner.prepare({
        systemPrompt: "",
        history: [],
        budget: { contextWindow: 100, outputReserve: 0, safetyMargin: 0 },
        signal: controller.signal
      })
    ).rejects.toBe(reason);
  });
});
