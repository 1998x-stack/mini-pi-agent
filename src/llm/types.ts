import type { AgentMessage, AssistantMessage, JsonValue, ToolCall } from "../core/types.js";
import type { Tool } from "../core/tool.js";

export interface LLMRequest {
  systemPrompt: string;
  messages: readonly AgentMessage[];
  tools: readonly Tool[];
  signal: AbortSignal;
}

export type LLMStreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: "done"; message?: AssistantMessage };

export interface LLMProvider {
  readonly id: string;
  complete(request: LLMRequest): Promise<AssistantMessage>;
  stream?(request: LLMRequest): AsyncIterable<LLMStreamEvent>;
}

export interface ScriptedAssistantStep {
  content?: string;
  toolCalls?: Array<{
    id?: string;
    name: string;
    arguments?: Record<string, JsonValue>;
  }>;
}

export function makeAssistantMessage(
  content: string,
  toolCalls: ToolCall[] = [],
  model?: string
): AssistantMessage {
  const base: AssistantMessage = {
    role: "assistant",
    content,
    toolCalls,
    timestamp: Date.now()
  };
  return model === undefined ? base : { ...base, model };
}
