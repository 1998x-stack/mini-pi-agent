import { describe, expect, it } from "vitest";
import {
  InvalidContextHistoryError,
  buildContextUnits,
  flattenContextUnits,
  type AgentMessage,
  type AssistantMessage,
  type ToolResultMessage,
  type UserMessage
} from "../src/index.js";

function user(content: string, timestamp: number): UserMessage {
  return { role: "user", content, timestamp };
}

function assistant(
  content: string,
  timestamp: number,
  toolCalls: AssistantMessage["toolCalls"] = []
): AssistantMessage {
  return { role: "assistant", content, toolCalls, timestamp };
}

function toolResult(
  toolCallId: string,
  toolName: string,
  content: string,
  timestamp: number
): ToolResultMessage {
  return {
    role: "tool",
    toolCallId,
    toolName,
    content,
    isError: false,
    timestamp
  };
}

describe("buildContextUnits", () => {
  it("keeps ordinary user and assistant messages as independent units", () => {
    const history: AgentMessage[] = [user("hello", 1), assistant("hi", 2)];

    const units = buildContextUnits(history);

    expect(units.map((unit) => unit.kind)).toEqual(["user", "assistant"]);
    expect(flattenContextUnits(units)).toEqual(history);
  });

  it("groups an assistant tool-call message with all matching results", () => {
    const history: AgentMessage[] = [
      user("inspect", 1),
      assistant("I will inspect two files", 2, [
        { id: "call_a", name: "read", arguments: { path: "a.txt" } },
        { id: "call_b", name: "read", arguments: { path: "b.txt" } }
      ]),
      toolResult("call_b", "read", "B", 3),
      toolResult("call_a", "read", "A", 4),
      assistant("done", 5)
    ];

    const units = buildContextUnits(history);
    const exchange = units[1];

    expect(exchange?.kind).toBe("tool_exchange");
    if (exchange?.kind !== "tool_exchange") throw new Error("expected tool exchange");

    expect(exchange.complete).toBe(true);
    expect(exchange.missingToolCallIds).toEqual([]);
    expect(exchange.results.map((result) => result.toolCallId)).toEqual(["call_b", "call_a"]);
    expect(exchange.startIndex).toBe(1);
    expect(exchange.endIndex).toBe(3);
    expect(flattenContextUnits(units)).toEqual(history);
  });

  it("represents a trailing partial tool exchange as explicitly incomplete", () => {
    const history: AgentMessage[] = [
      assistant("working", 1, [
        { id: "call_a", name: "read", arguments: { path: "a.txt" } },
        { id: "call_b", name: "read", arguments: { path: "b.txt" } }
      ]),
      toolResult("call_a", "read", "A", 2)
    ];

    const units = buildContextUnits(history);
    const exchange = units[0];

    expect(exchange?.kind).toBe("tool_exchange");
    if (exchange?.kind !== "tool_exchange") throw new Error("expected tool exchange");

    expect(exchange.complete).toBe(false);
    expect(exchange.missingToolCallIds).toEqual(["call_b"]);
    expect(flattenContextUnits(units)).toEqual(history);
  });

  it("can reject a trailing partial exchange in strict mode", () => {
    const history: AgentMessage[] = [
      assistant("working", 1, [
        { id: "call_a", name: "read", arguments: { path: "a.txt" } }
      ])
    ];

    expect(() =>
      buildContextUnits(history, { allowIncompleteFinalToolExchange: false })
    ).toThrow(InvalidContextHistoryError);
  });

  it("rejects an orphan tool result", () => {
    expect(() => buildContextUnits([toolResult("missing", "read", "x", 1)])).toThrow(
      /orphan tool result/
    );
  });

  it("rejects duplicate results for one tool-call id", () => {
    const history: AgentMessage[] = [
      assistant("working", 1, [
        { id: "call_a", name: "read", arguments: { path: "a.txt" } },
        { id: "call_b", name: "read", arguments: { path: "b.txt" } }
      ]),
      toolResult("call_a", "read", "A1", 2),
      toolResult("call_a", "read", "A2", 3)
    ];

    expect(() => buildContextUnits(history)).toThrow(/duplicate tool result/);
  });

  it("rejects duplicate tool-call ids", () => {
    const history: AgentMessage[] = [
      assistant("working", 1, [
        { id: "same", name: "read", arguments: { path: "a.txt" } },
        { id: "same", name: "read", arguments: { path: "b.txt" } }
      ])
    ];

    expect(() => buildContextUnits(history)).toThrow(/duplicate tool-call id/);
  });

  it("rejects a result whose tool name disagrees with the declared call", () => {
    const history: AgentMessage[] = [
      assistant("working", 1, [
        { id: "call_a", name: "read", arguments: { path: "a.txt" } }
      ]),
      toolResult("call_a", "write", "unexpected", 2)
    ];

    expect(() => buildContextUnits(history)).toThrow(/tool result name mismatch/);
  });

  it("rejects a non-tool message before an exchange is complete", () => {
    const history: AgentMessage[] = [
      assistant("working", 1, [
        { id: "call_a", name: "read", arguments: { path: "a.txt" } },
        { id: "call_b", name: "read", arguments: { path: "b.txt" } }
      ]),
      toolResult("call_a", "read", "A", 2),
      user("interrupt", 3)
    ];

    expect(() => buildContextUnits(history)).toThrow(/exchange.*incomplete/);
  });

  it("rejects a result that references another tool-call id inside an open exchange", () => {
    const history: AgentMessage[] = [
      assistant("working", 1, [
        { id: "call_a", name: "read", arguments: { path: "a.txt" } }
      ]),
      toolResult("call_other", "read", "X", 2)
    ];

    expect(() => buildContextUnits(history)).toThrow(/unknown toolCallId/);
  });
});
