export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, JsonValue>;
}

export interface UserMessage {
  role: "user";
  content: string;
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: string;
  toolCalls: ToolCall[];
  timestamp: number;
  model?: string;
}

export interface ToolResultMessage {
  role: "tool";
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
  timestamp: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

export interface AgentState {
  systemPrompt: string;
  messages: AgentMessage[];
  running: boolean;
  runId: string | undefined;
  turn: number;
}

export interface AgentRunResult {
  runId: string;
  finalMessage: AssistantMessage;
  turns: number;
  messagesAdded: number;
}
