import type {
  AgentMessage,
  AssistantMessage,
  ToolResultMessage,
  UserMessage
} from "../core/types.js";
import { InvalidContextHistoryError } from "./errors.js";

interface ContextUnitBase {
  startIndex: number;
  endIndex: number;
  messages: readonly AgentMessage[];
}

export interface UserContextUnit extends ContextUnitBase {
  kind: "user";
  message: UserMessage;
}

export interface AssistantContextUnit extends ContextUnitBase {
  kind: "assistant";
  message: AssistantMessage;
}

export interface ToolExchangeContextUnit extends ContextUnitBase {
  kind: "tool_exchange";
  assistant: AssistantMessage;
  results: readonly ToolResultMessage[];
  complete: boolean;
  missingToolCallIds: readonly string[];
}

export type ContextUnit = UserContextUnit | AssistantContextUnit | ToolExchangeContextUnit;

export interface BuildContextUnitsOptions {
  allowIncompleteFinalToolExchange?: boolean;
}

export function buildContextUnits(
  history: readonly AgentMessage[],
  options: BuildContextUnitsOptions = {}
): ContextUnit[] {
  const allowIncompleteFinalToolExchange = options.allowIncompleteFinalToolExchange ?? true;
  const units: ContextUnit[] = [];
  const seenToolCallIds = new Set<string>();
  const seenToolResultIds = new Set<string>();

  let index = 0;
  while (index < history.length) {
    const message = history[index];
    if (!message) break;

    if (message.role === "user") {
      units.push({
        kind: "user",
        message,
        messages: [message],
        startIndex: index,
        endIndex: index
      });
      index += 1;
      continue;
    }

    if (message.role === "tool") {
      const duplicate = seenToolResultIds.has(message.toolCallId);
      throw new InvalidContextHistoryError(
        duplicate
          ? `duplicate tool result for toolCallId=${message.toolCallId}`
          : `orphan tool result for toolCallId=${message.toolCallId}`
      );
    }

    const assistant = message;
    if (assistant.toolCalls.length === 0) {
      units.push({
        kind: "assistant",
        message: assistant,
        messages: [assistant],
        startIndex: index,
        endIndex: index
      });
      index += 1;
      continue;
    }

    const expected = new Map<string, string>();
    for (const call of assistant.toolCalls) {
      if (expected.has(call.id) || seenToolCallIds.has(call.id)) {
        throw new InvalidContextHistoryError(`duplicate tool-call id=${call.id}`);
      }
      expected.set(call.id, call.name);
      seenToolCallIds.add(call.id);
    }

    const results: ToolResultMessage[] = [];
    const resultIds = new Set<string>();
    let cursor = index + 1;

    while (cursor < history.length) {
      const candidate = history[cursor];
      if (!candidate || candidate.role !== "tool") break;

      const expectedName = expected.get(candidate.toolCallId);
      if (expectedName === undefined) {
        const duplicate = seenToolResultIds.has(candidate.toolCallId) || resultIds.has(candidate.toolCallId);
        throw new InvalidContextHistoryError(
          duplicate
            ? `duplicate tool result for toolCallId=${candidate.toolCallId}`
            : `tool result references unknown toolCallId=${candidate.toolCallId}`
        );
      }

      if (resultIds.has(candidate.toolCallId) || seenToolResultIds.has(candidate.toolCallId)) {
        throw new InvalidContextHistoryError(`duplicate tool result for toolCallId=${candidate.toolCallId}`);
      }

      if (candidate.toolName !== expectedName) {
        throw new InvalidContextHistoryError(
          `tool result name mismatch for toolCallId=${candidate.toolCallId}: expected ${expectedName}, got ${candidate.toolName}`
        );
      }

      results.push(candidate);
      resultIds.add(candidate.toolCallId);
      seenToolResultIds.add(candidate.toolCallId);
      cursor += 1;

      if (resultIds.size === expected.size) break;
    }

    const missingToolCallIds = assistant.toolCalls
      .map((call) => call.id)
      .filter((id) => !resultIds.has(id));
    const complete = missingToolCallIds.length === 0;

    if (!complete && cursor < history.length) {
      const next = history[cursor];
      throw new InvalidContextHistoryError(
        `tool exchange starting at message ${index} is incomplete before ${next?.role ?? "unknown"} message; missing=${missingToolCallIds.join(",")}`
      );
    }

    if (!complete && !allowIncompleteFinalToolExchange) {
      throw new InvalidContextHistoryError(
        `final tool exchange is incomplete; missing=${missingToolCallIds.join(",")}`
      );
    }

    const endIndex = cursor - 1 >= index ? cursor - 1 : index;
    units.push({
      kind: "tool_exchange",
      assistant,
      results,
      complete,
      missingToolCallIds,
      messages: history.slice(index, cursor),
      startIndex: index,
      endIndex
    });
    index = cursor;
  }

  return units;
}

export function flattenContextUnits(units: readonly ContextUnit[]): AgentMessage[] {
  return units.flatMap((unit) => [...unit.messages]);
}
