import type { AgentMessage, AssistantMessage, ToolCall, ToolResultMessage } from "./types.js";

export type AgentEvent =
  | { type: "agent_start"; runId: string; input: string }
  | { type: "turn_start"; runId: string; turn: number }
  | {
      type: "context_prepare_start";
      runId: string;
      turn: number;
      durableMessageCount: number;
    }
  | {
      type: "context_summary_advanced";
      runId: string;
      turn: number;
      summaryId: string;
      previousCoverage: number | null;
      nextCoverage: number;
      newlyCoveredRange: {
        startMessageIndex: number;
        endMessageIndex: number;
      };
    }
  | {
      type: "context_prepared";
      runId: string;
      turn: number;
      modelMessageCount: number;
      estimatedInputTokens: number;
      compacted: boolean;
      durableTailStartMessageIndex: number;
      omittedTailMessageCount: number;
      reducedToolResultCount: number;
      summaryId?: string;
      summaryCoverage?: number;
    }
  | { type: "text_delta"; runId: string; turn: number; delta: string }
  | { type: "assistant_message"; runId: string; turn: number; message: AssistantMessage }
  | { type: "tool_start"; runId: string; turn: number; call: ToolCall }
  | { type: "tool_end"; runId: string; turn: number; result: ToolResultMessage }
  | { type: "message_added"; runId: string; message: AgentMessage }
  | { type: "steering_injected"; runId: string; count: number }
  | { type: "followup_injected"; runId: string; count: number }
  | { type: "turn_end"; runId: string; turn: number }
  | { type: "agent_end"; runId: string; turns: number }
  | { type: "agent_error"; runId: string; error: Error };

export type AgentEventListener = (event: AgentEvent) => void | Promise<void>;

export class EventBus {
  private readonly listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async emit(event: AgentEvent): Promise<void> {
    await Promise.all([...this.listeners].map((listener) => listener(event)));
  }
}
