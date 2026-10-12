import { LLMProviderError } from "../core/errors.js";
import type { AgentMessage, AssistantMessage, JsonValue, ToolCall } from "../core/types.js";
import { randomId } from "../utils/ids.js";
import { makeAssistantMessage, type LLMProvider, type LLMRequest } from "./types.js";

export interface OpenAICompatibleOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

export class OpenAICompatibleLLM implements LLMProvider {
  readonly id: string;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.id = `openai-compatible:${options.model}`;
  }

  async complete(request: LLMRequest): Promise<AssistantMessage> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal: request.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
        ...this.options.headers
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: this.toProviderMessages(request.systemPrompt, request.messages),
        tools: request.tools.length
          ? request.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema
              }
            }))
          : undefined
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new LLMProviderError(`LLM HTTP ${response.status}: ${body.slice(0, 1000)}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const raw = data.choices?.[0]?.message;
    if (!raw) throw new LLMProviderError("LLM response did not contain choices[0].message");

    const toolCalls: ToolCall[] = (raw.tool_calls ?? []).map((call) => {
      const name = call.function?.name;
      if (!name) throw new LLMProviderError("Tool call missing function name");
      return {
        id: call.id ?? randomId("call"),
        name,
        arguments: parseArguments(call.function?.arguments ?? "{}")
      };
    });

    return makeAssistantMessage(raw.content ?? "", toolCalls, this.options.model);
  }

  private toProviderMessages(systemPrompt: string, messages: readonly AgentMessage[]) {
    const result: Array<Record<string, unknown>> = [];
    if (systemPrompt.trim()) result.push({ role: "system", content: systemPrompt });

    for (const message of messages) {
      if (message.role === "user") {
        result.push({ role: "user", content: message.content });
      } else if (message.role === "assistant") {
        result.push({
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.length
            ? message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.arguments) }
              }))
            : undefined
        });
      } else {
        result.push({
          role: "tool",
          tool_call_id: message.toolCallId,
          content: message.content
        });
      }
    }
    return result;
  }
}

function parseArguments(text: string): Record<string, JsonValue> {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("tool arguments must be an object");
    }
    return value as Record<string, JsonValue>;
  } catch (error) {
    throw new LLMProviderError(`Invalid tool arguments JSON: ${text}`, { cause: error });
  }
}
