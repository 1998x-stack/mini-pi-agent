import { describe, expect, it } from "vitest";
import {
  HeadTailToolResultReducer,
  InvalidToolResultReductionOptionsError,
  resolveToolResultReductionOptions,
  type ToolResultMessage
} from "../src/index.js";

function toolResult(content: string, isError = false): ToolResultMessage {
  return {
    role: "tool",
    toolCallId: "call_1",
    toolName: "read",
    content,
    isError,
    timestamp: 1
  };
}

describe("HeadTailToolResultReducer", () => {
  it("returns small tool results unchanged as a model-visible copy", () => {
    const source = toolResult("small result");
    const before = JSON.stringify(source);
    const reducer = new HeadTailToolResultReducer({
      thresholdChars: 100,
      headChars: 20,
      tailChars: 20
    });

    const result = reducer.reduce(source);

    expect(result.reduced).toBe(false);
    expect(result.message).toEqual(source);
    expect(result.message).not.toBe(source);
    expect(result.originalChars).toBe(12);
    expect(result.visibleChars).toBe(12);
    expect(result.omittedChars).toBe(0);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("reduces large results with explicit head/tail provenance", () => {
    const source = toolResult("A".repeat(12_000) + "M".repeat(12_000) + "Z".repeat(12_000));
    const before = source.content;
    const reducer = new HeadTailToolResultReducer();

    const result = reducer.reduce(source);

    expect(result.reduced).toBe(true);
    expect(result.originalChars).toBe(36_000);
    expect(result.keptHeadChars).toBe(8_000);
    expect(result.keptTailChars).toBe(8_000);
    expect(result.omittedChars).toBe(20_000);
    expect(result.visibleChars).toBeLessThan(result.originalChars);
    expect(result.message.toolCallId).toBe(source.toolCallId);
    expect(result.message.toolName).toBe(source.toolName);
    expect(result.message.isError).toBe(source.isError);
    expect(result.message.timestamp).toBe(source.timestamp);
    expect(result.message.content).toContain("original_chars=36000");
    expect(result.message.content).toContain("omitted_chars=20000");
    expect(result.message.content).toContain("A".repeat(100));
    expect(result.message.content).toContain("Z".repeat(100));
    expect(result.message.content).not.toContain("M".repeat(1000));
    expect(source.content).toBe(before);
  });

  it("preserves error-result identity while reducing only visible content", () => {
    const source = toolResult("E".repeat(30_000), true);
    const reducer = new HeadTailToolResultReducer();

    const result = reducer.reduce(source);

    expect(result.reduced).toBe(true);
    expect(result.message.isError).toBe(true);
    expect(result.message.toolCallId).toBe("call_1");
    expect(result.message.toolName).toBe("read");
  });

  it("counts and slices Unicode by code point instead of UTF-16 code unit", () => {
    const source = toolResult("😀".repeat(1_000));
    const reducer = new HeadTailToolResultReducer({
      thresholdChars: 200,
      headChars: 20,
      tailChars: 20
    });

    const result = reducer.reduce(source);

    expect(result.reduced).toBe(true);
    expect(result.originalChars).toBe(1_000);
    expect(result.keptHeadChars).toBe(20);
    expect(result.keptTailChars).toBe(20);
    expect(result.omittedChars).toBe(960);
    expect(result.message.content).toContain("😀".repeat(20));
    expect(result.message.content).not.toContain("�");
  });

  it("is deterministic for the same message and options", () => {
    const source = toolResult("x".repeat(30_000));
    const reducer = new HeadTailToolResultReducer();

    expect(reducer.reduce(source)).toEqual(reducer.reduce(source));
  });

  it("does not claim reduction when provenance overhead would make content larger", () => {
    const source = toolResult("x".repeat(50));
    const reducer = new HeadTailToolResultReducer({
      thresholdChars: 20,
      headChars: 4,
      tailChars: 4
    });

    const result = reducer.reduce(source);

    expect(result.reduced).toBe(false);
    expect(result.message.content).toBe(source.content);
  });

  it("rejects invalid reduction options", () => {
    expect(() => new HeadTailToolResultReducer({ thresholdChars: 0 })).toThrow(
      InvalidToolResultReductionOptionsError
    );
    expect(() => new HeadTailToolResultReducer({ headChars: -1 })).toThrow(
      InvalidToolResultReductionOptionsError
    );
    expect(() =>
      resolveToolResultReductionOptions({
        thresholdChars: 100,
        headChars: 60,
        tailChars: 40
      })
    ).toThrow(InvalidToolResultReductionOptionsError);
  });
});
